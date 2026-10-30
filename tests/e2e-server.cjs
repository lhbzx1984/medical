// Loopback-only synthetic Auth/REST/AI fixture; it never contacts external services.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadTs } = require('./load-ts.cjs');
const { MemoryStore } = loadTs('src/lib/store/memory.ts');
const store = new MemoryStore();
const state = { plan: null, refine: null, failChat: false, failAuth: 0, failSimulation: false, failTable: '', slowChat: false, truncatedChat: false, invalidImage: false, cancelled: 0, lastSystem: '' };
const plan = { summary: '软件验证用合成方案', diagnosis: '合成病例', procedureName: '合成演示术式',
  anesthesia: '演示', position: '演示', approach: '演示', region: '盆腔', focusOrgan: 'uterus',
  instruments: ['手术刀'], steps: [{index: 1, name: '演示切开', detail: '软件测试步骤', duration: '10分钟', risk: '测试', keyPoints: ['测试']}],
  risks: [{risk: '测试风险', mitigation: '测试措施'}], postop: ['测试观察'], simulationNotes: '仅验证软件行为' };
const user = (admin) => ({ id: admin ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
  email: admin ? 'audit-admin@example.invalid' : 'audit-user@example.invalid', aud: 'authenticated', role: 'authenticated',
  app_metadata: {role: admin ? 'admin' : 'user'}, user_metadata: {full_name: admin ? '合成专家' : '合成用户'}, created_at: new Date().toISOString() });
