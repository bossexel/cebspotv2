const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../remediation/load-client.cjs');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const {
  adjustSpotPostCounts,
  getOptimisticSpotVote,
  getSpotPostSubmissionId,
  setSpotPostCount,
  setSpotPostVote,
} = load('src/utils/spotPostInteractions.ts');
const submissionId = '30000000-0000-4000-8000-000000000001';

test('new and historical approved posts route likes to their original submission', async () => {
  const calls = [];
  const { localUpdateService } = load('src/services/localUpdateService.ts', {
    '../lib/supabase': { hasSupabaseConfig: true, supabase: {
      async rpc(name, args) {
        calls.push([name,args]);
        return { data: [{vote_count: 7,vote_type: 'up',voted: true}], error: null };
      },
    } },
  });
  for (const source_type of ['spot_submission','community']) {
    const post = {source_type,source_id:submissionId,spot_id:'a-different-map-listing'};
    const sourceId = getSpotPostSubmissionId(post);
    assert.equal(sourceId,submissionId);
    const result = await localUpdateService.toggleSpotSubmissionVote(sourceId);
    assert.equal(result.vote_count,7);
    assert.equal(result.vote_type,'up');
    assert.equal(calls.at(-1)[0],'vote_on_spot_submission');
    assert.equal(calls.at(-1)[1].target_submission_id,submissionId);
    assert.equal(calls.at(-1)[1].next_vote_type,'up');
  }
});

test('author like notifications route to the exact Activity post submission', () => {
  const { getUserNotificationRoute } = load('src/services/userNotificationService.ts', {
    'react-native': { Platform: { OS: 'web' } },
    '../constants/colors': { colors: {} },
  });
  const route = getUserNotificationRoute({ type:'spot_liked',target_id:submissionId });
  assert.equal(route.routeType,'activity_post');
  assert.equal(route.submissionId,submissionId);
  assert.equal(getUserNotificationRoute({ type:'spot_liked',target_id:null }),null);
});

test('announcements, recommendations and missing or malformed sources have no like target', () => {
  for (const post of [
    {source_type:'recommendation',source_id:submissionId},
    {source_type:'community',source_id:null},
    {source_type:'community',source_id:'announcement'},
    {source_type:'spot_submission',source_id:''},
    {source_type:'community',source_id:{id:submissionId}},
  ]) assert.equal(getSpotPostSubmissionId(post),null);
});

test('optimistic like rolls back on backend failure and keeps duplicate feed cards in sync', () => {
  const duplicate = {id:'post-copy',source_type:'community',source_id:submissionId,spot_count:4};
  const post = {id:'post',source_type:'spot_submission',source_id:submissionId,spot_count:4};
  const unrelated = {id:'announcement',source_type:'community',source_id:null,spot_count:0};
  const posts = [post,duplicate,unrelated];
  const priorVote = null;
  const submissionVotes = {};
  const optimistic = getOptimisticSpotVote(priorVote);
  assert.equal(optimistic.vote,'up');
  assert.equal(optimistic.delta,1);
  const selectedAfterClick = setSpotPostVote(submissionVotes,submissionId,optimistic.vote);
  assert.equal(selectedAfterClick[submissionId],'up');
  const displayedAfterClick = adjustSpotPostCounts(posts,submissionId,optimistic.delta);
  assert.deepEqual(displayedAfterClick.map(row=>row.spot_count),[5,5,0]);

  // Production applies the inverse delta in its rejected-RPC path and restores
  // the prior selected vote; this models the same state transition.
  const restoredCounts = adjustSpotPostCounts(displayedAfterClick,submissionId,-optimistic.delta);
  const restoredVotes = setSpotPostVote(selectedAfterClick,submissionId,priorVote);
  assert.deepEqual(restoredCounts.map(row=>row.spot_count),[4,4,0]);
  assert.equal(restoredVotes[submissionId],undefined);
  assert.deepEqual(setSpotPostCount(displayedAfterClick,submissionId,9).map(row=>row.spot_count),[9,9,0]);
});

