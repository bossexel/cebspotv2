const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
const roles=load('src/constants/authRoles.ts',{}, {__DEV__:false});
test('privacy and missing-page recovery are available before signup without opening booking or circle routes',()=>{
  for(const route of ['privacy','login','+not-found'])assert.equal(roles.isPublicAndroidRoute(route),true);
  for(const route of ['reservation','checkout','circle','profile','admin-sandbox','admin-studio'])assert.equal(roles.isPublicAndroidRoute(route),false);
  for(const role of ['user','owner','admin'])assert.equal(roles.canAccessRootRoute(role,'privacy'),true);
  assert.equal(roles.getRoleHome('owner'),'/owner-dashboard');assert.equal(roles.getRoleHome('user'),'/');
});
