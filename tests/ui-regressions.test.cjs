const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./load-ts.cjs');

function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}

const content = {
  summary: '第一版摘要', diagnosis: '第一版诊断', procedureName: '第一版术式',
  anesthesia: '麻醉', position: '体位', approach: '入路', region: '腹腔',
  instruments: ['手术刀'], steps: [{index:1,name:'步骤',detail:'操作',duration:'1分钟',risk:'风险',keyPoints:['要点']}],
  risks: [{risk:'风险',mitigation:'对策'}], postop:['观察'], focusOrgan:'intestine',simulationNotes:'演示'
};
const version = (n) => ({id:'version-'+n,planId:'case-a',version:n,content:{...content,summary:`第${n}版摘要`},changelog:'',source:'ai',knowledgeUsed:[],createdAt:'2026-10-28'});
const detail = {
  plan: {id:'case-a',title:'病例 A',currentVersion:2,status:'simulated'},
  patient:{name:'合成患者',medicalRecord:'合成病历'},
  versions:[version(1),version(2)],feedbacks:[],
  simulations:[{id:'sim-2',version:2,focusOrgan:'intestine',steps:[]}]
};

function planningTree(tab='plan', planDetail=detail) {
  let slot=0;
  const states=[[],planDetail,false,tab,0,0,false,null,null,true,''];
  const hooks={...React,useState(initial){const index=slot++;return [index<states.length?states[index]:typeof initial==='function'?initial():initial,()=>{}];},useEffect(){},useMemo(fn){return fn();},useCallback(fn){return fn;},useRef(){return {current:null};}};
  const {default:Workspace}=loadTs('src/components/planning/PlanningWorkspace.tsx',{
    react:hooks,'next/dynamic':()=>function LazyComponent(){return null;}
  });
  return nodes(Workspace());
}

test('historical version without a matching simulation never plays the latest simulation',()=>{
  const sim=planningTree('sim').find(n=>'simulation' in (n.props||{}));
  assert.ok(sim);
  assert.equal(sim.props.simulation,null);
});

test('guidance context and session identity follow the selected case and version',()=>{
  const chat=planningTree().find(n=>n.props?.mode==='guidance');
  assert.ok(chat);
  assert.match(chat.props.context.planTitle,/v1/);
  assert.equal(chat.props.context.planId,'case-a');
  assert.equal(chat.props.context.planVersion,1);
  assert.match(chat.key,/case-a.*1/);
});

test('an invalid historical focus organ reaches the simulation error instead of crashing its workspace',()=>{
  const broken={...detail,simulations:[{...detail.simulations[0],version:1,focusOrgan:42}]};
  const sim=planningTree('sim',broken).find(n=>'simulation' in (n.props||{}));
  assert.equal(sim.props.simulation.focusOrgan,42);
});

test('invalid historical model content renders a useful error instead of crashing',()=>{
  const {default:PlanDocument}=loadTs('src/components/planning/PlanDocument.tsx');
  const invalid={...version(1),content:{...content,instruments:null,postop:null}};
  const markup=renderToStaticMarkup(React.createElement(PlanDocument,{version:invalid}));
  assert.match(markup,/格式|无法|重新生成/);
});

test('valid historical content still renders the procedure and its steps',()=>{
  const {default:PlanDocument}=loadTs('src/components/planning/PlanDocument.tsx');
  const markup=renderToStaticMarkup(React.createElement(PlanDocument,{version:version(1)}));
  assert.match(markup,/第一版术式/);
  assert.match(markup,/操作/);
  assert.doesNotMatch(markup,/格式不完整/);
});

test('stomach and breast labels preserve their own identities instead of selecting intestine or skin',()=>{
  const {default:Anatomy2D}=loadTs('src/components/learn/Anatomy2D.tsx');
  let selected;
  const tree=nodes(Anatomy2D({sex:'female',selectedId:null,onSelect:id=>selected=id,onClearSelect(){},onEnterCloseup(){}}));
  for(const [name,id] of [['胃','stomach'],['乳腺','breast']]){
    const button=tree.find(n=>n.type==='button'&&nodes(n.props.children).some(child=>child.props?.children===name));
    assert.ok(button);button.props.onClick();assert.equal(selected,id);
  }
});

function learningHarness(initialSex='female') {
  const saved={window:Object.getOwnPropertyDescriptor(global,'window'),localStorage:Object.getOwnPropertyDescriptor(global,'localStorage')};
  const events=new EventTarget(),values=new Map([['mp-sex',initialSex]]),state=[];
  Object.defineProperty(global,'window',{configurable:true,value:events});
  Object.defineProperty(global,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}});
  let index=0,unsubscribe,changed=false;
  const hooks={...React,
    useState(initial){const i=index++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},
    useSyncExternalStore(subscribe,snapshot){unsubscribe??=subscribe(()=>{changed=true;});return snapshot();},
    useMemo(fn){return fn();},useCallback(fn){return fn;},
  };
  const {default:Center}=loadTs('src/components/learn/LearningCenter.tsx',{react:hooks,'next/dynamic':()=>function Lazy(){return null;}});
  const render=()=>{index=0;return nodes(Center());};
  return {render,
    externalSex(value){values.set('mp-sex',value);changed=false;events.dispatchEvent(new Event('storage'));assert.ok(changed);return render();},
    cleanup(){unsubscribe?.();for(const [name,descriptor] of Object.entries(saved)){if(descriptor)Object.defineProperty(global,name,descriptor);else delete global[name];}},
  };
}