test('actual Activity card enables historical likes, exposes selected state and disables in-flight clicks', () => {
  // Render the actual card declaration; substitute only the native primitives.
  const file = path.join(__dirname,'../../app/activity.tsx');
  const source = ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const card = source.statements.find(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(d=>d.name.getText(source)==='ActivityPostCard'));
  assert.ok(card);
  const helpers = source.statements.filter(statement => ts.isFunctionDeclaration(statement)
    && ['formatSpotScore','isVideoUrl'].includes(statement.name?.text));
  const exports = {};
  const primitive = tag => ({children}) => React.createElement(tag,null,children);
  vm.runInNewContext(ts.transpileModule(
    helpers.map(node=>node.getText(source)).join('\n')+'\n'+card.getText(source)+'\nexports.Card=ActivityPostCard;',
    {compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}},
  ).outputText, {
    exports,React,useState:React.useState,getSpotPostSubmissionId,
    View:primitive('div'),Text:primitive('span'),
    Image:props=>React.createElement('img',{src:props.source,alt:props.accessibilityLabel}),
    User:()=>null,MapPin:()=>React.createElement('span',{'data-icon':'map-pin'}),MessageCircle:()=>null,
    require:assetPath=>{
      if(assetPath.endsWith('/assets/cebspot-logo.png')) return 'cebspot-logo-fixture';
      throw new Error(`Unexpected Activity asset: ${assetPath}`);
    },
    Pressable:props=>React.createElement('button',{
      'aria-label':props.accessibilityLabel,'aria-pressed':props.accessibilityState?.selected,
      disabled:props.disabled,onClick:props.onPress,
    },props.children),
    formatUpdateTime:()=> 'Fixture time',styles:{},colors:{primary:'green'},
  });
  const item={title:'Historical cafe',user_name:'Alice',source_type:'community',source_id:submissionId,
    spot_count:3,comments_count:2,created_at:'2026-10-01T00:00:00Z'};
  const render = (post,extra={})=>renderToStaticMarkup(React.createElement(exports.Card,{
    item:post,appColors:{},currentVote:null,voting:false,onVote(){},onOpen(){},onOpenSpot(){},...extra,
  }));
  assert.match(render(item),/aria-label="Spot Historical cafe" aria-pressed="false">/);
  assert.match(render(item),/data-icon="map-pin"/);
  assert.match(render(item),/3<\/span>/);
  assert.match(render(item,{currentVote:'up'}),/aria-label="Remove Spot from Historical cafe" aria-pressed="true">/);
  assert.match(render(item,{currentVote:'up'}),/<img src="cebspot-logo-fixture" alt="CebSpot liked"\/>/);
  assert.match(render(item,{voting:true}),/aria-label="Spot Historical cafe" aria-pressed="false" disabled=""/);
  assert.match(render({...item,source_id:null}),/aria-label="Spot Historical cafe" aria-pressed="false" disabled=""/);
});

test('older-client toggle endpoint remains supported without swallowing backend failures', async () => {
  const calls = [];
  const forbidden = {code:'42501',message:'Account unavailable'};
  let deny = false;
  const { localUpdateService } = load('src/services/localUpdateService.ts', {
    '../lib/supabase': { hasSupabaseConfig:true,supabase:{
      async rpc(name) {
        calls.push(name);
        if (deny) return {data:null,error:forbidden};
        return name==='vote_on_spot_submission'
          ? {data:null,error:{code:'PGRST202',message:'Could not find the function vote_on_spot_submission'}}
          : {data:[{vote_count:4,voted:false}],error:null};
      },
    } },
  });
  assert.equal((await localUpdateService.toggleSpotSubmissionVote(submissionId)).voted,false);
  assert.deepEqual(calls,['vote_on_spot_submission','toggle_spot_submission_vote']);
  deny=true;
  await assert.rejects(localUpdateService.toggleSpotSubmissionVote(submissionId),error=>error===forbidden);
  assert.equal(calls.length,3);
});
