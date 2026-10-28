const {test}=require('node:test'),assert=require('node:assert/strict');
const {getMemberCoordinate,hasRecentLocation}=require('./load-client.cjs')('src/utils/circleLocation.ts');
const now=Date.parse('2026-10-28T12:00:00Z');
const member={location:{lat:10.3,lng:123.9},last_location_update:new Date(now-1000).toISOString()};
test('recent valid coordinates are usable while missing, null, invalid and out-of-range values are not',()=>{
 assert.equal(hasRecentLocation(member,now),true);
 for(const location of [null,{}, {lat:null,lng:null},{lat:NaN,lng:123},{lat:91,lng:120},{lat:10,lng:181},{lat:'10',lng:120}]){
  assert.equal(getMemberCoordinate({...member,location}),null);assert.equal(hasRecentLocation({...member,location},now),false);
 }
 assert.equal(getMemberCoordinate({location:{lat:0,lng:0}}).latitude,0);
});
test('stale, invalid, missing or future timestamps never imply current location',()=>{
 for(const last_location_update of [null,'invalid',new Date(now+1).toISOString(),new Date(now-15*60000-1).toISOString()])assert.equal(hasRecentLocation({...member,last_location_update},now),false);
 assert.equal(hasRecentLocation({...member,last_location_update:new Date(now-15*60000).toISOString()},now),true);
});
