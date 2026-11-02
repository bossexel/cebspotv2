const {test}=require('node:test');const assert=require('node:assert/strict');const load=require('./load-client.cjs');
function contract(fetch=async()=>Response.json({})) {return load('supabase/functions/_shared/paymongo.ts',{'https://esm.sh/@supabase/supabase-js@2.48.0':{createClient(){}}},{fetch,Response,AbortSignal,btoa,Deno:{env:{get:()=> 'sk_test_fixture'}}});}
test('provider errors expose only a bounded HTTP/code category, never response details',async()=>{
 for(const code of ['parameter_invalid','untrusted-private-value']){
  const c=contract(async()=>Response.json({errors:[{code,detail:'private billing response'}]},{status:400}));
  await assert.rejects(c.paymongoRequest('/v2/checkout_sessions'),e=>{assert.equal(c.paymentFailureCode(e),code==='parameter_invalid'?'provider_400_parameter_invalid':'provider_400_unclassified');assert.doesNotMatch(e.message,/private|billing|untrusted/);return true;});
 }
});
test('checkout mismatch diagnostics name only the failing contract field',()=>{
 const c=contract();const attempt={id:'fixture-attempt',reservation_id:'fixture-reservation',amount:1};
 const resource={id:'cs_fixture',attributes:{livemode:false,reference_number:attempt.reservation_id,metadata:{checkout_attempt_id:attempt.id,reservation_id:attempt.reservation_id},line_items:[{currency:'PHP',amount:100,quantity:1}],checkout_url:'https://checkout.paymongo.com/fixture'}};
 assert.equal(c.checkoutContractFailure(resource,attempt),'unclassified');
 const missing=structuredClone(resource);delete missing.attributes.metadata;
 assert.equal(c.checkoutContractFailure(missing,attempt),'attempt_metadata');
 const live=structuredClone(resource);live.attributes.livemode=true;assert.equal(c.checkoutContractFailure(live,attempt),'test_mode');
});
