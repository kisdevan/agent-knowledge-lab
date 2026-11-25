const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/cloud-app.js', 'utf8');

function setup(load) {
  let auth, click;
  const nodes = {}, queue = [];
  function node() { return {id:'', style:{}, innerHTML:'', appendChild(x){if(x.id)nodes[x.id]=x}, remove(){delete nodes[this.id]}}; }
  const side = node();
  const document = {body:node(), querySelector(q){return q === '.side' ? side : (q[0] === '#' ? nodes[q.slice(1)] : null)}, createElement:node, addEventListener(n, fn){if(n === 'click')click=fn}};
  class Sync { constructor(client,user){this.user=user} load(){return load()} async stop(){} }
  const client = {auth:{onAuthStateChange(fn){auth=fn}}};
  const ctx={window:{LAB_CLOUD_CONFIG:{url:'https://example.test',key:'public'},supabase:{createClient(){return client}}}, document, localStorage:{getItem(){return null}}, location:{origin:'https://example.test',pathname:'/'}, LabSync:Sync, LAB_KINDS:['project','research','checks','workspaces'], save(){}, labSave(){}, state:{}, labData:{}, KEY:'k', labKey:'l', esc:String, render(){}, setTimeout(fn){queue.push(fn)}, alert(){}, confirm(){return true}};
  vm.createContext(ctx); vm.runInContext(source,ctx);
  return {nodes, auth:(...a)=>auth(...a), click:(...a)=>click(...a), next:()=>queue.shift()()};
}

(async()=>{
  const guest=setup(async()=>({}));
  assert.match(guest.nodes['lab-account-box'].innerHTML,/로그인 상태와 학습 기록을 확인/);
  guest.auth('INITIAL_SESSION',null); await guest.next();
  assert.match(guest.nodes['lab-account-box'].innerHTML,/로그인 \/ 가입/);

  let resolveLoad; const user=setup(()=>new Promise(resolve=>{resolveLoad=resolve}));
  user.auth('INITIAL_SESSION',{user:{id:'user-1',email:'user@example.test'}});
  const loading=user.next();
  assert.match(user.nodes['lab-account-box'].innerHTML,/로그인 상태와 학습 기록을 확인/);
  assert.doesNotMatch(user.nodes['lab-account-box'].innerHTML,/로그인 \/ 가입/);
  resolveLoad({}); await loading;
  assert.match(user.nodes['lab-account-box'].innerHTML,/user@example.test/);

  let tries=0;const retry=setup(async()=>{if(++tries===1)throw Error('offline');return {}});
  retry.auth('INITIAL_SESSION',{user:{id:'user-1',email:'user@example.test'}}); await retry.next();
  assert.match(retry.nodes['lab-account-box'].innerHTML,/기록 다시 불러오기/);
  assert.doesNotMatch(retry.nodes['lab-account-box'].innerHTML,/로그인 \/ 가입/);
  await retry.click({target:{id:'cloud-retry-load'}});
  assert.match(retry.nodes['lab-account-box'].innerHTML,/user@example.test/);
  console.log('Session loading, guest state, offline retry and restored account verified');
})().catch(e=>{console.error(e);process.exitCode=1});