const learningChat=tree=>tree.find(n=>n.props?.mode==='learning');
const learningCanvas=tree=>tree.find(n=>n.props?.mode==='organ'&&n.props.organId);
const learningButton=(tree,text)=>tree.find(n=>n.type==='button'&&nodes(n).some(child=>child.props?.children===text));

test('stomach selection opens the sourced closeup and gives the tutor the same organ for both sexes',()=>{
  const {default:Anatomy2D,overviewStructure}=loadTs('src/components/learn/Anatomy2D.tsx');
  assert.equal(overviewStructure('stomach').modelId,'stomach');
  assert.equal(overviewStructure('breast').modelId,null);
  for(const sex of ['male','female']){
    const panel=learningHarness(sex);
    try {
      const overview=panel.render().find(n=>n.props?.onEnterCloseup);
      overview.props.onSelect('stomach');
      const selected=panel.render();
      assert.equal(learningChat(selected).props.context.organId,'stomach');
      let entered;
      const anatomy=nodes(Anatomy2D({sex,selectedId:'stomach',onSelect(){},onClearSelect(){},onEnterCloseup:id=>entered=id}));
      const button=anatomy.find(n=>n.type==='button'&&n.props.children==='进入特写 →');
      assert.ok(button);button.props.onClick();assert.equal(entered,'stomach');
      overview.props.onEnterCloseup(entered);
      const closeup=panel.render();
      assert.equal(learningCanvas(closeup).props.organId,'stomach');
      assert.equal(learningChat(closeup).props.context.organId,'stomach');
      assert.match(learningChat(closeup).props.context.organName,/胃/);
    } finally {panel.cleanup();}
  }
});

test('an external sex update keeps the visible closeup and tutor context on an available organ',()=>{
  const panel=learningHarness();
  try {
    learningButton(panel.render(),'子宫').props.onClick();
    const female=panel.render();
    assert.equal(learningCanvas(female).props.organId,'uterus');
    assert.equal(learningChat(female).props.context.organId,'uterus');
    const male=panel.externalSex('male');
    assert.equal(learningCanvas(male).props.sex,'male');
    assert.equal(learningCanvas(male).props.organId,'heart');
    assert.equal(learningChat(male).props.context.organId,'heart');
    assert.notEqual(learningChat(female).key,learningChat(male).key);
  } finally {panel.cleanup();}
});

test('an external sex update clears overview selections and their tutor context',()=>{
  for(const id of ['uterus','breast']){
    const panel=learningHarness();
    try {
      panel.render().find(n=>n.props?.onEnterCloseup).props.onSelect(id);
      const female=panel.render();
      assert.equal(female.find(n=>n.props?.onEnterCloseup).props.selectedId,id);
      const male=panel.externalSex('male');
      assert.equal(male.find(n=>n.props?.onEnterCloseup).props.selectedId,null);
      assert.match(learningChat(male).props.context.organName,/全身概览/);
      assert.equal(learningChat(male).props.context.organId,undefined);
    } finally {panel.cleanup();}
  }
});

test('an external sex update cannot reuse an atlas structure from the other sex',()=>{
  const panel=learningHarness('male');
  try {
    learningButton(panel.render(),'🧬 精细人体图谱').props.onClick();
    panel.render().find(n=>n.props?.onSelectStructure).props.onSelectStructure({name:'Prostate',systemId:'reproductive',systemZh:'生殖系统',systemDesc:'',conceptId:'prostate',sizeMm:[10,10,10]});
    const male=panel.render();
    assert.match(learningChat(male).props.context.organName,/Prostate/);
    const female=panel.externalSex('female');
    assert.equal(female.find(n=>n.props?.onSelectStructure).props.sex,'female');
    assert.notEqual(male.find(n=>n.props?.onSelectStructure).key,female.find(n=>n.props?.onSelectStructure).key);
    assert.doesNotMatch(learningChat(female).props.context.organName,/Prostate|心脏/);
    assert.match(learningChat(female).props.context.organName,/图谱/);
    assert.notEqual(learningChat(male).key,learningChat(female).key);
  } finally {panel.cleanup();}
});

test('local sex buttons and mode changes preserve matching model and tutor contexts',()=>{
  const panel=learningHarness();
  try {
    learningButton(panel.render(),'子宫').props.onClick();
    learningButton(panel.render(),'♂ 男性').props.onClick();
    const male=panel.render();
    assert.equal(learningCanvas(male).props.organId,'heart');
    assert.equal(learningChat(male).props.context.organId,'heart');
    learningButton(male,'♀ 女性').props.onClick();
    const female=panel.render();
    assert.equal(learningCanvas(female).props.organId,'heart');
    assert.notEqual(learningChat(male).key,learningChat(female).key);
    learningButton(female,'🧬 精细人体图谱').props.onClick();
    const atlas=panel.render();
    assert.match(learningChat(atlas).props.context.organName,/图谱/);
    assert.equal(learningChat(atlas).props.context.organId,undefined);
    assert.notEqual(learningChat(female).key,learningChat(atlas).key);
  } finally {panel.cleanup();}
});

