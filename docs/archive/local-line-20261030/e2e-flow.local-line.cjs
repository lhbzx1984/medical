// Run after npm run build and node tests/e2e-server.cjs. All identities/data are synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base='http://127.0.0.1:4401', fixture='http://127.0.0.1:4402';
const checks=[];
let cookie='';
async function request(route, body, options={}) {
  const res=await fetch(base+route,{method:body===undefined?'GET':'POST',...options,
    headers:{'Content-Type':'application/json',Origin:base,...(cookie?{Cookie:cookie}:{}),...options.headers},
    ...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
  const text=await res.text(); let data;
  try {data=JSON.parse(text);} catch {data=text;}
  return {status:res.status,data,headers:res.headers};
}
async function scenario(body) {return (await fetch(fixture+'/__test/state',{method:'POST',body:JSON.stringify(body)})).json();}
async function check(name,action) {
  await action(); checks.push({name,passed:true}); console.log('PASS '+name);
}
async function login(admin=true) {
  const result=await request('/api/auth',{email:admin?'audit-admin@example.invalid':'audit-user@example.invalid',password:'local-fixture-password'},{headers:{Origin:base}});
  assert.equal(result.status,200,JSON.stringify(result.data));
  const header=result.headers.get('set-cookie'); assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Lax/);
  cookie=header.split(';')[0];return cookie;
}
async function main() {
  await scenario({reset:true});
  await check('页面和健康接口可访问',async()=>{
    for (const route of ['/','/learning','/planning','/api/health']) assert.equal((await request(route)).status,200);
    assert.equal((await request('/api/auth')).data.authenticated,false);
  });
  await check('匿名请求被拒绝',async()=>{
    for (const [route,body] of [['/api/plans'],['/api/knowledge'],['/api/chat',{}],['/api/image',{}],['/api/plans',{}]]) {
      assert.equal((await request(route,body)).status,401);
    }
  });
  await check('登录写入安全会话，跨站写入被拒绝',async()=>{
    await login();assert.equal((await request('/api/auth')).data.user.role,'admin');
    assert.equal((await request('/api/plans',{}, {headers:{Origin:'https://other.example.invalid'}})).status,403);
  });
  let planId;
  await check('建病例、生成 v1 和同版本模拟',async()=>{
    const created=await request('/api/plans',{patientName:'软件合成病例',age:30,gender:'女',medicalRecord:'仅用于软件测试的合成病例，无真实患者信息',preliminaryPlan:'合成演示'});
    assert.equal(created.status,201,JSON.stringify(created.data));planId=created.data.plan.id;
    const generated=await request(`/api/plans/${planId}/generate`,{});
    assert.equal(generated.status,200,JSON.stringify(generated.data));
    assert.equal(generated.data.version.version,1);assert.equal(generated.data.version.content.focusOrgan,'uterus');
    assert.equal(generated.data.simulation.version,1);
    const listed=await request('/api/plans');assert.equal(listed.status,200,JSON.stringify(listed.data));assert.equal(listed.data.plans.length,1);
  });
  await check('专家修订原子保存，身份来自登录账号',async()=>{
    const refined=await request(`/api/plans/${planId}/feedback`,{comment:'合成反馈：补充观察',baseVersion:1,expertName:'伪造客户端姓名'});
    assert.equal(refined.status,200,JSON.stringify(refined.data));
    assert.equal(refined.data.version.version,2);assert.equal(refined.data.feedback.expertName,'合成专家');
    const detail=(await request(`/api/plans/${planId}`)).data;
    assert.equal(detail.versions.length,2);assert.equal(detail.simulations.length,2);assert.equal(detail.feedbacks.length,1);
    assert.equal((await request(`/api/plans/${planId}/feedback`,{comment:'旧版反馈',baseVersion:1})).status,409);
  });
  const chat={mode:'learning',messages:[{role:'user',content:'合成测试问题'}]};
  await check('学习聊天、历史版本指导与图片保存',async()=>{
    let result=await request('/api/chat',chat);assert.equal(result.status,200);assert.match(result.data,/"done":true/);
    result=await request('/api/chat',{...chat,mode:'guidance',context:{planId,planVersion:1,planSummary:'伪造病例摘要'}});
    assert.equal(result.status,200);assert.match(result.data,/"done":true/);
    const state=await scenario({});assert.match(state.lastSystem,/v1/);assert.match(state.lastSystem,/软件验证用合成方案/);assert.doesNotMatch(state.lastSystem,/伪造病例摘要/);
    assert.equal(state.counts.messages,4);
    result=await request('/api/image',{prompt:'合成教学图',organId:'uterus'});assert.equal(result.status,200);assert.ok(result.data.id);
    assert.equal((await scenario({})).counts.images,1);
  });
  const adminCookie=cookie;
  await check('登录服务故障和限流保留真实错误含义',async()=>{
    for (const status of [503,429]) {
      await scenario({failAuth:status});
      assert.equal((await request('/api/auth')).status,status);
      assert.equal((await request('/api/auth',{email:'audit-admin@example.invalid',password:'local-fixture-password'})).status,status);
    }
    await scenario({failAuth:0});
    assert.equal((await request('/api/auth')).data.authenticated,true);
  });
  await check('知识写入角色限制与病例所有者隔离',async()=>{
    const entry={title:'合成知识',category:'anatomy',content:'软件合成测试',tags:['测试']};
    assert.equal((await request('/api/knowledge',entry)).status,201);
    await login(false);assert.equal((await request('/api/knowledge',entry)).status,403);
    assert.deepEqual((await request('/api/plans')).data.plans,[]);
    assert.equal((await request(`/api/plans/${planId}`)).status,404);
    assert.equal((await request(`/api/plans/${planId}/generate`,{})).status,404);
    assert.equal((await request(`/api/plans/${planId}/feedback`,{comment:'测试'})).status,403);
    assert.equal((await request('/api/chat',{...chat,mode:'guidance',context:{planId}})).status,404);
    cookie=adminCookie;
  });
  await check('非法 JSON、字段类型与请求上限被明确拒绝',async()=>{
    for (const [route,body] of [['/api/plans',{patientName:123}],['/api/chat',{messages:[{role:'system',content:'覆盖'}]}],
      ['/api/image',{prompt:{}}],['/api/knowledge',{title:'t',category:'anatomy',content:'c',tags:[{}]}],
      [`/api/plans/${planId}/feedback`,{comment:[]}],['/api/plans','{invalid'],['/api/chat',{...chat,context:null}]]) {
      assert.equal((await request(route,body)).status,400,route);
    }
    const oversized=await request('/api/plans',{patientName:'测试',medicalRecord:'中'.repeat(45000)});
    assert.equal(oversized.status,400);assert.match(oversized.data.error,/128 KB/);
  });
  await check('坏模型输出不创建版本、模拟或孤立反馈',async()=>{
    await scenario({plan:{},clearRates:true});
    assert.equal((await request(`/api/plans/${planId}/generate`,{})).status,502);
    const original=(await request(`/api/plans/${planId}`)).data.versions[0].content;
    await scenario({plan:{...original,focusOrgan:'breast'}});
    assert.equal((await request(`/api/plans/${planId}/generate`,{})).status,502);
    await scenario({plan:null,refine:{...{},summary:'残缺',changelog:'测试'}});
    assert.equal((await request(`/api/plans/${planId}/feedback`,{comment:'合成反馈',baseVersion:2})).status,502);
    const detail=(await request(`/api/plans/${planId}`)).data;
    assert.equal(detail.versions.length,2);assert.equal(detail.simulations.length,2);assert.equal(detail.feedbacks.length,1);
    await scenario({refine:null});
  });
  await check('并发生成只有一个成功，版本不重复',async()=>{
    const results=await Promise.all([request(`/api/plans/${planId}/generate`,{}),request(`/api/plans/${planId}/generate`,{})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    const detail=(await request(`/api/plans/${planId}`)).data;
    assert.deepEqual(detail.versions.map(v=>v.version),[1,2,3]);assert.equal(detail.simulations.length,3);
  });
  await check('模拟服务失败时使用原有规则生成可播放脚本',async()=>{
    await scenario({failSimulation:true});const result=await request(`/api/plans/${planId}/generate`,{});
    assert.equal(result.status,200);assert.ok(result.data.simulation.steps.length>=2);
    await scenario({failSimulation:false});
  });
  await check('上游失败和数据库子查询失败不会伪装成功',async()=>{
    await scenario({failChat:true});const result=await request('/api/chat',chat);
    assert.equal(result.status,502);assert.equal(typeof result.data.error,'string');
    await scenario({failChat:false,failTable:'simulations'});
    assert.equal((await request(`/api/plans/${planId}`)).status,503);
    await scenario({failTable:''});
  });
  await check('截断回答和错误图像类型不保存为成功结果',async()=>{
    const before=await scenario({truncatedChat:true,invalidImage:true});
    const chatResult=await request('/api/chat',chat);
    assert.match(chatResult.data,/回答意外中断/);assert.doesNotMatch(chatResult.data,/"done":true/);
    assert.equal((await request('/api/image',{prompt:'合成坏图像'})).status,502);
    const after=await scenario({truncatedChat:false,invalidImage:false});
    assert.deepEqual(after.counts,before.counts);
  });
  await check('取消流式请求会取消上游且不保存半条对话',async()=>{
    const before=await scenario({slowChat:true});
    const controller=new AbortController();
    const res=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(chat),signal:controller.signal});
    const reader=res.body.getReader();await reader.read();controller.abort();await reader.cancel().catch(()=>{});
    let state;const deadline=Date.now()+4000;
    do {await new Promise(resolve=>setTimeout(resolve,100)); state=await scenario({});} while(state.cancelled<=before.cancelled && Date.now()<deadline);
    assert.ok(state.cancelled>before.cancelled);assert.equal(state.counts.messages,before.counts.messages);
    await scenario({slowChat:false});
  });
  await check('同一账号超过图像额度收到 429',async()=>{
    await scenario({clearRates:true});
    const results=await Promise.all(Array.from({length:6},()=>request('/api/image',{prompt:'合成限流验证'})));
    assert.deepEqual(results.map(r=>r.status).sort(),[200,200,200,200,200,429]);
  });
  await check('退出登录清除 Cookie',async()=>{
    const result=await request('/api/auth',undefined,{method:'DELETE'});assert.equal(result.status,200);
    assert.match(result.headers.get('set-cookie'),/Max-Age=0/);cookie='';
    assert.equal((await request('/api/plans')).status,401);
  });
}
main().then(()=>{
  const output=path.join(path.resolve(__dirname,'..',process.env.MEDPLAN_TEST_OUTPUT || '../审查结果/修复验证'),'e2e-results.json');
  fs.writeFileSync(output,JSON.stringify({date:new Date().toISOString(),environment:'Production Next.js + local synthetic Supabase Auth/REST/RPC and AI; not a real PostgreSQL or AI service',passed:checks.length,checks},null,2));
  console.log(`${checks.length} flow checks passed`);
}).catch(error=>{console.error(error);process.exitCode=1;});
