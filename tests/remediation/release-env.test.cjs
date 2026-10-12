const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate}=require('../../scripts/release-env.cjs');
const ref='abcdefghijklmnopqrst';
const fixture=()=>({CEBSPOT_RUNTIME_ENV:'staging',CEBSPOT_STAGING_PROJECT_REF:ref,EXPO_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,EXPO_PUBLIC_FACE_BLUR_API_URL:'https://face.synthetic.invalid',EXPO_PUBLIC_SUPABASE_ANON_KEY:'.'+Buffer.from('{"role":"anon"}').toString('base64url')+'.synthetic',EXPO_PUBLIC_PAYMONGO_PUBLIC_KEY:'pk_test_synthetic'});
test('release export requires explicit isolated public-only staging configuration',()=>{
 assert.equal(validate(fixture()),true);
 for(const changes of [{CEBSPOT_RUNTIME_ENV:undefined},{CEBSPOT_STAGING_PROJECT_REF:'wrong'},{EXPO_PUBLIC_FACE_BLUR_API_URL:'http://face.synthetic.invalid'},{EXPO_PUBLIC_PAYMONGO_PUBLIC_KEY:'pk_live_synthetic'},{EXPO_PUBLIC_CEBSPOT_TARGET:'admin-web'},{EXPO_PUBLIC_SUPABASE_ANON_KEY:'.'+Buffer.from('{"role":"service_role"}').toString('base64url')+'.synthetic'},{EXPO_PUBLIC_WORKER_TOKEN:'synthetic-private'},{EXPO_PUBLIC_OTHER_KEY:'sk_test_synthetic'}])assert.throws(()=>validate({...fixture(),...changes}));
 assert.throws(()=>validate(fixture(),[fixture().EXPO_PUBLIC_SUPABASE_URL]),/existing hosted backend/);
 assert.throws(()=>validate({...fixture(),EXPO_PUBLIC_OTHER_KEY:'.'+Buffer.from('{"role":"service_role"}').toString('base64url')+'.synthetic'}),/private credential/);
 assert.throws(()=>validate(fixture(),[fixture().EXPO_PUBLIC_FACE_BLUR_API_URL]),/existing hosted backend/);
});
