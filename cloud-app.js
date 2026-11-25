/* Authenticated learning spaces. Local guest data is never uploaded automatically. */
(() => {
  const CONFIG=window.LAB_CLOUD_CONFIG;
  if(!CONFIG || !window.supabase?.createClient || typeof LabSync==='undefined')return;
  const client=window.supabase.createClient(CONFIG.url,CONFIG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  let current=null, loading=false, message='', errorMessage='', status='기기 저장', accountName='', selectedMode='signin';
  const originalSave=save,originalLabSave=labSave;
  let lastSaved={};let generation=0;
  function guestState(){
    let a={},b={};try{a=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){}
    try{b=JSON.parse(localStorage.getItem(labKey)||'{}')||{};}catch(e){}
    return {project:a.project||{},research:a.research||{},checks:a.checks||{},workspaces:b};
  }
  function useDocs(docs){state={project:docs.project||{},research:docs.research||{},checks:docs.checks||{}};labData=docs.workspaces||{};lastSaved={};for(const k of LAB_KINDS)lastSaved[k]=JSON.stringify(docs[k]||{});}
  function currentDocs(){return {project:state.project,research:state.research,checks:state.checks,workspaces:labData};}
  function syncKinds(kinds){if(!current)return false;let ok=true;const docs=currentDocs();for(const kind of kinds){let value=docs[kind]||{};let s=JSON.stringify(value);if(s!==lastSaved[kind]){if(current.set(kind,value))lastSaved[kind]=s;else ok=false;}}return ok;}
  save=function(){return current?syncKinds(['project','research','checks']):originalSave();};
  labSave=function(){return current?syncKinds(['workspaces']):originalLabSave();};
  function paint(){const container=document.querySelector('#lab-account-box');if(!container)return;
    if(current){container.innerHTML='<strong>'+esc(accountName)+'님</strong><div id="cloud-status" style="font-size:12px;margin:6px 0">'+esc(status)+'</div><div class="list"><button class="button light" id="cloud-import-guest">기기 기록 가져오기</button><button class="button light" id="cloud-export-recovery">복구 백업 저장</button><button class="button light" id="cloud-retry">저장 다시 시도</button><button class="button light" id="cloud-logout">로그아웃</button></div>';}
    else container.innerHTML='<strong>학습 기록 계정</strong><p style="font-size:12px;margin:5px 0">로그인하면 내 기록을 다른 기기에서도 이어갈 수 있습니다.</p><button class="button light" id="cloud-open-login">로그인 / 가입</button>';
  }
  function notice(kind,text){status=text;paint();}
  const nav=document.querySelector('.side');const box=document.createElement('section');box.id='lab-account-box';box.style.cssText='margin:20px 4px;padding:14px;border:1px solid #dce4da;border-radius:12px;background:white;font-size:14px';nav?.appendChild(box);paint();
  function dialog(){
    document.querySelector('#lab-auth-modal')?.remove();
    const el=document.createElement('div');el.id='lab-auth-modal';el.style.cssText='position:fixed;inset:0;z-index:9999;background:#0008;display:grid;place-items:center;padding:16px';
    const signing=selectedMode==='signup';
    el.innerHTML='<section role="dialog" aria-modal="true" aria-label="학습 계정" class="panel" style="width:min(100%,460px);max-height:90vh;overflow:auto"><h2>'+(signing?'학습 계정 만들기':'학습 계정 로그인')+'</h2><p>각자의 학습 기록을 안전하게 보관합니다.</p><form id="lab-auth-form" class="list" style="margin-top:18px"><button type="button" class="button light" id="lab-google-login">Google 계정으로 계속하기</button><p style="font-size:12px">Google 로그인은 현재 등록된 테스트 계정만 이용할 수 있습니다. 다른 참여자는 이메일로 가입해 주세요.</p>'+(signing?'<label>이름<input required maxlength="40" name="name" style="display:block;width:100%;padding:8px" autocomplete="name"></label>':'')+'<label>이메일<input required type="email" maxlength="254" name="email" style="display:block;width:100%;padding:8px" autocomplete="email"></label><label>비밀번호<input required minlength="8" type="password" name="password" style="display:block;width:100%;padding:8px" autocomplete="'+(signing?'new-password':'current-password')+'"></label><p id="lab-auth-message" role="status">'+esc(errorMessage||message)+'</p><button class="button" type="submit" '+(loading?'disabled':'')+'>'+(loading?'처리 중…':signing?'가입하기':'로그인')+'</button><button type="button" class="button light" id="lab-auth-switch">'+(signing?'이미 계정이 있어요':'계정 만들기')+'</button><button type="button" class="button light" id="lab-auth-close">닫기</button></form></section>';
    document.body.appendChild(el);
  }
  async function activate(session){
    const mine=++generation;if(!session?.user){if(current)await current.stop();current=null;accountName='';useDocs(guestState());paint();render();return;}
    if(current && current.user===session.user.id)return;
    loading=true;status='클라우드 기록 불러오는 중…';paint();
    const next=new LabSync(client,session.user.id,localStorage,notice);
    try{const docs=await next.load();if(mine!==generation){await next.stop();return;}if(current)await current.stop();current=next;accountName=session.user.user_metadata?.name||session.user.email||'참여자';useDocs(docs);document.querySelector('#lab-auth-modal')?.remove();paint();render();}
    catch(e){current=null;status='불러오기 실패';errorMessage='기록을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.';paint();dialog();}
    finally{loading=false;}
  }
  document.addEventListener('click',async e=>{
    if(e.target.id==='cloud-open-login'){selectedMode='signin';message='';errorMessage='';dialog();}
    if(e.target.id==='lab-google-login'){
      if(loading)return;loading=true;e.target.disabled=true;
      try{const redirectTo=location.origin+location.pathname;const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo}});if(error)throw error;}
      catch(err){loading=false;errorMessage='Google 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.';dialog();}
    }
    if(e.target.id==='lab-auth-close')document.querySelector('#lab-auth-modal')?.remove();
    if(e.target.id==='lab-auth-switch'){selectedMode=selectedMode==='signin'?'signup':'signin';message='';errorMessage='';dialog();}
    if(e.target.id==='cloud-retry' && current){if(!current.retry())alert('다른 기기에서 수정한 내용과 충돌했습니다. 복구 백업을 저장해 주세요.');}
    if(e.target.id==='cloud-export-recovery'&&current)labDownload('agent-lab-recovery.json',JSON.stringify({format:'agent-lab-recovery-v1',data:current.cache},null,2),'application/json;charset=utf-8');
    if(e.target.id==='cloud-import-guest'&&current){
      const guest=guestState();const docs=currentDocs();
      if(LAB_KINDS.some(k=>Object.keys(docs[k]||{}).length)){alert('계정에 이미 기록이 있어 자동으로 가져오지 않았습니다. 기기 기록을 파일로 내보낸 뒤 확인해 주세요.');return;}
      if(!confirm('이 브라우저에 저장된 기존 학습 기록을 현재 계정으로 복사할까요?'))return;
      useDocs(guest);lastSaved={};syncKinds(LAB_KINDS);paint();render();
    }
    if(e.target.id==='cloud-logout'&&current){await current.flush();if(current.problem||Object.keys(current.cache.dirty).length){alert('아직 저장되지 않은 내용이 있습니다. 인터넷 연결을 확인하고 저장을 다시 시도하거나 복구 백업을 저장해 주세요.');return;}await client.auth.signOut();}
  });
  document.addEventListener('submit',async e=>{
    if(e.target.id!=='lab-auth-form')return;e.preventDefault();if(loading)return;
    const f=new FormData(e.target),email=String(f.get('email')||'').trim(),password=String(f.get('password')||''),name=String(f.get('name')||'').trim();
    loading=true;errorMessage='';const submit=e.target.querySelector('[type=submit]');submit.disabled=true;submit.textContent='처리 중…';
    try{
      const res=selectedMode==='signup'?await client.auth.signUp({email,password,options:{data:{name}}}):await client.auth.signInWithPassword({email,password});
      if(res.error)throw res.error;
      if(selectedMode==='signup'&&!res.data.session){message='가입 확인 메일을 확인한 뒤 로그인해 주세요.';loading=false;dialog();return;}
    }catch(err){errorMessage='로그인 또는 가입에 실패했습니다. 입력 정보와 계정 상태를 확인해 주세요.';loading=false;dialog();}
  });
  client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='INITIAL_SESSION')setTimeout(()=>activate(session),0);});
})();
