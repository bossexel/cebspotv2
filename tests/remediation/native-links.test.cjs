const {test}=require('node:test');const assert=require('node:assert/strict');
const load=require('./load-client.cjs');
const native=load('app/+native-intent.tsx');

test('external malformed/oversized links are rejected before the legacy query decoder',()=>{
 for(const path of ['cebspot://reservation?id=%FE'.repeat(10000),'cebspot://home?q=%E0%A4','cebspot://home?q=%GG','cebspot://home?q=\0', 'x'.repeat(8193)]){
  assert.equal(native.redirectSystemPath({path,initial:true}),'/');
  assert.equal(native.redirectSystemPath({path,initial:false}),'/');
 }
});

test('valid provider return, encoded contacts, Unicode and OAuth links remain unchanged',()=>{
 for(const path of ['cebspot://reservation-payment?id=66666666-6666-4666-8666-666666666666&status=pending','cebspot://auth/callback#access_token=synthetic&refresh_token=synthetic','cebspot://search?q=Cebu%20City&contact=a%2Bb%40example.test','cebspot://search?q=%E2%9C%93','/']){
  assert.equal(native.redirectSystemPath({path,initial:true}),path);
  assert.equal(native.redirectSystemPath({path,initial:false}),path);
 }
});

test('installed Expo Router invokes the guard for initial and subsequent native links',async()=>{
 let incoming='cebspot://search?q=%E0%A4',subscription;
 const linking=load('node_modules/expo-router/build/link/linking.js',{
  'expo-linking':{getInitialURL:async()=>incoming,createURL:()=> 'cebspot:///',addEventListener:(_event,callback)=>{subscription=callback;return {remove(){}}}},
  'react-native':{Platform:{OS:'android'}},
  '../fork/extractPathFromURL':{},'../fork/getPathFromState':{},'../fork/getStateFromPath':{}
 });
 const {getLinkingConfig}=load('node_modules/expo-router/build/getLinkingConfig.js',{
  '@react-navigation/native':{},'expo-modules-core':{Platform:{OS:'android'}},
  './getReactNavigationConfig':{getReactNavigationConfig:()=>({screens:{}})},
  './link/linking':{...linking,getStateFromPath(){}}
 });
 const context=()=>native;context.keys=()=>['./+native-intent.tsx'];
 const config=getLinkingConfig({}, {}, context, {});
 assert.equal(await config.getInitialURL(),'/');
 const seen=[];config.subscribe(url=>seen.push(url));
 await subscription({url:incoming});assert.deepEqual(seen,['/']);
 incoming='cebspot://reservations?status=pending';
 await subscription({url:incoming});assert.equal(seen[1],incoming);
});
