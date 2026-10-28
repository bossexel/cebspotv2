const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../remediation/load-client.cjs');

function submissionService(version = 1) {
  const calls = [];
  let saved;
  const supabase = {
    async rpc(name) { calls.push(name); return { data: version, error: null }; },
    from(table) {
      assert.equal(table,'spot_submissions');
      return { insert(payload) {
        saved = payload;
        return { select() { return { async single() { return {data:{id:'post-source',...payload},error:null}; } }; } };
      } };
    },
  };
  const { spotSubmissionService } = load('src/services/spotSubmissionService.ts', {
    '../lib/supabase': {hasSupabaseConfig:true,supabase},
    './mediaCompression': {},
    '../utils/mediaFile': {},
    './imageAnonymization': {imageAnonymizationService:{ async anonymizeImage() { throw Error('Should not upload'); } }},
    './activityService': {activityService:{async logActivity() {}}},
  });
  return { service:spotSubmissionService, calls, saved:()=>saved };
}
const submission = {
  name:'Shared Cafe',description:'My independent caption',category:'Cafe',address:'Lahug',latitude:10.33,longitude:123.9,
  images:[],submitter_id:'bob',reservation_fee:0,spot_id:'confirmed-place',different_place:false,
};

test('submission client preserves the selected listing and caption without calling the legacy publisher', async () => {
  const f = submissionService();
  await f.service.createSubmission(submission,'Bob');
  assert.equal(f.saved().spot_id,'confirmed-place');
  assert.equal(f.saved().description,'My independent caption');
  assert.equal(f.saved().submitter_id,'bob');
  assert.deepEqual(f.calls,['spot_post_workflow_version']);
});

test('posting against an older database stops before upload or insert', async () => {
  const f = submissionService(null);
  await assert.rejects(f.service.createSubmission({...submission,media:[{id:'cover',uri:'file:///photo',type:'image'}]},'Bob'),/database update/);
  assert.equal(f.saved(),undefined);
});

test('post media and spot navigation are read from that post, never a neighbouring submission', async () => {
  const reads = [];
  const supabase = { from(table) {
    assert.equal(table,'local_updates');
    return { select(fields) { return { eq(column,id) {
      reads.push({fields,column,id});
      return {async maybeSingle() {return {data:{media_urls:['bob-only.jpg'],spot_id:'confirmed-place'},error:null};}};
    } }; } };
  } };
  const {localUpdateService} = load('src/services/localUpdateService.ts',{'../lib/supabase':{hasSupabaseConfig:true,supabase}});
  assert.equal(JSON.stringify(await localUpdateService.getPostMedia({id:'bob-post',source_type:'spot_submission',source_id:'bob-submission',image_url:'cover.jpg'})),JSON.stringify(['bob-only.jpg']));
  // Earlier approvals renamed posts to community; paginated rows still need
  // their complete own gallery, including when source_id is absent.
  assert.equal(JSON.stringify(await localUpdateService.getPostMedia({id:'bob-post',source_type:'community',image_url:'cover.jpg'})),JSON.stringify(['bob-only.jpg']));
  assert.equal(await localUpdateService.getLinkedSpotId('bob-post'),'confirmed-place');
  assert.ok(reads.every(read=>read.column==='id' && read.id==='bob-post'));
});
