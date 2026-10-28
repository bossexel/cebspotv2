const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('../remediation/load-client.cjs');
const { mergeActivityNotifications } = load('src/utils/activityNotifications.ts');

test('published admin updates join personal notifications in newest order without becoming map or spot events', () => {
  const privateEvent = {id:'private',user_id:'alice',type:'reservation',created_at:'2026-10-26T10:00:00Z'};
  const update = {id:'notice',isPublished:true,message:'CebSpot update',publishedAt:'2026-10-27T10:00:00Z',updatedAt:'2026-10-27T10:00:00Z'};
  const rows = mergeActivityNotifications([privateEvent],[update,{...update,id:'draft',isPublished:false}]);
  assert.equal(rows.length,2);
  assert.equal(rows[0].type,'admin_update');
  assert.equal(rows[0].content,'CebSpot update');
  assert.equal(rows[0].spot_id,undefined);
  assert.equal(rows[0].user_id,'');
  assert.equal(rows[1],privateEvent);
  assert.equal(privateEvent.type,'reservation');
  assert.equal(mergeActivityNotifications([], [update])[0].id, rows[0].id);
  assert.notEqual(mergeActivityNotifications([], [{...update,updatedAt:'2026-10-27T11:00:00Z'}])[0].id,rows[0].id);
});
