// Actual Edge Function modules and SQL RPCs, with isolated Auth/provider adapters.
// No HTTP request leaves this process. This is not a deployed Supabase test.
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const ts=require('typescript');
const {webcrypto,createHmac,randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../../supabase/functions');
const providerSessions=new Map(),providerIdempotency=new Map();
function fixture(db,{userId,env:overrides={}}={}) {
  const state={failProvider:false,failRetrieval:false,failPersistOnce:false,failDatabase:false,failDbAfterCreationOnce:false,loseProviderResponseOnce:false,liveResponse:false};
  const calls=[],sessions=new Map(),handlers=new Map(),cache=new Map();let sequence=0;
  const prefix=randomUUID().replaceAll('-','');
  const env={SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-server-key',PAYMONGO_SECRET_KEY:'sk_test_fixture',PAYMENT_CHECKOUT_ENABLED:'true',
    PAYMONGO_TEST_WEBHOOK_SECRET:'fixture-webhook-secret',CHECKOUT_RETURN_BASE_URL:'https://admin.fixture.invalid/payment-return.html',
    PAYMENT_WORKER_TOKEN:'fixture-worker-token-of-at-least-32-characters',...overrides};
  async function sql(query,values=[]) {
    if(state.failDatabase)throw Object.assign(Error('Injected database outage'),{code:'08006'});
    const connection=await db.connect();
    try {await db.as(null,connection,'service_role');return await connection.query(query,values);}finally{await connection.end();}
  }
  const identifier=name=>{if(!/^[a-z_]+$/.test(name))throw Error('Unexpected SQL identifier');return name;};
  class Query {
    constructor(table){this.table=identifier(table);this.filters=[];this.columns='*';}
    select(columns='*'){if(!/^[a-z_,*]+$/.test(columns))throw Error('Unexpected selection');this.columns=columns;return this;}
    eq(column,value){this.filters.push({column:identifier(column),value,operator:'='});return this;}
    in(column,value){this.filters.push({column:identifier(column),value,operator:'= any'});return this;}
    gt(column,value){this.filters.push({column:identifier(column),value,operator:'>'});return this;}
    order(column,{ascending=true}={}){this.sort=identifier(column)+(ascending?' asc':' desc');return this;}
    limit(count){this.count=Math.min(count,100);return this;}
    update(value){this.updateValue=value;return this;}
    async single(){const result=await this.execute();return {...result,data:result.data?.[0]??null};}
    async maybeSingle(){return this.single();}
    then(resolve,reject){return this.execute().then(resolve,reject);}
    async execute(){
      try {
        const values=[];let query;
        if(this.updateValue){const assignments=Object.entries(this.updateValue).map(([key,value])=>{values.push(value);return `${identifier(key)}=$${values.length}`});query=`update ${this.table} set ${assignments.join(',')}`;}
        else query=`select ${this.columns} from ${this.table}`;
        const where=this.filters.map(filter=>{values.push(filter.value);return filter.operator==='= any'?`${filter.column}=any($${values.length})`:`${filter.column}${filter.operator}$${values.length}`});
        if(where.length)query+=' where '+where.join(' and ');
        if(this.updateValue)query+=' returning *';else {if(this.sort)query+=' order by '+this.sort;if(this.count)query+=' limit '+this.count;}
        return {data:(await sql(query,values)).rows,error:null};
      } catch(error){return {data:null,error:{code:error.code??'XX000',message:'Injected query failure'}};}
    }
  }
  const client={auth:{async getUser(token){return {data:{user:token==='fixture-auth'?{id:userId}:null},error:null}}},from:table=>new Query(table),
    async rpc(name,args={}){
      if(name==='record_checkout_session'&&state.failPersistOnce){state.failPersistOnce=false;return {data:null,error:{code:'08006'}};}
      try {
        const keys=Object.keys(args);const result=await sql(`select * from ${identifier(name)}(${keys.map((key,i)=>`${identifier(key)} => $${i+1}`).join(',')})`,Object.values(args));
        const data=name==='claim_payment_retirements'?result.rows:result.rows[0]&&Object.keys(result.rows[0]).length===1&&name in result.rows[0]?result.rows[0][name]:result.rows[0];
        return {data,error:null};
      }catch(error){return {data:null,error:{code:error.code??'XX000',message:error.message}};}
    }};
  function load(file) {
    const absolute=path.resolve(root,file);if(cache.has(absolute))return cache.get(absolute);
    const exports={};cache.set(absolute,exports);
    const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:absolute}).outputText;
    vm.runInNewContext(code,{exports,Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,Date,JSON,Math,Error,SyntaxError,AbortSignal,setTimeout,clearTimeout,
      crypto:webcrypto,btoa,console:{log(){},error(){},warn(){}},Deno:{env:{get:name=>env[name]},serve:handler=>handlers.set(file,handler)},
      require:name=>name.startsWith('https://esm.sh/')?{createClient:()=>client}:load(path.relative(root,path.resolve(path.dirname(absolute),name))),
      fetch:async(url,init={})=>{
        const method=init.method??'GET';const key=init.headers?.['Idempotency-Key'];const payload=init.body?JSON.parse(init.body):null;
        calls.push({url,method,key,payload});
        if(state.failProvider)return Response.json({errors:[{code:state.providerErrorCode,detail:'Private provider detail must never escape'}]},{status:state.providerStatus??503});
        if(method==='POST'&&url.endsWith('/v2/checkout_sessions')){
          // A provider call is never allowed to precede the durable attempt/request.
          const attempt=payload?.data?.attributes?.metadata?.checkout_attempt_id;
          const rows=await db.query('select checkout_request from reservation_payments where id=$1',[attempt]);
          if(!rows.rows[0]?.checkout_request)throw Error('Provider reached before durable request');
          let id=providerIdempotency.get(key);
          if(!id){id='cs_fixture_'+prefix+'_'+(++sequence);providerIdempotency.set(key,id);providerSessions.set(id,{id,type:'checkout_session',attributes:{...structuredClone(payload.data.attributes),
            checkout_url:'https://checkout.paymongo.com/'+id,livemode:state.liveResponse,status:'active',payments:[]}});}
          sessions.set(id,providerSessions.get(id));
          if(state.failDbAfterCreationOnce){state.failDbAfterCreationOnce=false;state.failDatabase=true;}
          if(state.loseProviderResponseOnce){state.loseProviderResponseOnce=false;throw Error('Injected lost response after provider creation');}
          const created=structuredClone(sessions.get(id));
          if(state.omitCreationReference)delete created.attributes.reference_number;
          return Response.json({data:created});
        }
        const match=url.match(/\/checkout_sessions\/(cs_[A-Za-z0-9_]+)(\/expire)?$/);const resource=match&&providerSessions.get(match[1]);
        if(!resource||state.failRetrieval)return Response.json({errors:[{detail:'Injected retrieval failure'}]},{status:503});
        if(method==='POST'&&match[2])resource.attributes.status='expired';
        return Response.json({data:structuredClone(resource)});
      },
    },{filename:absolute});return exports;
  }
  async function invoke(name,body={}, {token='fixture-auth',method='POST',headers={}}={}) {
    const file=name+'/index.ts';load(file);return handlers.get(file)(new Request('https://fixture.invalid/'+name,{method,
      headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',...headers},
      ...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}));
  }
  function paid(id,{amount=15000,currency='PHP',paymentId='pay_fixture_'+prefix+'_'+(++sequence)}={}) {
    const resource=sessions.get(id);resource.attributes.payments=[{id:paymentId,type:'payment',attributes:{amount,currency,livemode:false,status:'paid',payment_intent_id:'pi_fixture_'+prefix+'_'+sequence}}];return resource;
  }
  function event(id,{type='checkout_session.payment.paid',eventId='evt_fixture_'+prefix+'_'+(++sequence),live=false,attributes={}}={}) {
    const resource=structuredClone(sessions.get(id));Object.assign(resource.attributes,attributes);
    return {data:{id:eventId,attributes:{type,livemode:live,data:resource}}};
  }
  async function webhook(payload,{timestamp=Math.floor(Date.now()/1000),secret=env.PAYMONGO_TEST_WEBHOOK_SECRET}={}) {
    const raw=JSON.stringify(payload);const signature=createHmac('sha256',secret).update(timestamp+'.'+raw).digest('hex');
    return invoke('paymongo-webhook',raw,{token:'',headers:{'paymongo-signature':`t=${timestamp},te=${signature}`}});
  }
  return {state,calls,sessions,client,invoke,event,webhook,paid,env};
}
module.exports={fixture};
