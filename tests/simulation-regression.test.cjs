const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadTs } = require('./load-ts.cjs');

const { advancePlayback } = loadTs('src/components/sim/SimulationStage.tsx');
test('manual simulation preview shows operation phase before playback starts', () => {
  assert.equal(typeof advancePlayback,'function','simulation needs one shared playback clock');
  const state=advancePlayback({elapsedSec:0,started:false},1/60,false,8);
  assert.equal(state.progress,0.45);
  assert.equal(state.elapsedSec,0);
  assert.equal(state.completed,false);
});
test('pause preserves playback time and resume completes only the remaining duration', () => {
  assert.equal(typeof advancePlayback,'function','simulation needs one shared playback clock');
  const active=advancePlayback({elapsedSec:0,started:false},6,true,8);
  assert.equal(active.progress,0.75);
  const paused=advancePlayback(active,60,false,8);
  assert.equal(paused.elapsedSec,6);
  assert.equal(paused.progress,0.75);
  const finished=advancePlayback(paused,2,true,8);
  assert.equal(finished.completed,true);
  assert.equal(finished.progress,1);
  assert.equal(advancePlayback(finished,1,true,8).completed,false);
});

function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}

const simulation = {
  id:'sim-a',planId:'case-a',version:1,focusOrgan:'intestine',region:'腹腔',createdAt:'2026-10-30',
  steps:[
    {index:1,name:'定位',narration:'观察术区',view:'overview',durationSec:8,instruments:[],action:'position'},
    {index:2,name:'操作',narration:'操作示范',view:'organ',durationSec:8,instruments:['手术刀'],action:'cut'},
  ],
};

function stageHarness(initial = {}) {
  const refs=[],effects=[];
  let refIndex=0,effectIndex=0;
  const hooks={...React,
    useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},
    useEffect(effect,deps){const i=effectIndex++,prev=effects[i];if(!prev||deps.some((d,j)=>!Object.is(d,prev[j]))){effects[i]=deps;effect();}},
  };
  const {default:Stage}=loadTs('src/components/sim/SimulationStage.tsx',{react:hooks});
  const props={simulation,stepIndex:1,playing:false,onStepIndex(i){props.stepIndex=i;},onPlaying(p){props.playing=p;},...initial};
  const render=()=>{refIndex=0;effectIndex=0;return nodes(Stage(props));};
  return {props,render};
}

test('resuming a paused final simulation step does not jump back to the beginning',()=>{
  const stage=stageHarness();
  stage.render().find(n=>n.type==='button'&&n.props.children==='▶ 播放模拟').props.onClick();
  assert.equal(stage.props.stepIndex,1);
  assert.equal(stage.props.playing,true);
});

test('a completed simulation replays from the first step',()=>{
  const stage=stageHarness({playing:true});
  stage.render().find(n=>typeof n.props?.onComplete==='function').props.onComplete();
  assert.equal(stage.props.playing,false);
  stage.render().find(n=>n.type==='button'&&n.props.children==='▶ 播放模拟').props.onClick();
  assert.equal(stage.props.stepIndex,0);
  assert.equal(stage.props.playing,true);
});

test('invalid historical simulation data shows an error without mounting a 3D stage',()=>{
  for(const invalid of [
    {...simulation,steps:[null]},
    {...simulation,steps:[{...simulation.steps[1],instruments:'手术刀'}]},
    {...simulation,steps:[{...simulation.steps[1],durationSec:NaN}]},
    {...simulation,focusOrgan:42},
  ]){
    const tree=stageHarness({simulation:invalid,stepIndex:0}).render();
    const alert=tree.find(n=>n.props?.role==='alert');
    assert.ok(alert,'invalid persisted data must be explained');
    assert.match(alert.props.children,/格式|重新生成/);
    assert.equal(tree.some(n=>typeof n.props?.onComplete==='function'),false);
  }
});
