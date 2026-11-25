const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
let click,authListener,oauthArgs,createdOptions;
const nodes={};
function node(){return {id:'',style:{},innerHTML:'',appendChild(x){if(x.id)nodes[x.id]=x},remove(){delete nodes[this.id]}}}
const side=node(),doc={body:node(),querySelector(q){if(q==='.side')return side;if(q[0]==='#')return nodes[q.slice(1)]||null;return null;},createElement(){return node()},addEventListener(n,fn){if(n==='click')click=fn;}};
const sdk={auth:{onAuthStateChange(fn){authListener=fn},async signInWithOAuth(v){oauthArgs=v;return {error:null}},async signOut(){}}};
const ctx={window:{LAB_CLOUD_CONFIG:{url:'https://project.supabase.co',key:'public'},supabase:{createClient(a,b,c){createdOptions=c;return sdk}}},document:doc,location:{origin:'https://example.org',pathname:'/lab/'},localStorage:{getItem(){return null}},LabSync:class{},LAB_KINDS:['project','research','checks','workspaces'],save:()=>true,labSave:()=>true,state:{},labData:{},KEY:'guest',labKey:'guest-lab',esc:String,render(){},setTimeout,console,alert(){},confirm(){return true}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/cloud-app.js','utf8'),ctx);
(async()=>{assert(authListener);assert.equal(createdOptions.auth.flowType,'pkce');await click({target:{id:'cloud-open-login'}});assert.match(nodes['lab-auth-modal'].innerHTML,/Google 계정으로 계속하기/);const target={id:'lab-google-login'};await click({target});assert.equal(oauthArgs.provider,'google');assert.equal(oauthArgs.options.redirectTo,'https://example.org/lab/');assert.equal(oauthArgs.options.scopes,undefined);console.log('Google login uses PKCE, correct redirect and no Gmail permission scopes');})().catch(e=>{console.error(e);process.exitCode=1});
