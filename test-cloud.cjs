const assert=require('node:assert/strict');const {LabSync,LabSyncConflict}=require('./cloud-store.js');
const memory=()=>{let map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}};
function client(){
 const rows=new Map();
 return {rows,from(){let op='',value,filter=[];const q={
   select(){if(!op)op='read';return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},eq(k,v){filter.push([k,v]);return q},single(){return q},
   then(resolve){if(op==='read')return resolve({data:[...rows.values()].filter(x=>filter.every(([k,v])=>x[k]===v)).map(x=>({...x})),error:null});
     if(op==='insert'){const key=value.user_id+':'+value.document_kind;if(rows.has(key))return resolve({data:null,error:{code:'23505'}});let row={...value,revision:1};rows.set(key,row);return resolve({data:{revision:1},error:null});}
     const found=[...rows.values()].filter(x=>filter.every(([k,v])=>x[k]===v));for(const x of found){x.content=value.content;x.revision++}return resolve({data:found.map(x=>({revision:x.revision})),error:null});}
  };return q;}};
}
(async()=>{
 const db=client(),diskA=memory(),diskB=memory();const a=new LabSync(db,'user-a',diskA),b=new LabSync(db,'user-a',diskB);
 await a.load();a.set('project',{title:'original'});assert.equal(await a.flush(),true);assert.equal((await b.load()).project.title,'original');
 a.set('project',{title:'new'});await a.flush();b.set('project',{title:'offline draft'});assert.equal(await b.flush(),false);assert(b.problem instanceof LabSyncConflict);
 assert.equal(db.rows.get('user-a:project').content.title,'new');
 const b2=new LabSync(db,'user-a',diskB);assert.equal((await b2.load()).project.title,'offline draft');assert(b2.problem instanceof LabSyncConflict);
 const c=new LabSync(db,'user-b',memory());assert.deepEqual(await c.load(),{});c.set('project',{title:'private'});await c.flush();assert.equal(db.rows.get('user-a:project').content.title,'new');
 await Promise.all([a.stop(),b.stop(),b2.stop(),c.stop()]);console.log('per-user isolation, storage recovery and conflict retention verified');
})().catch(e=>{console.error(e);process.exitCode=1});