function chatHarness(initialMessages) {
  const state=initialMessages?[initialMessages]:[],refs=[],cleanups=[];
  let stateIndex=0,refIndex=0;
  const hooks={...React,
    useState(initial){const i=stateIndex++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},
    useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},
    useEffect(effect){const cleanup=effect();if(cleanup)cleanups.push(cleanup);}
  };
  const {default:ChatPanel}=loadTs('src/components/chat/ChatPanel.tsx',{
    react:hooks,'react-markdown':()=>null,'remark-gfm':()=>null
  });
  const render=()=>{stateIndex=0;refIndex=0;return nodes(ChatPanel({mode:'learning',quickPrompts:['审查提问']}));};
  return {state,render,unmount(){cleanups.forEach(cleanup=>cleanup());}};
}

test('image generation blocks simultaneous chat and is cancelled when its panel unmounts',async()=>{
  const savedFetch=global.fetch;
  let requests=0,signal;
  global.fetch=(_url,options)=>{requests++;signal=options.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));};
  try {
    const panel=chatHarness(),tree=panel.render();
    const image=tree.find(n=>n.props?.title==='生成教学插图');
    const question=tree.find(n=>n.type==='button'&&n.props?.children==='审查提问');
    const pending=image.props.onClick();
    await question.props.onClick();
    assert.equal(requests,1);
    panel.unmount();
    await pending;
    assert.equal(signal.aborted,true);
    assert.match(panel.state[0].at(-1).content,/已停止生成/);
  } finally {global.fetch=savedFetch;}
});

test('a streamed error preserves partial output and tells the user what failed',async()=>{
  const savedFetch=global.fetch;
  global.fetch=async()=>new Response('data: {"delta":"部分回答"}\n\ndata: {"error":"上游中断"}\n\n');
  try {
    const panel=chatHarness(),tree=panel.render();
    await tree.find(n=>n.type==='button'&&n.props?.children==='审查提问').props.onClick();
    const answer=panel.state[0].at(-1);
    assert.match(answer.content,/部分回答/);
    assert.match(answer.content,/上游中断/);
    assert.equal(answer.error,true);
  } finally {global.fetch=savedFetch;}
});

test('chat history stays within the server message count and JSON byte limits',async()=>{
  const savedFetch=global.fetch;
  let requestBody;
  global.fetch=async(_url,options)=>{requestBody=options.body;return new Response('data: {"delta":"回答"}\n\ndata: {"done":true}\n\n');};
  try {
    const history=Array.from({length:30},(_,i)=>({role:i%2?'assistant':'user',content:'医学'.repeat(2000)+i}));
    const panel=chatHarness(history),tree=panel.render();
    tree.find(n=>n.type==='textarea').props.onChange({target:{value:'审查提问'}});
    await panel.render().find(n=>n.type==='button'&&n.props?.children==='发送').props.onClick();
    const payload=JSON.parse(requestBody);
    assert.ok(payload.messages.length<=24);
    assert.ok(Buffer.byteLength(requestBody)<=120*1024);
    assert.equal(payload.messages.at(-1).content,'审查提问');
  } finally {global.fetch=savedFetch;}
});

test('a question after cancellation retains completed history without sending the failure as an answer',async()=>{
  const savedFetch=global.fetch;
  let requests=0,payload;
  global.fetch=(_url,options)=>{
    if(requests++===0)return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
    payload=JSON.parse(options.body);
    return Promise.resolve(new Response('data: {"delta":"新的回答"}\n\ndata: {"done":true}\n\n'));
  };
  try {
    const previous=[{role:'user',content:'心脏在哪里？'},{role:'assistant',content:'心脏位于纵隔内。'}];
    const panel=chatHarness(previous);
    panel.render().find(n=>n.type==='textarea').props.onChange({target:{value:'血供有哪些？'}});
    const pending=panel.render().find(n=>n.type==='button'&&n.props?.children==='发送').props.onClick();
    panel.render().find(n=>n.type==='button'&&n.props?.children==='停止').props.onClick();
    await pending;
    assert.match(panel.state[0].at(-1).content,/已停止生成/);
    panel.render().find(n=>n.type==='textarea').props.onChange({target:{value:'请重新回答血供问题'}});
    await panel.render().find(n=>n.type==='button'&&n.props?.children==='发送').props.onClick();
    assert.deepEqual(payload.messages,[...previous,{role:'user',content:'血供有哪些？'},{role:'user',content:'请重新回答血供问题'}]);
    assert.equal(panel.state[0].at(-1).content,'新的回答');
  } finally {global.fetch=savedFetch;}
});