const token = (admin) => [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from(JSON.stringify({sub:user(admin).id,exp:2100000000,role:'authenticated'})).toString('base64url'), 'local-fixture-only'].join('.');
const snake = row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key.replace(/[A-Z]/g, m => '_'+m.toLowerCase()),value]));
const camel = row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key.replace(/_([a-z])/g, (_,m) => m.toUpperCase()),value]));
function rows(table) {
  const d = globalThis.__medplanMemDb;
  if (!d) return [];
  const value = {surgical_plans:d.plans,patients:d.patients,plan_versions:d.versions,plan_feedback:d.feedbacks,
    simulations:d.simulations,knowledge_entries:d.knowledge,generated_images:d.images}[table];
  if (!value) throw new Error('Unknown fixture table');
  return [...(value instanceof Map ? value.values() : value)].map(snake);
}
const fixture = http.createServer(async (req,res) => {
  res.setHeader('Content-Type','application/json');
  const json = (value,status=200) => {res.statusCode=status; res.end(JSON.stringify(value));};
  try {
    let raw=''; for await (const chunk of req) raw += chunk;
    const body=raw ? JSON.parse(raw) : {}, url=new URL(req.url,'http://127.0.0.1');
    if (url.pathname === '/__test/state') {
      if (req.method === 'POST') {
        if (body.reset) {
          delete globalThis.__medplanMemDb;globalThis.__medplanRateWindows?.clear();
          Object.assign(state,{plan:null,refine:null,failChat:false,failAuth:0,failSimulation:false,failTable:'',slowChat:false,truncatedChat:false,invalidImage:false,cancelled:0,lastSystem:''});
        }
        if (body.clearRates) globalThis.__medplanRateWindows?.clear(); Object.assign(state,body);
      }
      return json({...state,counts:{messages:globalThis.__medplanMemDb?.chatMessages.length ?? 0,images:globalThis.__medplanMemDb?.images.length ?? 0}});
    }
    if (url.pathname.startsWith('/auth/v1/') && state.failAuth) return json({message:'Synthetic Auth unavailable'},state.failAuth);
    if (url.pathname === '/auth/v1/token') {
      if (body.password !== 'local-fixture-password') return json({error:'invalid_grant',error_description:'Invalid login credentials'},400);
      const admin=body.email === 'audit-admin@example.invalid';
      return json({access_token:token(admin),token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'local-refresh',user:user(admin)});
    }
    if (url.pathname === '/auth/v1/user') {
      const bearer=req.headers.authorization?.slice(7);
      if (![token(true),token(false)].some(t => t.split('.')[1]===bearer?.split('.')[1])) return json({message:'Invalid token'},401);
      return json(user(bearer.split('.')[1]===token(true).split('.')[1]));
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const rpc=url.pathname.split('/').pop(); let result;
      if (rpc==='create_case') {
        const value=await store.createCase({...camel(body.p_patient),ownerId:body.p_owner_id,title:body.p_title});
        result={patient:snake(value.patient),plan:snake(value.plan)};
      } else if (rpc==='commit_plan') {
        const value=await store.commitPlan({planId:body.p_plan_id,ownerId:body.p_owner_id,expectedVersion:body.p_expected_version,
          content:body.p_content,changelog:body.p_changelog,source:body.p_source,knowledgeUsed:body.p_knowledge_used,simulation:body.p_simulation,feedback:body.p_feedback});
        result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,snake(v)]));
      } else if (rpc==='consume_rate_limit') result=await store.consumeRateLimit(body.p_owner_id,body.p_action,body.p_limit,body.p_window_seconds);
      else if (rpc==='ensure_chat_session') {await store.ensureChatSession(body.p_session_id,body.p_mode,body.p_title,body.p_owner_id); result=null;}
      else if (rpc==='append_chat_messages') {await store.addChatMessages(body.p_session_id,body.p_messages,body.p_owner_id); result=null;}
      else throw new Error('Unknown fixture RPC');
      return json(result);
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      const table=url.pathname.split('/').pop();
      if (state.failTable===table) return json({message:'Synthetic database failure',code:'XX000'},500);
      if (req.method==='POST') {
        if (table==='knowledge_entries') await store.addKnowledge(camel(body));
        else if (table==='generated_images') await store.addGeneratedImage(camel(body));
        else throw new Error('Unsupported fixture insert');
        return json(null,201);
      }
      let data=rows(table);
      for (const [key,value] of url.searchParams) if (value.startsWith('eq.')) data=data.filter(row=>String(row[key])===value.slice(3));
      const order=url.searchParams.get('order');
      if (order) {const [key,direction]=order.split('.'); data.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(direction==='desc'?-1:1));}
      return json(data);
    }
    if (url.pathname==='/v1/images/generations') return json({data:[{url:state.invalidImage ? 42 : 'http://127.0.0.1:4401/cases/uterus-thumb.png'}]});
    if (url.pathname==='/v1/chat/completions') {
      state.lastSystem=body.messages?.[0]?.content ?? '';
      if (body.stream) {
        if (state.failChat) return json({error:'SYNTHETIC_UPSTREAM_FAILURE'},503);
        res.setHeader('Content-Type','text/event-stream');
        const delta=text=>'data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\n\n';
        res.write(delta('合成测试回答'));
        if (state.truncatedChat) return res.end();
        if (state.slowChat) {
          const timer=setTimeout(()=>res.end('data: [DONE]\n\n'),10000);
          res.on('close',()=>{clearTimeout(timer);if (!res.writableEnded) state.cancelled++;});
          return;
        }
        return res.end('data: [DONE]\n\n');
      }
      const sim=state.lastSystem.includes('手术模拟编排器');
      if (sim && state.failSimulation) return json({error:'SYNTHETIC_SIM_FAILURE'},503);
      const content=sim ? {steps:[{index:1,name:'定位',narration:'合成测试',view:'overview',durationSec:8,instruments:[],action:'position'},
        {index:2,name:'演示切开',narration:'合成测试',view:'organ',durationSec:8,instruments:['手术刀'],action:'cut'}]}
        : state.lastSystem.includes('反馈意见') ? (state.refine ?? {...plan,changelog:'合成修订说明'}) : (state.plan ?? plan);
      await new Promise(resolve=>setTimeout(resolve,120));
      return json({choices:[{message:{content:JSON.stringify(content)}}]});
    }
    json({error:'Unknown fixture endpoint'},404);
  } catch (error) {json({code:error.name==='StoreConflictError'?'40001':error.name==='StoreAccessError'?'42501':'XX000',message:error.message},error.name==='StoreConflictError'?409:500);}
});
const root=path.resolve(__dirname,'..');
const output=path.resolve(root,process.env.MEDPLAN_TEST_OUTPUT || '../审查结果/修复验证'); fs.mkdirSync(output,{recursive:true});
fixture.listen(4402,'127.0.0.1',()=>{
  const log=fs.openSync(path.join(output,'server.log'),'w');
  const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','4401'],{
    cwd:root,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
      SUPABASE_URL:'http://127.0.0.1:4402',SUPABASE_SERVICE_ROLE_KEY:'local-fixture-service-key',SUPABASE_ANON_KEY:'local-fixture-anon-key',
      NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',AGNES_API_KEY:'local-fixture-key',AGNES_API_BASE_URL:'http://127.0.0.1:4402'}});
  fs.writeFileSync(path.join(output,'fixture.json'),JSON.stringify({fixturePid:process.pid,appPid:child.pid}));
  child.on('exit',code=>{fixture.close();process.exitCode=code || 0;});
  process.on('SIGINT',()=>{child.kill();fixture.close();});
  console.log('Synthetic fixture 127.0.0.1:4402; production app 127.0.0.1:4401');
});
