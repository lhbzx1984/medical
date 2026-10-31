// Usage: node set-plan.cjs <organ id> <region>
// Tells the loopback synthetic fixture (tests/e2e-server.cjs) which synthetic plan the AI stub returns next. No real service is contacted.
const [organ, region] = process.argv.slice(2);
const plan = { summary: `软件验证用合成方案（${organ}）`, diagnosis: '合成病例', procedureName: '合成演示术式', anesthesia: '演示', position: '演示', approach: '演示',
  region, focusOrgan: organ, instruments: ['手术刀'], steps: [{ name: '演示切开', detail: '软件测试步骤', duration: '10分钟', risk: '测试', keyPoints: ['测试'] }],
  risks: [{ risk: '测试风险', mitigation: '测试措施' }], postop: ['测试观察'], simulationNotes: '仅验证软件行为' };
fetch('http://127.0.0.1:4402/__test/state', { method: 'POST', body: JSON.stringify({ clearRates: true, plan }) })
  .then((r) => r.json()).then((s) => console.log('fixture plan set:', s.plan?.focusOrgan, s.plan?.region))
  .catch((e) => { console.error(e); process.exitCode = 1; });
