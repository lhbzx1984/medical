const test = require('node:test');
const assert = require('node:assert/strict');
const {loadTs} = require('./load-ts.cjs');

function authModules(result) {
  return {'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async()=>result,signInWithPassword:async()=>result}})}};
}
function withConfig(action) {
  const old={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_ANON_KEY};
  process.env.SUPABASE_URL='https://local-test.example.invalid';process.env.SUPABASE_ANON_KEY='synthetic-test';
  return Promise.resolve().then(action).finally(()=>{
    for (const [key,value] of [['SUPABASE_URL',old.url],['SUPABASE_ANON_KEY',old.key]]) {
      if (value===undefined) delete process.env[key];else process.env[key]=value;
    }
  });
}
const request=()=>new Request('http://localhost/api/plans',{headers:{authorization:'Bearer local-test'}});

test('Auth service failures and provider throttling retain their status instead of accusing credentials',()=>withConfig(async()=>{
  for (const [error,status] of [[{status:503},503],[{status:0,name:'AuthRetryableFetchError'},503],[{status:429},429]]) {
    const {requireActor}=loadTs('src/lib/auth.ts',authModules({data:{user:null},error}));
    await assert.rejects(requireActor(request()),err=>err.status===status);
    const route=loadTs('src/app/api/auth/route.ts',authModules({data:{session:null},error}));
    const response=await route.POST(new Request('http://localhost/api/auth',{method:'POST',body:JSON.stringify({email:'test@example.invalid',password:'synthetic'})}));
    assert.equal(response.status,status);
  }
}));

test('only verified app metadata grants roles and malformed display names fall back to email',()=>withConfig(async()=>{
  const {requireActor}=loadTs('src/lib/auth.ts',authModules({data:{user:{id:'test-owner',email:'test@example.invalid',
    app_metadata:{role:'user'},user_metadata:{role:'admin',full_name:{unexpected:'object'}}}},error:null}));
  const actor=await requireActor(request());
  assert.equal(actor.role,'user');assert.equal(actor.name,'test@example.invalid');
  await assert.rejects(requireActor(request(),'expert'),err=>err.status===403);
}));

test('expired sessions remain unauthorized rather than service failures',()=>withConfig(async()=>{
  const {requireActor}=loadTs('src/lib/auth.ts',authModules({data:{user:null},error:{status:401}}));
  await assert.rejects(requireActor(request()),err=>err.status===401);
}));

test('cancelling Auth checks remains cancellation when the SDK wraps the fetch error',()=>withConfig(async()=>{
  const controller=new AbortController();controller.abort();
  const {requireActor}=loadTs('src/lib/auth.ts',authModules({data:{user:null},error:{status:0}}));
  await assert.rejects(requireActor(new Request('http://localhost/api/plans',{
    headers:{authorization:'Bearer local-test'},signal:controller.signal})),err=>err.name==='AbortError');
}));
