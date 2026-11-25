/* Per-user local recovery and optimistic cloud writes. */
const LAB_KINDS = ['project','research','checks','workspaces'];
class LabSyncConflict extends Error {
  constructor(kind){ super('다른 기기에서 수정한 기록이 있습니다: '+kind); this.kind=kind; }
}
class LabSync {
  constructor(client,user,storage,onStatus=()=>{}){
    this.client=client;this.user=user;this.storage=storage;this.onStatus=onStatus;
    this.key='agent-lab-account-v1:'+user;this.cache={docs:{},versions:{},dirty:{}};
    this.active=false;this.running=null;this.timer=null;this.problem=null;
  }
  local(){try{this.storage.setItem(this.key,JSON.stringify(this.cache));return true;}catch(e){this.onStatus('error','이 기기의 임시 저장에 실패했습니다. 기록을 파일로 내보내세요.');return false;}}
  async load(){
    let cached=null;try{cached=JSON.parse(this.storage.getItem(this.key)||'null');}catch(e){}
    const {data,error}=await this.client.from('lab_user_documents').select('document_kind,content,revision').eq('user_id',this.user);
    if(error)throw error;
    let remote={docs:{},versions:{},dirty:{}};
    for(const x of data||[]){if(LAB_KINDS.includes(x.document_kind)){remote.docs[x.document_kind]=x.content;remote.versions[x.document_kind]=x.revision;}}
    for(const kind of LAB_KINDS){
      if(cached?.dirty?.[kind]){
        remote.docs[kind]=cached.docs[kind];remote.dirty[kind]=true;
        if((cached.versions?.[kind]??null)!==(remote.versions[kind]??null)){
          this.problem=new LabSyncConflict(kind);
          if(cached.versions?.[kind]===undefined)delete remote.versions[kind];
          else remote.versions[kind]=cached.versions[kind];
        }
      }
    }
    this.cache=remote;this.active=true;
    if(!this.local())this.problem=new Error('이 기기의 임시 저장 공간을 사용할 수 없습니다.');
    if(this.problem)this.onStatus('conflict','저장되지 않은 기록이 있어 자동 동기화를 중단했습니다. 기록을 내보내고 확인해 주세요.');
    else if(Object.keys(remote.dirty).length)this.schedule();
    else this.onStatus('saved','클라우드에 저장됨');
    return remote.docs;
  }
  set(kind,value){
    if(!this.active || !LAB_KINDS.includes(kind))return false;
    try{this.cache.docs[kind]=JSON.parse(JSON.stringify(value));this.cache.dirty[kind]=true;}
    catch(e){this.onStatus('error','내용을 저장하지 못했습니다. 파일로 내보내세요.');return false;}
    const ok=this.local();if(!ok)return false;
    this.onStatus('pending','저장 중…');this.schedule();return true;
  }
  schedule(){if(!this.active || this.problem)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),800);}
  async flush(){
    if(!this.active||this.problem)return false;
    if(this.running)return this.running;
    this.running=this.run();
    try{return await this.running;}finally{this.running=null;if(this.active&&!this.problem&&Object.keys(this.cache.dirty).length)this.schedule();}
  }
  async run(){
    try{
      for(const kind of LAB_KINDS){
        while(this.active && this.cache.dirty[kind]){
          const snapshot=JSON.stringify(this.cache.docs[kind]);
          const version=this.cache.versions[kind];let response;
          if(version===undefined){
            response=await this.client.from('lab_user_documents').insert({user_id:this.user,document_kind:kind,content:JSON.parse(snapshot)}).select('revision').single();
            if(response.error?.code==='23505')throw new LabSyncConflict(kind);
          }else{
            response=await this.client.from('lab_user_documents').update({content:JSON.parse(snapshot)}).eq('user_id',this.user).eq('document_kind',kind).eq('revision',version).select('revision');
            if(!response.error && response.data?.length!==1)throw new LabSyncConflict(kind);
            if(!response.error)response.data=response.data[0];
          }
          if(response.error)throw response.error;
          this.cache.versions[kind]=response.data.revision;
          if(snapshot===JSON.stringify(this.cache.docs[kind]))delete this.cache.dirty[kind];
          if(!this.local())throw new Error('로컬 복구 저장에 실패했습니다.');
        }
      }
      this.onStatus('saved','클라우드에 저장됨');return true;
    }catch(e){
      this.problem=e;this.local();
      this.onStatus(e instanceof LabSyncConflict?'conflict':'error','클라우드 저장에 실패했습니다. 현재 기록은 이 브라우저에 보관 중입니다.');
      return false;
    }
  }
  retry(){if(this.problem instanceof LabSyncConflict)return false;this.problem=null;this.schedule();return true;}
  async stop(){clearTimeout(this.timer);if(this.running)await this.running;this.active=false;}
}
if(typeof module!=='undefined')module.exports={LabSync,LabSyncConflict,LAB_KINDS};
