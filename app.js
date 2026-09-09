/* FreeChat v1.6.16 — conexão resiliente, WebRTC, feed, segurança e estabilidade */
function serverUrl(){return window.SIGNALING_URL?window.SIGNALING_URL.replace(/\/$/,""):(location.protocol==="https:"?"https://"+location.host:"http://"+location.host)}
(function(){
 const $=id=>document.getElementById(id),
       THEME_ACCENTS=["purple","blue","cyan","green","orange","pink"],
       THEME_NAMES={purple:"Roxo Neon",blue:"Azul",cyan:"Ciano",green:"Verde",orange:"Laranja",pink:"Rosa"},
       applyTheme=()=>{const t=localStorage.getItem("conversaLiveTheme")||"dark",a=localStorage.getItem("conversaLiveAccent")||"purple";document.documentElement.dataset.theme=t;document.documentElement.dataset.accent=a;document.documentElement.classList.toggle("reduce-motion",localStorage.getItem("freechatReduceMotion")==="1");},
       setAccent=a=>{if(!THEME_ACCENTS.includes(a))a="purple";localStorage.setItem("conversaLiveAccent",a);applyTheme();renderThemeChoices?.();},
       toggleTheme=()=>{localStorage.setItem("conversaLiveTheme",(localStorage.getItem("conversaLiveTheme")||"dark")==="dark"?"light":"dark");applyTheme();renderThemeChoices?.();};
 applyTheme();
 document.addEventListener("DOMContentLoaded",()=>{applyTheme();});
 const login=$("login"),menu=$("callMenu"),app=$("app"),email=$("email"),password=$("password"),name=$("name");
let mode="login";
const setStatus=(msg,type="error")=>{const el=$("loginStatus");el.textContent=msg||"";el.className="status "+type};
const setBusy=(el,busy,label)=>{if(!el)return;el.disabled=busy;if(busy){el.dataset.originalText=el.textContent;el.textContent=label||"Aguarde..."}else if(el.dataset.originalText){el.textContent=el.dataset.originalText;delete el.dataset.originalText}};
window.setBusy=setBusy;
const messageEscape=s=>{const d=document.createElement("div");d.textContent=s??"";return d.innerHTML};
window.messageEscape=messageEscape;
/* FreeChat integrated dialogs — substitui confirm()/prompt() nativos do navegador. */
let fcDialogState=null;
function fcDialogClose(result){
  const modal=$("fcDialog");
  if(!modal||!fcDialogState)return;
  const state=fcDialogState;fcDialogState=null;
  modal.classList.add("hidden");
  document.body.classList.remove("fc-dialog-open");
  document.removeEventListener("keydown",fcDialogKeydown,true);
  state.resolve(result);
}
function fcDialogKeydown(e){
  if(e.key==="Escape"){e.preventDefault();fcDialogClose(fcDialogState?.type==="confirm"?false:null)}
  if(e.key==="Enter"&&!e.shiftKey&&fcDialogState){
    const tag=document.activeElement?.tagName?.toLowerCase();
    if(fcDialogState.type==="confirm"||(fcDialogState.type==="prompt"&&tag!=="textarea")){e.preventDefault();fcDialogSubmit();}
  }
}
function fcDialogSubmit(){
  if(!fcDialogState)return;
  if(fcDialogState.type==="prompt"){
    const input=$("fcDialogInput");fcDialogClose(input?.value??"");
  }else fcDialogClose(true);
}
function fcDialogOpen({type="confirm",title="Confirmar ação",message="",confirmText="Confirmar",cancelText="Cancelar",danger=false,kicker="Confirmação",value="",placeholder="",inputLabel="Valor"}={}){
  return new Promise(resolve=>{
    const modal=$("fcDialog"),card=modal?.querySelector(".fc-dialog-card"),inputWrap=$("fcDialogInputWrap"),input=$("fcDialogInput");
    if(!modal){resolve(type==="confirm"?false:null);return;}
    if(fcDialogState)fcDialogClose(type==="confirm"?false:null);
    fcDialogState={type,resolve};
    $("fcDialogKicker").textContent=kicker;
    $("fcDialogTitle").textContent=title;
    $("fcDialogMessage").textContent=message;
    $("fcDialogConfirm").textContent=confirmText;
    $("fcDialogCancel").textContent=cancelText;
    $("fcDialogIcon").textContent=danger?"×":type==="prompt"?"✎":"?";
    $("fcDialogIcon").classList.toggle("danger",!!danger);
    $("fcDialogConfirm").classList.toggle("fc-dialog-danger",!!danger);
    inputWrap.classList.toggle("hidden",type!=="prompt");
    if(type==="prompt"){
      $("fcDialogInputLabel").textContent=inputLabel;
      input.value=value;input.placeholder=placeholder||"";
    }
    modal.classList.remove("hidden");document.body.classList.add("fc-dialog-open");
    document.addEventListener("keydown",fcDialogKeydown,true);
    requestAnimationFrame(()=>{(type==="prompt"?input:card)?.focus?.();});
  });
}
window.fcConfirm=(message,options={})=>fcDialogOpen({type:"confirm",message,...options});
window.fcPrompt=(message,options={})=>fcDialogOpen({type:"prompt",message,...options});
$("fcDialogClose")?.addEventListener("click",()=>fcDialogClose(fcDialogState?.type==="confirm"?false:null));
$("fcDialogCancel")?.addEventListener("click",()=>fcDialogClose(fcDialogState?.type==="confirm"?false:null));
$("fcDialogConfirm")?.addEventListener("click",fcDialogSubmit);
$("fcDialog")?.addEventListener("click",e=>{if(e.target===$("fcDialog"))fcDialogClose(fcDialogState?.type==="confirm"?false:null)});

function modeSet(m){
 mode=m;
 $("loginTab").classList.toggle("active",m==="login");$("registerTab").classList.toggle("active",m==="register");
 $("registerFields").classList.toggle("hidden",m!=="register");$("confirmPasswordWrap").classList.toggle("hidden",m!=="register");
 $("passwordStrength").classList.toggle("hidden",m!=="register");$("loginBtn").classList.remove("hidden");
 $("loginBtn").textContent=m==="register"?"✨ Criar conta":"🚀 Entrar";
 $("authSubtitle").textContent=m==="register"?"Crie sua conta para começar.":"Entre na sua conta para continuar";
 setStatus("");
}


function renderThemeChoices(){
 const box=$("themeChoices");if(!box)return;const active=localStorage.getItem("conversaLiveAccent")||"purple";
 box.innerHTML=THEME_ACCENTS.map(a=>`<button type="button" class="theme-choice ${a===active?"active":""}" data-theme-accent="${a}"><i></i><span>${THEME_NAMES[a]}</span><small>${a===active?"Ativo":"Aplicar"}</small></button>`).join("");
 box.querySelectorAll("[data-theme-accent]").forEach(b=>b.onclick=()=>setAccent(b.dataset.themeAccent));
 const r=$("reduceMotionToggle");if(r)r.checked=localStorage.getItem("freechatReduceMotion")==="1";
}
function securityText(v){const d=document.createElement("div");d.textContent=String(v??"");return d.innerHTML}
async function loadSecuritySettings(){
 try{
  const [sd,pd,bd]=await Promise.all([api("/api/security/sessions"),api("/api/security/privacy"),api("/api/security/blocked")]);
  const box=$("securitySessions");
  if(box){
   box.innerHTML=(sd.sessions||[]).map(x=>{
    const device=x.current?"🟢 Este dispositivo":"💻 "+securityText(x.user_agent);
    const action=x.current?'<span class="security-current">Atual</span>':`<button class="secondary-btn tiny-btn" data-revoke-session="${x.id}">Encerrar</button>`;
    return `<div class="security-item"><div><b>${device}</b><small>Último acesso: ${new Date(x.last_seen_at).toLocaleString()} • expira ${new Date(x.expires_at).toLocaleDateString()}</small></div>${action}</div>`;
   }).join("")||'<span class="muted">Nenhuma sessão ativa.</span>';
   box.querySelectorAll("[data-revoke-session]").forEach(b=>b.onclick=async()=>{try{await api("/api/security/revoke",{method:"POST",body:JSON.stringify({id:b.dataset.revokeSession})});appToast("Sessão encerrada.","success");loadSecuritySettings()}catch(e){appToast(e.message,"error")}});
  }
  if($("privacyMessages"))$("privacyMessages").value=pd.message_policy||"friends";
  if($("privacyCalls"))$("privacyCalls").value=pd.call_policy||"friends";
  if($("privacyFriends"))$("privacyFriends").value=pd.friend_policy||"everyone";
  if($("privacyRandom"))$("privacyRandom").checked=!!pd.random_enabled;
  const bb=$("blockedUsers");
  if(bb){
   bb.innerHTML=(bd.blocked||[]).map(x=>`<div class="security-item"><div><b>🚫 ${securityText(x.name)}</b><small>${securityText(x.code)}</small></div><button class="secondary-btn tiny-btn" data-unblock="${securityText(x.code)}">Desbloquear</button></div>`).join("")||'<span class="muted">Nenhum usuário bloqueado.</span>';
   bb.querySelectorAll("[data-unblock]").forEach(b=>b.onclick=async()=>{try{await api("/api/security/unblock",{method:"POST",body:JSON.stringify({code:b.dataset.unblock})});appToast("Usuário desbloqueado.","success");loadSecuritySettings()}catch(e){appToast(e.message,"error")}});
  }
 }catch(e){$("securityStatus")?.replaceChildren(document.createTextNode(e.message||"Não foi possível carregar a segurança."))}
}
async function changeSecurityPassword(){const status=$("securityStatus");try{setBusy($("changePasswordBtn"),true,"Salvando...");const d=await api("/api/security/password",{method:"POST",body:JSON.stringify({currentPassword:$("currentPassword")?.value||"",newPassword:$("newPassword")?.value||""})});if(status)status.textContent=d.message||"Senha alterada.";$("currentPassword").value="";$("newPassword").value="";appToast("Senha alterada com sucesso.","success");loadSecuritySettings()}catch(e){if(status)status.textContent=e.message||"Erro.";appToast(e.message||"Erro ao alterar senha.","error")}finally{setBusy($("changePasswordBtn"),false)}}
async function savePrivacy(){
 try{
  const payload={message_policy:$("privacyMessages")?.value||"friends",call_policy:$("privacyCalls")?.value||"friends",friend_policy:$("privacyFriends")?.value||"everyone",random_enabled:!!$("privacyRandom")?.checked};
  const btn=$("savePrivacyBtn");setBusy(btn,true,"Salvando...");
  const d=await api("/api/security/privacy",{method:"POST",body:JSON.stringify(payload)});
  if($("privacyMessages"))$("privacyMessages").value=d.message_policy||payload.message_policy;
  if($("privacyCalls"))$("privacyCalls").value=d.call_policy||payload.call_policy;
  if($("privacyFriends"))$("privacyFriends").value=d.friend_policy||payload.friend_policy;
  if($("privacyRandom"))$("privacyRandom").checked=!!d.random_enabled;
  window.freechatPrivacy=d;
  appToast(d.random_enabled?"Preferências salvas. Conhecer alguém está ativado.":"Preferências salvas.","success");
 }catch(e){appToast(e.message||"Não foi possível salvar suas preferências.","error")}finally{setBusy($("savePrivacyBtn"),false)}
}
function openSettings(){const p=$("settingsPanel");if(!p)return;p.classList.remove("hidden");p.setAttribute("aria-hidden","false");renderThemeChoices();loadSecuritySettings();}
function closeSettings(){const p=$("settingsPanel");if(!p)return;p.classList.add("hidden");p.setAttribute("aria-hidden","true");}
window.closeSettings=closeSettings;window.openSettings=openSettings;
function initSettings(){
 $("settingsBtn")?.addEventListener("click",openSettings);$("settingsClose")?.addEventListener("click",closeSettings);$("securityRefresh")?.addEventListener("click",loadSecuritySettings);$("changePasswordBtn")?.addEventListener("click",changeSecurityPassword);$("savePrivacyBtn")?.addEventListener("click",savePrivacy);$("securityRevokeAll")?.addEventListener("click",async()=>{try{await api("/api/security/revoke-all",{method:"POST"});appToast("Outras sessões encerradas.","success");loadSecuritySettings()}catch(e){appToast(e.message,"error")}});
 $("modeToggle")?.addEventListener("click",toggleTheme);
 $("reduceMotionToggle")?.addEventListener("change",e=>{localStorage.setItem("freechatReduceMotion",e.target.checked?"1":"0");applyTheme();});
 $("settingsPanel")?.addEventListener("click",e=>{if(e.target.id==="settingsPanel")closeSettings()});
}
window.renderThemeChoices=renderThemeChoices;
document.addEventListener("DOMContentLoaded",initSettings);
let friendRequestSnapshot=new Set(),friendPollTimer=null,audioNotifyContext=null;

function playFriendNotificationSound(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    audioNotifyContext=audioNotifyContext||new AC();
    if(audioNotifyContext.state==="suspended")audioNotifyContext.resume().catch(()=>{});
    const now=audioNotifyContext.currentTime;
    const gain=audioNotifyContext.createGain();
    gain.gain.setValueAtTime(0.0001,now);
    gain.gain.exponentialRampToValueAtTime(0.055,now+0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+0.23);
    gain.connect(audioNotifyContext.destination);
    const osc=audioNotifyContext.createOscillator();
    osc.type="sine";osc.frequency.setValueAtTime(740,now);
    osc.frequency.exponentialRampToValueAtTime(980,now+0.11);
    osc.connect(gain);osc.start(now);osc.stop(now+0.24);
  }catch(e){}
}
function unlockNotificationAudio(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    audioNotifyContext=audioNotifyContext||new AC();
    if(audioNotifyContext.state==="suspended")audioNotifyContext.resume().catch(()=>{});
  }catch(e){}
}
document.addEventListener("pointerdown",unlockNotificationAudio,{passive:true});
window.playFriendNotificationSound=playFriendNotificationSound;
window.resetCallSoundSeen=function(){callSoundSeen=new Set();};

// Sons curtos e não repetitivos da call.
let callSoundLast=0, callSoundNodes=[], callSoundSeen=new Set();
function stopCallSound(){
  for(const n of callSoundNodes){try{n.osc.stop()}catch(e){} try{n.gain.disconnect()}catch(e){}}
  callSoundNodes=[];
}
function playCallSound(kind,onceKey=""){
  const nowMs=Date.now();
  const key=String(onceKey||kind);
  if(callSoundSeen.has(key))return;
  const cooldown={invite:1800,create:900,join:900,leave:900,"screen-share":1200}[kind]||900;
  if(nowMs-callSoundLast<cooldown)return;
  callSoundSeen.add(key);
  callSoundLast=nowMs;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    audioNotifyContext=audioNotifyContext||new AC();
    const ctx=audioNotifyContext;
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    stopCallSound();
    const patterns={invite:[[660,.09],[880,.12],[1040,.16]],create:[[520,.08],[740,.11],[980,.18]],join:[[620,.08],[820,.16]],leave:[[820,.08],[620,.16]],"screen-share":[[760,.075],[1040,.12]]};
    const pattern=patterns[kind]||patterns.invite;
    let t=ctx.currentTime;
    pattern.forEach(([freq,dur])=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(freq,t);
      gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(0.045,t+0.012);gain.gain.exponentialRampToValueAtTime(0.0001,t+dur);
      osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+dur+0.02);callSoundNodes.push({osc,gain});t+=dur*0.78;
    });
    const total=pattern.reduce((a,x)=>a+x[1]*.78,0)+.3;
    setTimeout(()=>{callSoundNodes=[]},Math.ceil(total*1000)+100);
  }catch(e){}
}
window.playCallSound=playCallSound;

function showFriendToast(name){
  let t=document.getElementById("friendToast");
  if(!t){
    t=document.createElement("div");t.id="friendToast";t.className="friend-toast";
    document.body.appendChild(t);
  }
  t.innerHTML='<span class="friend-toast-icon">👥</span><div><b>Novo convite de amizade</b><small></small></div>';
  t.querySelector("small").textContent=(name||"Alguém")+" enviou uma solicitação para você.";
  t.classList.add("show");
  clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),5200);
  t.onclick=()=>{$("friendsPanel")?.classList.remove("hidden");renderFriends();t.classList.remove("show")};
}
window.showFriendToast=showFriendToast;
async function pollFriendRequests(){
  if(!window.CONVERSA_TOKEN)return;
  try{
    const d=await api("/api/friends");
    const current=new Set((d.requests||[]).map(x=>x.code));
    const isFirst=friendRequestSnapshot.size===0 && !window.CONVERSA_FRIEND_POLL_STARTED;
    window.CONVERSA_FRIEND_POLL_STARTED=true;
    if(!isFirst){
      (d.requests||[]).forEach(u=>{
        if(!friendRequestSnapshot.has(u.code)){
          playFriendNotificationSound();
          showFriendToast(u.name);
        }
      });
    }
    friendRequestSnapshot=current;
    window.friendDirectory=d;
    if($("friendsPanel")&&!$("friendsPanel").classList.contains("hidden"))renderFriends();
  }catch(e){}
}
function startFriendRequestPolling(){
  clearInterval(friendPollTimer);
  friendRequestSnapshot=new Set();
  window.CONVERSA_FRIEND_POLL_STARTED=false;
  pollFriendRequests();
  friendPollTimer=setInterval(pollFriendRequests,5000);
}


function showAuthMain(){
  $("emailRecovery")?.classList.add("hidden");$("resetPasswordBox")?.classList.add("hidden");
  $("loginTab")?.classList.remove("hidden");$("registerTab")?.classList.remove("hidden");
  $("registerFields")?.classList.toggle("hidden",mode!=="register");$("confirmPasswordWrap")?.classList.toggle("hidden",mode!=="register");
  $("passwordStrength")?.classList.toggle("hidden",mode!=="register");
  $("passwordLabel")?.classList.remove("hidden");$("password")?.classList.remove("hidden");$("password")?.closest(".password-wrap")?.classList.remove("hidden");
  $("loginBtn")?.classList.remove("hidden");$("forgotPasswordBtn")?.classList.remove("hidden");
}
function showRecovery(){
  $("emailRecovery")?.classList.remove("hidden");$("resetPasswordBox")?.classList.add("hidden");
  $("loginTab")?.classList.add("hidden");$("registerTab")?.classList.add("hidden");$("registerFields")?.classList.add("hidden");$("confirmPasswordWrap")?.classList.add("hidden");$("passwordStrength")?.classList.add("hidden");
  $("passwordLabel")?.classList.add("hidden");$("password")?.classList.add("hidden");$("password")?.closest(".password-wrap")?.classList.add("hidden");$("loginBtn")?.classList.add("hidden");$("forgotPasswordBtn")?.classList.add("hidden");$("resendVerificationBtn")?.classList.add("hidden");
  $("recoveryEmail").value=email.value.trim().toLowerCase();$("recoveryStatus").textContent="";
}
function showResetPassword(token){
  $("emailRecovery")?.classList.add("hidden");$("resetPasswordBox")?.classList.remove("hidden");
  $("loginTab")?.classList.add("hidden");$("registerTab")?.classList.add("hidden");$("registerFields")?.classList.add("hidden");$("confirmPasswordWrap")?.classList.add("hidden");$("passwordStrength")?.classList.add("hidden");
  $("passwordLabel")?.classList.add("hidden");$("password")?.classList.add("hidden");$("password")?.closest(".password-wrap")?.classList.add("hidden");$("loginBtn")?.classList.add("hidden");$("forgotPasswordBtn")?.classList.add("hidden");$("resendVerificationBtn")?.classList.add("hidden");
  window.FREECHAT_RESET_TOKEN=token;$("resetStatus").textContent="";
}
async function verifyEmailFromUrl(){
  const params=new URLSearchParams(location.search),token=params.get("verify");
  if(!token)return false;
  setStatus("Verificando seu e-mail...","loading");
  try{
    const d=await fetch(serverUrl()+"/api/verify-email?token="+encodeURIComponent(token)).then(async r=>{const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||"Não foi possível verificar o e-mail.");return x});
    history.replaceState({},document.title,location.pathname);
    setStatus(d.message||"E-mail verificado. Agora você pode entrar.","success");
  }catch(e){setStatus(e.message||"Link de verificação inválido.")}
  return true;
}
async function sendRecovery(){
  const em=$("recoveryEmail").value.trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(em)){ $("recoveryStatus").textContent="Digite um e-mail válido.";return; }
  setBusy($("recoverySendBtn"),true,"Enviando...");
  try{
    const d=await authRequest("/api/forgot-password",{email:em},15000);
    $("recoveryStatus").textContent=d.message||"Se houver uma conta, enviaremos as instruções.";
    $("recoveryStatus").className="status success";
  }catch(e){$("recoveryStatus").textContent=e.message||"Não foi possível enviar o e-mail.";$("recoveryStatus").className="status error"}
  finally{setBusy($("recoverySendBtn"),false,"📨 Enviar link")}
}
async function resetPassword(){
  const p=$("resetPassword").value,c=$("resetPasswordConfirm").value;
  if(p.length<10||!/[A-Za-z]/.test(p)||!/[0-9]/.test(p)){ $("resetStatus").textContent="A senha precisa ter pelo menos 10 caracteres e incluir letras e números.";return; }
  if(p!==c){$("resetStatus").textContent="As senhas não coincidem.";return;}
  setBusy($("resetPasswordBtn"),true,"Salvando...");
  try{
    const d=await authRequest("/api/reset-password",{token:window.FREECHAT_RESET_TOKEN,password:p},15000);
    history.replaceState({},document.title,location.pathname);
    showAuthMain();modeSet("login");setStatus(d.message||"Senha redefinida. Agora você pode entrar.","success");
  }catch(e){$("resetStatus").textContent=e.message||"Não foi possível redefinir a senha.";$("resetStatus").className="status error"}
  finally{setBusy($("resetPasswordBtn"),false,"🔐 Redefinir senha")}
}

function showApp(d){
 localStorage.setItem("conversaLiveToken",d.token);localStorage.setItem("conversaLiveUser",JSON.stringify(d.user));
 window.CONVERSA_TOKEN=d.token;window.CONVERSA_USER=d.user;login.classList.add("hidden");menu.classList.remove("hidden");animateMainMenu();
 $("welcomeName").textContent=d.user.name;$("sideWelcomeName").textContent=d.user.name;$("myCode").textContent=d.user.code;$("sideCode").textContent=d.user.code;window.applyAvatar?.($("avatar"),d.user.avatarUrl,d.user.name);window.renderFriends?.();startFriendRequestPolling();connectLobby();
 window.checkAdminAccess?.();
}
function passwordScore(p){let n=0;if(p.length>=6)n++;if(p.length>=10)n++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))n++;if(/\d/.test(p))n++;if(/[^A-Za-z0-9]/.test(p))n++;return Math.min(n,4)}
function updatePasswordStrength(){const p=password.value,score=passwordScore(p),bar=$("strengthBar"),text=$("strengthText");if(!bar||!text)return;bar.style.width=(p?score*25:0)+"%";text.textContent=p?["Muito fraca","Fraca","Razoável","Boa","Forte"][score]:"Digite uma senha";bar.dataset.score=score;text.dataset.score=score}
function togglePasswordField(inputId,buttonId){const input=$(inputId),btn=$(buttonId);if(!input||!btn)return;const visible=input.type==="password";input.type=visible?"text":"password";btn.setAttribute("aria-pressed",String(visible));btn.setAttribute("aria-label",visible?"Ocultar senha":"Mostrar senha");btn.classList.toggle("visible",visible)}
async function authRequest(path,body,timeoutMs){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const r=await fetch(serverUrl()+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:controller.signal});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const err=Error(d.error||"Não foi possível concluir a operação.");Object.assign(err,d);throw err;}
  return d;
 }finally{clearTimeout(timer)}
}
async function auth(){
 const em=email.value.trim().toLowerCase(),pw=password.value,nm=name?.value.trim()||"",confirm=$("confirmPassword")?.value||"";
 if(!/^\S+@\S+\.\S+$/.test(em)){setStatus("Digite um e-mail válido.");email.focus();return}
 if(mode==="register"&&nm.length<2){setStatus("Digite um nome com pelo menos 2 caracteres.");name.focus();return}
 if(mode==="register"&&(pw.length<10||!/[A-Za-z]/.test(pw)||!/[0-9]/.test(pw))){setStatus("A senha precisa ter pelo menos 10 caracteres e incluir letras e números.");password.focus();return}
 if(mode==="register"&&pw!==confirm){setStatus("As senhas não coincidem.");$("confirmPassword").focus();return}
 const btn=$("loginBtn");const path="/api/"+(mode==="register"?"register":"login");
 const body=mode==="register"?{name:nm,email:em,password:pw}:{email:em,password:pw};
 setBusy(btn,true,mode==="register"?"Criando conta...":"Entrando...");setStatus("Conectando ao servidor...","loading");
 try{
  let d;
  try{
   d=await authRequest(path,body,15000);
  }catch(e){
   if(e?.name==="AbortError"||/failed to fetch|networkerror|load failed/i.test(String(e?.message||""))){
    setStatus("O servidor pode estar iniciando. Tentando novamente...","loading");
    d=await authRequest(path,body,30000);
   }else throw e;
  }
  if(mode==="register"&&d.requiresEmailVerification){
   setStatus(d.message||"Conta criada. Verifique seu e-mail antes de entrar.","success");
   $("resendVerificationBtn")?.classList.remove("hidden");
   return;
  }
  showApp(d);
 }catch(e){
  const msg=String(e?.message||"");
  $("resendVerificationBtn")?.classList.toggle("hidden",!(e?.verificationRequired||/confirme seu e-mail/i.test(msg)));
  if(e?.name==="AbortError")setStatus("O servidor não respondeu a tempo. Tente novamente.");
  else if(/failed to fetch|networkerror|load failed/i.test(msg))setStatus("Não foi possível conectar ao servidor. Verifique sua internet e se o backend está no ar.");
  else setStatus(msg||"Não foi possível concluir a operação.");
 }finally{
  setBusy(btn,false,mode==="register"?"✨ Criar conta":"🚀 Entrar");
 }
}
$("loginTab").onclick=()=>modeSet("login");
$("registerTab").onclick=()=>modeSet("register");
$("loginBtn").onclick=auth;
$("forgotPasswordBtn")?.addEventListener("click",showRecovery);
$("recoveryBackBtn")?.addEventListener("click",()=>{showAuthMain();modeSet("login")});
$("resetBackBtn")?.addEventListener("click",()=>{history.replaceState({},document.title,location.pathname);showAuthMain();modeSet("login")});
$("recoverySendBtn")?.addEventListener("click",sendRecovery);
$("resetPasswordBtn")?.addEventListener("click",resetPassword);
$("resendVerificationBtn")?.addEventListener("click",async()=>{
 const em=email.value.trim().toLowerCase();
 setBusy($("resendVerificationBtn"),true,"Enviando...");
 try{const d=await authRequest("/api/resend-verification",{email:em},15000);setStatus(d.message||"Se necessário, enviamos um novo link.","success")}
 catch(e){setStatus(e.message||"Não foi possível reenviar.")}
 finally{setBusy($("resendVerificationBtn"),false,"📩 Reenviar verificação de e-mail")}
});
$("togglePassword").onclick=()=>togglePasswordField("password","togglePassword");
$("toggleConfirmPassword").onclick=()=>togglePasswordField("confirmPassword","toggleConfirmPassword");
password.addEventListener("input",updatePasswordStrength);
$("confirmPassword")?.addEventListener("input",()=>{$("confirmPassword").setCustomValidity(password.value!==$("confirmPassword").value?"As senhas não coincidem.":"")});
[email,password,name,$("confirmPassword")].filter(Boolean).forEach(el=>el.addEventListener("keydown",e=>{if(e.key==="Enter")auth()}));

const resetToken=new URLSearchParams(location.search).get("reset");
if(resetToken){showResetPassword(resetToken)}
else {verifyEmailFromUrl();}
const t=localStorage.getItem("conversaLiveToken"),u=localStorage.getItem("conversaLiveUser");
if(!resetToken&&t&&u)try{
 window.CONVERSA_TOKEN=t;window.CONVERSA_USER=JSON.parse(u);login.classList.add("hidden");menu.classList.remove("hidden");animateMainMenu();
 $("welcomeName").textContent=window.CONVERSA_USER.name;$("sideWelcomeName").textContent=window.CONVERSA_USER.name;$("myCode").textContent=window.CONVERSA_USER.code;$("sideCode").textContent=window.CONVERSA_USER.code;
 window.applyAvatar?.($("avatar"),window.CONVERSA_USER.avatarUrl,window.CONVERSA_USER.name);window.renderFriends?.();startFriendRequestPolling();connectLobby();window.checkAdminAccess?.()
}catch(e){localStorage.removeItem("conversaLiveToken");localStorage.removeItem("conversaLiveUser")}

async function api(path,opts={}){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);let externalAbort;try{if(opts.signal){externalAbort=()=>controller.abort();if(opts.signal.aborted)controller.abort();else opts.signal.addEventListener("abort",externalAbort,{once:true})}const isForm=typeof FormData!=="undefined"&&opts.body instanceof FormData;const baseHeaders={Authorization:"Bearer "+(window.CONVERSA_TOKEN||localStorage.getItem("conversaLiveToken"))};if(!isForm)baseHeaders["Content-Type"]="application/json";const r=await fetch(serverUrl()+path,{...opts,signal:controller.signal,headers:{...baseHeaders,...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(r.status===401){
  window.CONVERSA_SESSION_INVALID=true;
  localStorage.removeItem("conversaLiveToken");
  localStorage.removeItem("conversaLiveUser");
  window.CONVERSA_TOKEN="";
  try{socket?.disconnect?.()}catch(_){ }
  document.getElementById("login")?.classList.remove("hidden");
  document.getElementById("callMenu")?.classList.add("hidden");
  document.getElementById("app")?.classList.add("hidden");
  throw Error(d.error||"Sua sessão não é mais válida. Entre novamente.")
}if(!r.ok)throw Error(d.error||"Erro.");return d}catch(e){if(e?.name==="AbortError")throw Error("O servidor demorou demais para responder. Tente novamente.");throw e}finally{clearTimeout(timeout);if(externalAbort&&opts.signal)opts.signal.removeEventListener("abort",externalAbort)}}
window.api=api;window.conversaApi=api;
let unreadCounts={},unreadInitialized=false;
async function refreshUnreadCounts(){try{const d=await api("/api/messages/unread");const next=d.unread||{};if(unreadInitialized){Object.keys(next).forEach(code=>{const before=Number(unreadCounts[code]||0),after=Number(next[code]||0);if(after>before&&code!==activeFriendCode){const friend=(window.friendDirectory?.friends||[]).find(x=>x.code===code);window.notifyIncomingMessage?.(friend?.name||code,{body:"Nova mensagem"})}})}unreadCounts=next;unreadInitialized=true;window.renderFriends?.()}catch(e){}}
function bumpUnread(code){unreadCounts[code]=(unreadCounts[code]||0)+1;window.renderFriends?.();}
function clearUnread(code){unreadCounts[code]=0;window.renderFriends?.();}
window.refreshUnreadCounts=refreshUnreadCounts;window.bumpUnread=bumpUnread;window.clearUnread=clearUnread;
function applyAvatar(el,avatarUrl,name){
  if(!el)return;
  if(avatarUrl){
    const src=serverUrl()+avatarUrl+(String(avatarUrl).includes("?")?"&":"?")+"_cb="+encodeURIComponent(localStorage.getItem("conversaLiveAvatarVersion")||"");
    el.style.backgroundImage=`url("${src}")`;
    el.style.backgroundSize="cover";el.style.backgroundPosition="center";
    el.textContent="";el.classList.add("has-avatar-photo");
  }else{
    el.style.backgroundImage="";
    el.textContent=(name||"?").trim().charAt(0).toUpperCase()||"?";
    el.classList.remove("has-avatar-photo");
  }
}
window.applyAvatar=applyAvatar;
window.friendDirectory={friends:[],requests:[]};
window.friendSearchTerm="";
function openReportModal(u){
  const modal=$("reportModal");
  if(!modal){appToast("Não foi possível abrir a denúncia.","error");return;}
  modal.dataset.targetCode=u.code;
  $("reportTargetName").textContent=u.name||u.code;
  $("reportReasonSelect").value="";
  $("reportDetailsInput").value="";
  modal.classList.remove("hidden");
}
function closeReportModal(){$("reportModal")?.classList.add("hidden");}
async function submitReport(){
  const modal=$("reportModal");const code=modal?.dataset.targetCode;
  const reason=$("reportReasonSelect")?.value;
  const details=$("reportDetailsInput")?.value.trim();
  if(!code)return;
  if(!reason){appToast("Escolha um motivo para a denúncia.","error");return;}
  const btn=$("reportSubmitBtn");if(btn)btn.disabled=true;
  try{
    await api("/api/security/report",{method:"POST",body:JSON.stringify({code,reason,details})});
    appToast("Denúncia registrada. Nossa equipe vai revisar.","success");
    closeReportModal();
  }catch(e){appToast(e.message,"error")}
  finally{if(btn)btn.disabled=false}
}
window.closeReportModal=closeReportModal;
$("reportClose")?.addEventListener("click",closeReportModal);
$("reportCancelBtn")?.addEventListener("click",closeReportModal);
$("reportSubmitBtn")?.addEventListener("click",submitReport);
window.renderFriends=async()=>{
 let d;try{d=await api("/api/friends")}catch(e){d=window.friendDirectory||{friends:[],requests:[]}};window.friendDirectory=d;
 [$("friendsList"),$("friendsAppList")].filter(Boolean).forEach(list=>{
  list.innerHTML="";const term=String(window.friendSearchTerm||"").trim().toLowerCase(),requests=d.requests||[],friends=(d.friends||[]).filter(u=>!term||String(u.name||"").toLowerCase().includes(term)||String(u.code||"").toLowerCase().includes(term));
  if(list.id==="friendsList"&&requests.length){const t=document.createElement("div");t.className="friends-section-title";t.innerHTML="<span>Solicitações</span><small>"+requests.length+"</small>";list.appendChild(t);
   requests.forEach(u=>{const x=document.createElement("div");x.className="friend-item friend-request";x.innerHTML='<div class="friend-avatar"></div><div class="friend-info"><b></b><small></small></div><button class="accept-friend-btn">Aceitar</button><button class="reject-friend-btn">×</button>';window.applyAvatar?.(x.querySelector(".friend-avatar"),u.avatarUrl,u.name);x.querySelector("b").textContent=u.name||"Usuário";x.querySelector("small").textContent=u.code+" • enviou um convite";x.querySelector(".accept-friend-btn").onclick=async()=>{try{await api("/api/friends/accept",{method:"POST",body:JSON.stringify({code:u.code})});appToast("Convite aceito!","success");renderFriends()}catch(e){appToast(e.message,"error")}};x.querySelector(".reject-friend-btn").onclick=async()=>{try{await api("/api/friends/reject",{method:"POST",body:JSON.stringify({code:u.code})})}catch(e){}renderFriends()};list.appendChild(x)})}
  if(friends.length){const t=document.createElement("div");t.className="friends-section-title";t.innerHTML="<span>Amigos</span><small>"+friends.length+"</small>";list.appendChild(t)}
  friends.forEach(u=>{
    const online=!!u.online||[...people.values()].some(p=>p.code===u.code),unread=Number(unreadCounts[u.code]||0);
    const x=document.createElement("div");x.className="friend-item";
    x.innerHTML='<div class="friend-avatar"></div><span class="friend-dot"></span><div class="friend-info"><b></b><small></small></div><span class="friend-unread" hidden></span><button class="message-friend-btn" title="Mensagem">💬</button><button class="friend-call-btn" title="Chamar para call">📞</button><button class="friend-block-btn" title="Bloquear">🚫</button><button class="friend-report-btn" title="Denunciar">⚑</button><button class="remove-friend-btn" title="Remover">×</button>';
    window.applyAvatar?.(x.querySelector(".friend-avatar"),u.avatarUrl,u.name);
    x.querySelector(".friend-dot").classList.toggle("online",online);
    x.querySelector("b").textContent=u.name||"Usuário";
    x.querySelector("small").textContent=online?"● Online":"○ Offline";
    const b=x.querySelector(".friend-unread");if(unread){b.textContent=unread>99?"99+":String(unread);b.hidden=false}
    x.querySelector(".message-friend-btn").onclick=()=>openMessages(u);
    const callBtn=x.querySelector(".friend-call-btn");
    if(!online){callBtn.disabled=true;callBtn.title="Amigo offline — não é possível chamar agora"}
    callBtn.onclick=()=>{const newRoom=makeCallCode();openApp(newRoom,true);inviteFriendToCall(u.code,newRoom,u.name)};
    x.querySelector(".friend-block-btn").onclick=async()=>{
      if(!await fcConfirm("Você não vai mais conseguir se comunicar com esta pessoa. Ela também não poderá ver seu perfil.",{title:"Bloquear "+(u.name||"este usuário")+"?",confirmText:"Bloquear",danger:true,kicker:"Segurança"}))return;
      try{await api("/api/security/block",{method:"POST",body:JSON.stringify({code:u.code})});appToast("Usuário bloqueado.","success");renderFriends()}
      catch(e){appToast(e.message,"error")}
    };
    x.querySelector(".friend-report-btn").onclick=()=>openReportModal(u);
    x.querySelector(".remove-friend-btn").onclick=async()=>{if(!await fcConfirm("Esta pessoa será removida da sua lista de amigos.",{title:"Remover "+(u.name||"este amigo")+"?",confirmText:"Remover",danger:true,kicker:"Amizade"}))return;try{await api("/api/friends/remove",{method:"POST",body:JSON.stringify({code:u.code})});delete unreadCounts[u.code];appToast("Amigo removido");renderFriends()}catch(e){appToast(e.message,"error")}};
    list.appendChild(x);
  });
  if(!friends.length&&!(list.id==="friendsList"&&requests.length)){const q=document.createElement("div");q.className="friends-empty";q.innerHTML='<div class="friends-empty-icon">👥</div><b>'+(term?"Nenhum resultado":"Sua lista está vazia")+'</b><small>'+(term?"Tente outro nome ou código.":"Adicione amigos pelo código.")+'</small>';list.appendChild(q)}
 });
};async function addFriend(input,status){const code=input.value.trim().toUpperCase();if(!/^CL-[A-Z0-9]{6}$/.test(code)){status.textContent="Código inválido. Use CL-XXXXXX.";return}try{const d=await api("/api/friends/request",{method:"POST",body:JSON.stringify({code})});status.textContent=d.message||"Convite enviado!";input.value="";renderFriends()}catch(e){status.textContent=e.message}}
 $("addFriendBtn").onclick=()=>addFriend($("friendCodeInput"),$("friendStatus"));$("addFriendApp").onclick=()=>addFriend($("friendCodeApp"),$("friendAppStatus"));$("refreshFriends").onclick=window.renderFriends;$("friendsBtn").onclick=()=>{$("friendsPanel").classList.remove("hidden");renderFriends()};$("friendsClose").onclick=()=>$('friendsPanel').classList.add("hidden");$("copyUserCode").onclick=()=>navigator.clipboard?.writeText($("myCode").textContent);refreshUnreadCounts();
 $("logoutBtn").onclick=async()=>{clearInterval(friendPollTimer);try{await api("/api/logout",{method:"POST"})}catch(e){}try{socket?.disconnect?.();}catch(e){}localStorage.removeItem("conversaLiveToken");localStorage.removeItem("conversaLiveUser");window.CONVERSA_TOKEN="";location.href=location.pathname}; 
 function makeCallCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let c="";for(let i=0;i<6;i++)c+=chars[Math.floor(Math.random()*chars.length)];return c;}
 function openApp(targetRoom,autoCall=true){
   const c=String(targetRoom||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,32);if(!c)return;
   const n=window.CONVERSA_USER?.name||localStorage.getItem("conversaLiveName")||"Visitante";
   window.CONVERSA_AUTO_CALL=!!autoCall;$("callMenu").classList.add("hidden");$("joinBox")?.classList.add("hidden");
   try{history.replaceState(null,"","?room="+encodeURIComponent(c))}catch(e){}
   joinRoom(c,n);
 }
 $("createCallBtn").onclick=()=>{const c=makeCallCode();$("roomCodeInput").value=c;openApp(c,true)};
 $("joinCallBtn").onclick=()=>{$("joinBox").classList.toggle("hidden");if(!$("joinBox").classList.contains("hidden"))$("roomCodeInput").focus()};
 $("confirmJoinBtn").onclick=()=>{const c=$("roomCodeInput").value.trim().toUpperCase();if(c)openApp(c,true)};
 $("roomCodeInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("confirmJoinBtn").click()});
 window.openApp=openApp;
})();
const $=id=>document.getElementById(id);
window.addEventListener("unhandledrejection",e=>{console.warn("FreeChat unhandled rejection",e.reason);if(e.reason?.name!=="AbortError")appToast("Algo demorou mais que o esperado. Tente novamente.","error")});
window.addEventListener("error",e=>{console.warn("FreeChat runtime error",e.error||e.message)});

function appToast(msg,type="info"){
  let t=document.getElementById("appToast");
  if(!t){t=document.createElement("div");t.id="appToast";t.className="app-toast";document.body.appendChild(t);}
  t.textContent=msg||"";
  t.dataset.type=type;
  t.classList.add("show");
  clearTimeout(t._hideTimer);
  t._hideTimer=setTimeout(()=>t.classList.remove("show"),3200);
}
function inviteFriendToCall(code,targetRoom,friendName){
  if(!socket?.connected){appToast("Conectando... tente novamente em instantes.","error");return;}
  socket.emit("call-invite",{code,room:targetRoom},res=>{
    if(res?.ok)appToast("Convite de call enviado para "+(friendName||"seu amigo")+"! 📞","success");
    else appToast(res?.error||"Não foi possível enviar o convite.","error");
  });
}
function showCallInvite(invitedRoom,fromCode,fromName){
  let el=document.getElementById("callInviteBanner");
  if(!el){
    el=document.createElement("div");el.id="callInviteBanner";el.className="call-invite-banner";
    el.innerHTML='<div class="call-invite-icon">📞</div><div class="call-invite-info"><b></b><small>está te chamando para uma call</small></div><button class="call-invite-accept" type="button">Aceitar</button><button class="call-invite-decline" type="button">✕</button>';
    document.body.appendChild(el);
  }
  el.querySelector("b").textContent=fromName||"Alguém";
  clearTimeout(el._timer);
  const cleanup=()=>{el.classList.remove("show")};
  el.querySelector(".call-invite-accept").onclick=()=>{cleanup();window.openApp?window.openApp(invitedRoom,true):window.dispatchEvent(new CustomEvent("conversa:open-room",{detail:{room:invitedRoom}}))};
  el.querySelector(".call-invite-decline").onclick=()=>{cleanup();socket?.emit("call-invite-decline",{toCode:fromCode,room:invitedRoom})};
  el.classList.add("show");
  window.playFriendNotificationSound?.();
  el._timer=setTimeout(cleanup,20000);
}
const ICE={
  iceServers:[
    {urls:"stun:stun.l.google.com:19302"},
    {urls:"stun:stun1.l.google.com:19302"},
    {urls:"stun:stun.cloudflare.com:3478"},
    {urls:"stun:stun.nextcloud.com:443"},
    // Sem um servidor TURN, chamadas falham sempre que qualquer um dos dois lados
    // está atrás de NAT simétrico (comum em redes móveis, roteadores domésticos e
    // redes corporativas) — o STUN sozinho não é suficiente nesse caso, e a
    // pessoa consegue "entrar" na sala (isso é só sinalização via Socket.IO) mas
    // nunca ouve/vê o outro participante nem transmite a tela. Este TURN público
    // (Open Relay Project) serve de rede de segurança; para produção, prefira
    // configurar window.TURN_SERVERS com um provedor próprio (Twilio, Cloudflare
    // Calls, Metered, coturn autohospedado, etc.), pois serviços TURN públicos têm
    // limite de uso e podem ficar instáveis sob carga.
    {urls:"turn:openrelay.metered.ca:80",username:"openrelayproject",credential:"openrelayproject"},
    {urls:"turn:openrelay.metered.ca:443",username:"openrelayproject",credential:"openrelayproject"},
    {urls:"turn:openrelay.metered.ca:443?transport=tcp",username:"openrelayproject",credential:"openrelayproject"},
    ...(Array.isArray(window.TURN_SERVERS)?window.TURN_SERVERS:[])
  ],
  iceCandidatePoolSize:10
};

let socket=null,name="",room="",localStream=null,screenTrack=null;
let peers=new Map(),pendingRemoteIce=new Map(),remoteAudioEls=new Map(),remoteMediaStreams=new Map(),people=new Map(),inCall=false;
let micOn=true,camOn=true,callHostId=null,remoteMuted=new Set(),kicked=false,forcedMuted=false;
let callVolumeMuted=localStorage.getItem("freechatCallVolumeMuted")==="1",callVolumeLevel=Math.max(0,Math.min(1,Number(localStorage.getItem("freechatCallVolumeLevel")??100)/100));
let callReady=false;
let joiningCall=false,pingTimer=null,pingStarted=0,lastRtt=null,callAttempt=0,peerRepairTimer=null;
let audioContext=null, micAnalyser=null, micSource=null, micMeterTimer=null;

function enterRoomAfterConnect(){
  if(!socket?.connected||!room)return;
  socket.emit("join",{room});
  if(window.CONVERSA_AUTO_CALL&&!inCall){
    setTimeout(()=>{if(!inCall&&socket?.connected)openCall()},450);
    window.CONVERSA_AUTO_CALL=false;
  }
  if(inCall)setTimeout(()=>{socket.emit("call-ready",{room});broadcastCameraState();},250);
}
function connectLobby(){
  if(room)return; // já existe uma sala alvo, o fluxo normal cuida da conexão
  connect();
}
function joinRoom(roomValue,nameValue){
  name=(nameValue||window.CONVERSA_USER?.name||"Visitante").trim().slice(0,24)||"Visitante";
  room=(roomValue||window.CONVERSA_ROOM||"geral").trim().toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,32)||"geral";
  $("callMenu")?.classList.add("hidden");
  $("app").classList.remove("hidden");
  $("me").textContent=name;
  $("avatar").textContent=name[0].toUpperCase();
  $("roomName").textContent="# "+room;
  $("headRoom").textContent=room;
  if(socket?.connected)enterRoomAfterConnect();
  else connect();
}
window.addEventListener("conversa:open-room",e=>{
  const d=e.detail||{};
  joinRoom(d.room,d.name);
});
const urlRoom=new URLSearchParams(location.search).get("room");
if(urlRoom){
  const saved=localStorage.getItem("conversaLiveName")||"Visitante";
  joinRoom(urlRoom,saved);
}
function setConnectionLevel(level,text){const m=$("connectionMeter"),s=$("sideConnection"),c=["off","bad","medium","ok","good"][Math.max(0,Math.min(4,level))];if(m){m.className="connection-meter "+c;$("connectionText").textContent=text||["Offline","Fraca","Média","Boa","Excelente"][level]}if(s)s.className="connection-mini "+c}
function startConnectionMonitor(){clearInterval(pingTimer);const p=()=>{if(!socket?.connected){setConnectionLevel(0,"Offline");return}pingStarted=performance.now();socket.emit("client-ping",pingStarted)};p();pingTimer=setInterval(p,4000)}
let socketScriptLoading=false;
function connect(){
  if(socket?.connected)return;
  if(window.io){startSocket();return;}
  loadSocketIO();
}
function loadSocketIO(){
  if(window.io){startSocket();return;}
  if(socketScriptLoading)return;
  socketScriptLoading=true;
  const load=(src,onError)=>{
    const s=document.createElement("script");
    s.src=src; s.async=true; s.onload=()=>{socketScriptLoading=false;startSocket()};
    s.onerror=onError; document.head.appendChild(s);
  };
  // Tenta primeiro o cliente servido pelo próprio backend (garante que a
  // versão bate com o servidor). Se isso falhar por qualquer motivo — o
  // servidor demorando pra acordar, uma instabilidade passageira, etc. —
  // cai para o CDN em vez de deixar a pessoa sem conexão nenhuma.
  const backend=serverUrl()+"/socket.io/socket.io.js";
  load(backend,()=>{
    $("status").textContent="Servidor lento para responder, tentando via CDN...";
    load("https://cdn.socket.io/4.8.1/socket.io.min.js",()=>{
      socketScriptLoading=false;
      $("status").textContent="Não foi possível carregar o módulo de conexão.";
      setConnectionLevel(0,"Falha no Socket.IO");
    });
  });
}
function startSocket(){
  if(!window.io||socket?.connected)return;
  const token=window.CONVERSA_TOKEN||localStorage.getItem("conversaLiveToken")||"";
  socket=io(serverUrl(),{
    path:"/socket.io",
    addTrailingSlash:false,
    auth:{token},
    transports:["polling","websocket"],
    tryAllTransports:true,
    upgrade:true,
    forceNew:true,
    timeout:10000,
    reconnection:true,
    reconnectionAttempts:Infinity,
    reconnectionDelay:500,
    reconnectionDelayMax:5000,
    randomizationFactor:0.2
  });
  window.socket=socket;

  socket.on("connect",()=>{
    $("status").textContent=room?"Conectado":"Online";setConnectionLevel(4,room?"Conectado":"Online");startConnectionMonitor();
    enterRoomAfterConnect();
  });
  socket.on("connect_error",err=>{
    const msg=String(err?.message||"");
    const desc=String(err?.description||"");
    const detail=[msg,desc].filter(Boolean).join(" — ");
    if(/sessão|sessao|expirada|inválida|invalida/i.test(msg)){
      localStorage.removeItem("conversaLiveToken");
      window.CONVERSA_TOKEN="";
      $("status").textContent="Sessão expirada — entre novamente.";
      setConnectionLevel(0,"Sessão expirada");
      document.getElementById("login")?.classList.remove("hidden");
      document.getElementById("callMenu")?.classList.add("hidden");
      appToast?.("Sua sessão expirou. Entre novamente para reconectar.","error");
      return;
    }
    console.warn("Socket.IO connect_error:", err);
    const hint=/xhr poll error|websocket error|timeout|transport/i.test(detail)?"Não foi possível alcançar o servidor. O app tentará novamente automaticamente.":(detail||"Falha de conexão");
    $("status").textContent="Servidor offline — tentando reconectar...";
    setConnectionLevel(0,"Offline");
    if(window.appToast) appToast(hint,"error");
  });
  socket.on("disconnect",()=>{setConnectionLevel(0,"Offline");$("status").textContent="Reconectando...";});
  socket.on("client-pong",sent=>{const r=performance.now()-Number(sent);lastRtt=r;let l=r<90?4:r<160?3:r<250?2:r<500?1:0;setConnectionLevel(l,(l===4?"Excelente":l===3?"Boa":l===2?"Média":l===1?"Fraca":"Muito fraca")+" • "+Math.round(r)+" ms")});
  socket.on("room-users",list=>{
    people.clear();
    list.forEach(u=>people.set(u.id,u));
    renderPeople();window.renderFriends?.();
    // A lista de usuários não é uma fonte confiável para eleger o criador localmente.
    // O servidor envia o host de forma autoritativa via call-host/call-state.
    if(callHostId===null){
      const serverHost=list.find(u=>u.host)?.id||null;
      if(serverHost) callHostId=serverHost;
    }
  });
  socket.on("user-joined",u=>{
    people.set(u.id,u);renderPeople();
    addSystem(u.name+" entrou na sala.");
    // Se a pessoa entrou depois de a call já estar ativa, marque novamente
    // este socket como pronto para que a negociação WebRTC seja iniciada.
    if(inCall&&callReady&&socket?.connected){
      setTimeout(()=>{if(inCall&&callReady&&socket?.connected)socket.emit("call-ready",{room})},120);
    }
  });
  socket.on("user-profile-updated",u=>{
    if(!u?.id)return;
    const current=people.get(u.id)||{};
    people.set(u.id,{...current,...u});
    renderPeople();
  });
  socket.on("user-left",u=>{
    people.delete(u.id);renderPeople();closePeer(u.id);
    if(u.id===callHostId)callHostId=null;
    addSystem(u.name+" saiu da sala.");
  });
  socket.on("chat",m=>{addMessage(m.name,m.text,m.time);callChatHistory.push(m);if(callChatHistory.length>80)callChatHistory.shift();if(!$("callSidePanel")?.classList.contains("hidden")&&$("callPanelTitle")?.textContent==="Chat da call")openCallPanel("chat");});
  socket.on("signal",handleSignal);
  socket.on("system",addSystem);

  socket.on("call-host",id=>{
    callHostId=id||null;
    renderPeople();
    if(inCall){
      if(isHost()){
        setCallStatus("Você é o criador da call. 🎙️📷","ok");
        requestReadyPeers();
      }else{
        setCallStatus("Conectado à call. Aguardando os outros participantes...");
      }
      if(callReady) socket.emit("call-ready",{room});broadcastCameraState();
    }
  });

  socket.on("call-state",state=>{
    if(!state)return;
    callHostId=state.active ? (state.host||null) : null;
    renderPeople();
    if(inCall && callReady && state.active){
      socket.emit("call-ready",{room});broadcastCameraState();
      if(isHost()) requestReadyPeers();
    }
  });

  socket.on("call-created",({byId})=>{
    if(inCall)window.playCallSound?.("create",`create:${room}`);
  });
  socket.on("call-participant-joined",({id})=>{
    // call-ready pode ser reenviado várias vezes (inclusive após reconexão).
    // O som de entrada deve tocar somente uma vez por participante nesta call.
    if(inCall && id!==socket?.id)window.playCallSound?.("join",`join:${room}:${id}`);
  });

  socket.on("music-state",async state=>{
    musicState=state||null; updateMusicUI(state);
    if(state?.hostId===socket?.id&&state.track){
      musicHost=true;
      try{if(musicTrack?.id!==state.track.id)await applyMusicTrackToPeers(state.track,state);else syncMusicPlayback(state);}
      catch(e){setCallStatus(e.message||"Erro no bot de música.","error")}
    }else if(state?.hostId!==socket?.id)stopMusicLocal(false);
  });
  socket.on("music-stop",()=>{musicState=null;stopMusicLocal(false);setCallStatus("Música parada.")});
  socket.on("music-command-error",m=>appToast(m||"Comando recusado.","error"));
  socket.on("call-ended",()=>{
    callHostId=null;
    if(inCall)leaveCall(false);
    addSystem("A chamada foi encerrada pelo criador.");
  });

  socket.on("call-removed",()=>{
    kicked=true;leaveCall(false);
    addSystem("Você foi removido da chamada pelo criador.");
  });
  socket.on("call-camera-state",({id,on})=>{
    if(!id)return;
    setTileCamOff(id,!on);
  });
  socket.on("call-screen-state",({id,sharing})=>{
    if(!id)return;
    const tile=document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if(tile){
      tile.classList.toggle("sharing",!!sharing);
      // Durante compartilhamento, a tela deve ficar visível mesmo se a
      // câmera da pessoa estiver desligada.
      if(sharing) tile.classList.remove("cam-off");
    }
    updateScreenShareBanner();
    if(sharing && id!==socket?.id){
      window.playCallSound?.("screen-share",`screen-share:${room}:${id}`);
      setCallStatus("🖥️ Tela compartilhada recebida.","ok");
    }
  });
  socket.on("call-participant-left",({id})=>{
    if(id){closePeer(id); if(inCall)window.playCallSound?.("leave",`leave:${room}:${id}`);}
  });

  socket.on("call-ready-users",ids=>{
    if(!inCall)return;
    ids.forEach(id=>{
      // Conecta com todo mundo que já está pronto na call (mesh completo), não
      // só com o criador — do contrário, em calls com 3+ pessoas cada uma só
      // ouve/vê o host, nunca as outras. Um único lado inicia por par (o de
      // maior socket.id) para não gerar duas ofertas colidindo ao mesmo tempo.
      if(id!==socket.id && !peers.has(id) && socket.id>id){
        createPeer(id,true).catch(console.error);
      }
    });
  });

  socket.on("call-participant-ready",({id})=>{
    if(inCall && id!==socket.id && !peers.has(id) && socket.id>id){
      createPeer(id,true).catch(console.error);
    }
  });

  socket.on("participant-muted",({id,name:mutedName,muted})=>{
    if(id===socket.id){
      forcedMuted=!!muted;
      if(localStream)localStream.getAudioTracks().forEach(t=>t.enabled=!forcedMuted&&micOn);
      updateMicButton();
      $("callStatus").textContent=forcedMuted?"Você foi silenciado pelo criador.":"Seu microfone foi liberado.";
    }
    addSystem((mutedName||"Participante")+(muted?" foi silenciado pelo criador da call.":" foi liberado pelo criador da call."));
    renderPeople();
  });

  socket.on("call-invite",({room:invitedRoom,fromCode,fromName})=>{
    window.playCallSound?.("invite",`invite:${invitedRoom}:${fromCode}`);
    showCallInvite(invitedRoom,fromCode,fromName);
  });
  socket.on("call-invite-declined",({byName})=>{
    appToast((byName||"Seu amigo")+" recusou o convite para a call.","info");
  });
  socket.on("notification-new",n=>{handleNewNotification(n)});
  socket.on("friend-request",({name:reqName})=>{
    window.playFriendNotificationSound?.();window.showFriendToast?.(reqName);window.refreshUnreadCounts?.();window.renderFriends?.();
  });
  socket.on("friend-accepted",({name:accName})=>{
    appToast((accName||"Seu amigo")+" aceitou seu convite de amizade!","success");window.renderFriends?.();
  });
  socket.on("dm-new",({code:fromCode,message,fromName})=>{
    if(!fromCode||!message?.id)return;
    if(fromCode===activeFriendCode && !( $("messagesPanel")?.classList.contains("hidden") )){
      appendDirectMessage(message,true);
    }else{
      window.bumpUnread?.(fromCode);
      window.notifyIncomingMessage?.(fromName||fromCode,message);
    }
  });
}
function isHost(){return !!socket&&callHostId===socket.id;}
function broadcastCameraState(){try{socket?.emit("call-camera-state",{room,on:!!camOn})}catch(e){}}

function renderPeople(){
  $("people").innerHTML="";
  people.forEach(u=>{
    const d=document.createElement("div");d.className="person";
    const av=document.createElement("span");av.className="person-avatar";window.applyAvatar?.(av,u.avatarUrl,u.name);
    const dot=document.createElement("i");
    const span=document.createElement("span");span.className="person-name";
    span.textContent=u.name+(u.id===socket?.id?" (você)":"");
    if(u.id===callHostId){
      const b=document.createElement("small");b.className="host-badge";b.textContent="CRIADOR";span.appendChild(b);
    }
    d.append(av,dot,span);
    if(isHost()&&u.id!==socket.id&&inCall){
      const actions=document.createElement("div");actions.className="person-actions";
      const mute=document.createElement("button");mute.title="Silenciar";mute.textContent=remoteMuted.has(u.id)?"🔊":"🔇";
      mute.onclick=()=>hostMute(u.id,u.name);
      const kick=document.createElement("button");kick.className="kick";kick.title="Expulsar da call";kick.textContent="✕";
      kick.onclick=()=>hostKick(u.id,u.name);
      actions.append(mute,kick);d.appendChild(actions);
    }
    $("people").appendChild(d);
  });
}
function hostMute(id,n){
  if(!isHost())return;
  const muted=!remoteMuted.has(id);
  if(muted)remoteMuted.add(id);else remoteMuted.delete(id);
  socket.emit("host-mute",{to:id,name:n,room,muted});
  renderPeople();
}
async function hostKick(id,n){
  if(!isHost()||!await fcConfirm("A pessoa será removida desta chamada.",{title:"Expulsar "+n+" da chamada?",confirmText:"Expulsar",danger:true,kicker:"Chamada"}))return;
  socket.emit("host-kick",{to:id,name:n,room});
  closePeer(id);renderPeople();
}
function addSystem(t){$("emptyChat")?.remove();const d=document.createElement("div");d.className="system";d.textContent=t;$("messages").appendChild(d);scroll();}
function addMessage(n,t,time){
  const d=document.createElement("div");d.className="msg";
  const b=document.createElement("b");b.textContent=n;
  const tm=document.createElement("time");tm.textContent=time||"";
  const p=document.createElement("p");p.textContent=t;d.append(b,tm,p);$("messages").appendChild(d);scroll();
}
function scroll(){$("messages").scrollTop=$("messages").scrollHeight;}
$("msg")?.addEventListener("input",()=>{const el=$("msg"),c=$("msgCount");if(c)c.textContent=el.value.length+"/1000";});
$("form").onsubmit=e=>{
  e.preventDefault();const t=$("msg").value.trim();
  if(!t||!socket?.connected)return;
  if(handleMusicCommand(t)){ $("msg").value=""; return; }
  socket.emit("chat",{room,text:t});$("msg").value="";
};

// ---------------- Emoji picker ----------------
const EMOJI_CATEGORIES = {
  "😀": ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥳","🤩","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫡","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑"],
  "❤️": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","❤️‍🔥","❤️‍🩹","💋","💯","💢","💥","💫","💦","💨"],
  "👍": ["👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👏","🙌","👐","🤝","🙏","💪","👊","✊","🤲","🫶","☝️","👇","👆","👉","👈","✋","🤚","🖐️","🖖","👋","🤏","✍️","💅","🫵"],
  "🎮": ["🎮","🕹️","🎲","🎯","🏆","🥇","🥈","🥉","⚽","🏀","🏈","⚾","🎾","🏐","🎱","🎳","🏓","🎸","🎹","🥁","🎤","🎧","🎬","🎨","🧩","🚀","🔥","⭐","✨","💎","⚡","💡","🔔","🎉","🎊","🎁"],
  "🍔": ["🍔","🍕","🍟","🌭","🌮","🌯","🍿","🍩","🍪","🍰","🧁","🍫","🍎","🍌","🍓","🍉","🍇","🍒","🥭","🍍","🥝","🍋","🥑","🍗","🍖","🍜","🍣","🍱","🍚","🍦","🍭","☕","🧃","🥤"],
  "🐶": ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🦄","🐝","🦋","🐢","🐍","🦖","🐙","🦑","🦀","🐠","🐟","🐬","🦈"],
  "🔧": ["🔧","🔨","⚙️","🛠️","🔒","🔓","🔑","💻","🖥️","📱","⌨️","🖱️","💾","📷","🎥","🎙️","📡","🔋","💡","📌","📎","✏️","📝","📚","🗑️","🧹","🚪","🏠","🌎","☀️","🌙","☁️","🌧️","❄️","🌈"]
};
let emojiCategory = Object.keys(EMOJI_CATEGORIES)[0];

function insertAtCursor(text){
  const input=$("msg");
  const start=input.selectionStart ?? input.value.length;
  const end=input.selectionEnd ?? input.value.length;
  input.value=input.value.slice(0,start)+text+input.value.slice(end);
  input.focus();
  const pos=start+text.length;
  input.setSelectionRange(pos,pos);
}
function renderEmojiPicker(){
  const tabs=$("emojiTabs"), grid=$("emojiGrid"), search=($("emojiSearch").value||"").trim().toLowerCase();
  tabs.innerHTML="";
  Object.keys(EMOJI_CATEGORIES).forEach(cat=>{
    const b=document.createElement("button"); b.type="button"; b.className="emoji-tab"+(cat===emojiCategory?" active":"");
    b.textContent=cat; b.title="Categoria"; b.onclick=()=>{emojiCategory=cat;renderEmojiPicker();};
    tabs.appendChild(b);
  });
  const base=EMOJI_CATEGORIES[emojiCategory]||[];
  const list=search ? Object.values(EMOJI_CATEGORIES).flat() : base;
  grid.innerHTML="";
  [...new Set(list)].forEach(e=>{
    const b=document.createElement("button"); b.type="button"; b.className="emoji-item"; b.textContent=e; b.title=e;
    b.onclick=()=>insertAtCursor(e);
    grid.appendChild(b);
  });
}
$("emoji").onclick=()=>{
  const p=$("emojiPicker"); p.classList.toggle("hidden");
  if(!p.classList.contains("hidden")){renderEmojiPicker();$("emojiSearch").focus();}
};
$("emojiClose").onclick=()=>$("emojiPicker").classList.add("hidden");
$("emojiSearch").addEventListener("input",renderEmojiPicker);
document.addEventListener("click",e=>{
  const p=$("emojiPicker"), btn=$("emoji");
  if(!p.classList.contains("hidden")&&!p.contains(e.target)&&e.target!==btn)p.classList.add("hidden");
});

document.addEventListener("click",e=>{if(!e.target.closest(".post-more")&&!e.target.closest(".post-menu")){document.querySelectorAll(".post-menu:not(.hidden)").forEach(m=>m.classList.add("hidden"))}});

$("invite").onclick=async()=>{
  const u=location.href.split("?")[0]+"?room="+encodeURIComponent(room);
  try{await navigator.clipboard.writeText(u);$("invite").textContent="✓ Convite copiado";}
  catch(e){await fcPrompt("Compartilhe este convite manualmente.",{title:"Convite da chamada",confirmText:"Fechar",cancelText:"Cancelar",kicker:"Convite",value:u,inputLabel:"Link do convite",placeholder:"Link"});}
  setTimeout(()=>{$("invite").textContent="🔗 Copiar convite";},1600);
};

$("audioUnlock")?.addEventListener("click",async()=>{unlockAllAudio();await new Promise(r=>setTimeout(r,180));const blocked=[...remoteAudioEls.values()].some(v=>v.paused&&!v.muted);if(blocked){$("callSettingsPanel")?.classList.remove("hidden");setCallStatus("O navegador bloqueou o áudio. Verifique a saída de áudio nas configurações.","warn");}});
$("musicStop")?.addEventListener("click",()=>musicControl("music-stop"));$("musicSkip")?.addEventListener("click",()=>musicControl("music-next"));
$("callOpen").onclick=openCall;

// Fallback de fechamento: mantém os botões X funcionais mesmo após re-renderizações.
document.addEventListener("click",(e)=>{
  const btn=e.target?.closest?.("#friendsClose,#emojiClose,#callClose,#callPanelClose,#callMusicClose,#callSettingsClose,#settingsClose,#socialClose,#serversClose,#randomCallClose,#postComposerClose,#messagesClose");
  if(!btn)return;
  e.preventDefault(); e.stopPropagation();
  const actions={
    friendsClose:()=>$("friendsPanel")?.classList.add("hidden"),
    emojiClose:()=>$("emojiPicker")?.classList.add("hidden"),
    callClose:()=>inCall?leaveCall(true):$("call")?.classList.add("hidden"),
    callPanelClose:()=>closeCallPanel?.(),
    callMusicClose:()=>$("callMusicPanel")?.classList.add("hidden"),
    callSettingsClose:()=>$("callSettingsPanel")?.classList.add("hidden"),
    settingsClose:()=>closeSettings?.(),
    socialClose:()=>closeSocialPanel?.(),
    serversClose:()=>closeServers?.(),
    reportClose:()=>window.closeReportModal?.(),
    adminClose:()=>window.closeAdminPanel?.(),
    reportCancelBtn:()=>window.closeReportModal?.(),
    randomCallClose:()=>closeRandomCall?.(),
    postComposerClose:()=>closePostComposer?.(),
    messagesClose:()=>closePrivateChat?.()
  };
  try{actions[btn.id]?.();}
  catch(err){
    console.error("close-fallback",btn.id,err);
    // Mesmo se a ação específica falhar, garante que o modal feche —
    // um modal de tela cheia travado aberto bloqueia o app inteiro.
    btn.closest?.(".modal")?.classList.add("hidden");
  }
},true);
$("callClose").onclick=()=>leaveCall(true);
$("hang").onclick=()=>leaveCall(true);


function setCallStatus(text,kind=""){
  const el=$("callStatus"); if(!el)return;
  el.textContent=text; el.className="callStatus"+(kind?" "+kind:"");
}
function stopMicMeter(){
  if(micMeterTimer)clearInterval(micMeterTimer);
  micMeterTimer=null;
  try{micSource?.disconnect();}catch(e){}
  try{micAnalyser?.disconnect();}catch(e){}
  micSource=null; micAnalyser=null;
  const btn=$("mic"); if(btn)btn.classList.remove("speaking");
  if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}
}
async function startMicMeter(){
  stopMicMeter();
  const track=localStream?.getAudioTracks?.()[0];
  if(!track)return;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    audioContext=new Ctx();
    if(audioContext.state==="suspended")await audioContext.resume().catch(()=>{});
    micSource=audioContext.createMediaStreamSource(new MediaStream([track]));
    micAnalyser=audioContext.createAnalyser();
    micAnalyser.fftSize=512;
    micAnalyser.smoothingTimeConstant=.75;
    micSource.connect(micAnalyser);
    const data=new Uint8Array(micAnalyser.fftSize);
    // Um "poll" leve a ~12x/s é suficiente para o indicador visual e custa
    // bem menos CPU do que recalcular a cada frame (60x/s) com requestAnimationFrame.
    const tick=()=>{
      if(!micAnalyser||!localStream)return;
      micAnalyser.getByteTimeDomainData(data);
      let sum=0;
      for(let i=0;i<data.length;i++){const x=(data[i]-128)/128;sum+=x*x;}
      const rms=Math.sqrt(sum/data.length);
      const speaking=rms>.035 && micOn && !forcedMuted;
      $("mic")?.classList.toggle("speaking",speaking);
    };
    tick();
    micMeterTimer=setInterval(tick,80);
  }catch(e){
    // O indicador é opcional; a chamada continua funcionando mesmo se Web Audio falhar.
  }
}
function updateMicButton(){
  const b=$("mic"); if(!b)return;
  b.textContent="";
  const icon=document.createElement("span");
  icon.textContent=micOn&&!forcedMuted?"🎙️":"🔇";
  b.appendChild(icon);
  const label=document.createElement("span"); label.textContent="Microfone"; b.appendChild(label);
  b.classList.toggle("muted",!micOn||forcedMuted);
}
function enableRemoteAudio(v){
  if(!v)return;
  v.autoplay=true;
  v.playsInline=true;
  v.muted=false;
  v.volume=callVolumeLevel;
  const p=v.play();
  if(p?.catch)p.catch(()=>{});
}

function unlockAllAudio(){
  document.querySelectorAll("#videos video").forEach(v=>{if(v.dataset.local!=="1")enableRemoteAudio(v)});
  remoteAudioEls.forEach(v=>{v.muted=false;v.volume=callVolumeLevel;v.play().catch(()=>{})});
  if(musicAudioContext?.state==="suspended")musicAudioContext.resume().catch(()=>{});
  if(musicElement?.paused)musicElement.play().catch(()=>{});
  $("audioUnlock")?.classList.add("hidden");
  setCallStatus("Áudio ativado. 🎧","ok");
}

function refreshAudioStatus(){
  if(!inCall)return;
  const active=[...document.querySelectorAll("#videos video")].filter(v=>v.dataset?.id!=="local");
  const hasRemoteAudio=active.some(v=>v.srcObject?.getAudioTracks?.().some(t=>t.readyState==="live"));
  if(hasRemoteAudio && !active.some(v=>v.paused && !v.muted)){
    // Do not overwrite a more useful status while connected.
  }
}


function formatMusicTime(sec){sec=Math.max(0,Math.floor(Number(sec)||0));return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0");}
let musicUiTickTimer=null;
function renderMusicPanel(state){
 const title=$("musicNowTitle"),artist=$("musicNowArtist"),art=$("musicNowArt"),time=$("musicNowTime"),fill=$("musicPanelProgress"),queue=$("musicPanelQueue"),count=$("musicPanelQueueCount"),hint=$("musicPanelHostHint");
 if(!state?.track){if(title)title.textContent="Nenhuma música tocando";if(artist)artist.textContent="—";if(art){art.textContent="🎵";art.style.backgroundImage=""}if(time)time.textContent="0:00 / 0:00";if(fill)fill.style.width="0%";if(queue)queue.innerHTML='<div class="music-queue-empty">A fila está vazia.</div>';if(count)count.textContent="0 faixas";if(hint)hint.textContent="Entre em uma call para usar a central de música.";return;}
 const pos=Math.max(0,Number(state.position||0)),dur=Math.max(0,Number(state.track.duration||0));
 if(title)title.textContent=state.track.title||"Sem título";if(artist)artist.textContent=state.track.artist||"Artista desconhecido";
 if(art){art.textContent=state.track.artwork?"": "🎵";art.style.backgroundImage=state.track.artwork?`url("${String(state.track.artwork).replace(/"/g,'')}" )`:"";}
 if(time)time.textContent=formatMusicTime(pos)+" / "+(dur?formatMusicTime(dur):"--:--");if(fill)fill.style.width=(dur?Math.min(100,pos/dur*100):0)+"%";
 const q=state.queue||[];if(count)count.textContent=q.length+(q.length===1?" faixa":" faixas");
 if(queue)queue.innerHTML=q.length?q.map((t,i)=>`<div class="music-queue-item"><span>${i+1}</span><div><b>${messageEscape(t.title||"Sem título")}</b><small>${messageEscape(t.artist||"Artista")}</small></div></div>`).join(""): '<div class="music-queue-empty">Nenhuma faixa na fila.</div>';
 if(hint)hint.textContent=canControlMusic()?"Você controla a música desta call.":"Som controlado pelo criador da call.";
 const canCtl=canControlMusic();
 $("musicPause")?.toggleAttribute("disabled",!canCtl||!!state.paused);$("musicResume")?.toggleAttribute("disabled",!canCtl||!state.paused);$("musicSkipPanel")?.toggleAttribute("disabled",!canCtl);$("musicStopPanel")?.toggleAttribute("disabled",!canCtl);$("musicSharedVolume")?.toggleAttribute("disabled",!canCtl);
}
function updateMusicUI(state){
 const b=$("musicBot");if(!b)return;const t=b.querySelector(".music-title"),m=b.querySelector(".music-meta"),q=b.querySelector(".music-queue-count"),x=b.querySelector(".music-stop"),sk=b.querySelector(".music-skip"),fill=b.querySelector(".music-progress-fill");
 clearInterval(musicUiTickTimer);musicUiTickTimer=null;
 if(state?.track){b.classList.remove("idle");if(t)t.textContent="🎵 "+state.track.title;const dur=Number(state.track.duration||0),basePos=Number(state.position||0),syncAt=Date.now();const renderTick=()=>{const pos=state.paused?basePos:basePos+(Date.now()-syncAt)/1000;if(m)m.textContent=(state.paused?"⏸ pausada":"▶ tocando")+" • "+(state.track.artist||"Artista")+" • "+formatMusicTime(pos)+(dur?"/"+formatMusicTime(dur):"");if(fill)fill.style.width=(dur>0?Math.min(100,pos/dur*100):0)+"%";};renderTick();if(!state.paused)musicUiTickTimer=setInterval(renderTick,1000);if(q)q.textContent=(state.queue?.length||0)+" na fila";const ctl=canControlMusic();if(x)x.disabled=!ctl;if(sk)sk.disabled=!ctl;}else{b.classList.add("idle");if(t)t.textContent="Nenhuma música tocando";if(m)m.textContent="Abra 🎵 Música para buscar e controlar";if(q)q.textContent="";if(x)x.disabled=true;if(sk)sk.disabled=true;if(fill)fill.style.width="0%";}
 renderMusicPanel(state);
}

function setPeersAudioProfile(profile){
  const maxBitrate=profile==="music"?160000:96000;
  peers.forEach(pc=>{
    const sender=pc.getSenders().find(s=>s.track?.kind==="audio");
    if(!sender)return;
    try{
      const p=sender.getParameters();
      p.encodings=p.encodings?.length?p.encodings:[{}];
      p.encodings[0].maxBitrate=maxBitrate;
      p.encodings[0].networkPriority="high";
      sender.setParameters(p).catch(()=>{});
    }catch(e){}
  });
}
function ensureMusicAudio(){if(musicAudioContext)return musicAudioContext;const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)throw Error("Seu navegador não suporta áudio.");musicAudioContext=new Ctx();musicDestination=musicAudioContext.createMediaStreamDestination();return musicAudioContext;}
async function applyMusicTrackToPeers(track,state){
 const ctx=ensureMusicAudio();if(ctx.state==="suspended")await ctx.resume().catch(()=>{});
 if(musicElement)try{musicElement.pause()}catch(e){} if(musicSource)try{musicSource.disconnect()}catch(e){}
 if(musicMicSource)try{musicMicSource.disconnect()}catch(e){} musicMicSource=null;
 try{const td=await api("/api/music/token");musicMediaToken=td.token||"";}catch(e){setCallStatus(e.message||"Não foi possível preparar o áudio.","error");return;}
 musicElement=new Audio();musicElement.crossOrigin="anonymous";musicElement.preload="auto";applyOutputDevice();musicElement.src=serverUrl()+"/api/music/stream/"+encodeURIComponent(track.id)+"?mt="+encodeURIComponent(musicMediaToken);
 let handledError=false;
 musicElement.addEventListener("error",()=>{
   if(handledError)return;handledError=true;
   if(musicHost&&socket?.connected){setCallStatus("Essa faixa falhou. Pulando para a próxima... ⏭","warn");socket.emit("music-next",{room});}
   else setCallStatus("O áudio não pôde ser carregado. Tente outra música.","error");
 });
 musicSource=ctx.createMediaElementSource(musicElement);
 musicLocalGainNode=ctx.createGain();musicTransmitGainNode=ctx.createGain();
 musicSource.connect(musicLocalGainNode);musicLocalGainNode.connect(ctx.destination);
 musicSource.connect(musicTransmitGainNode);musicTransmitGainNode.connect(musicDestination);
 musicVolume=Math.max(0,Math.min(1,Number(state?.volume??musicVolume)));
 updateMusicGains();
 if(localStream?.getAudioTracks?.().length){
   musicMicSource=ctx.createMediaStreamSource(new MediaStream([localStream.getAudioTracks()[0]]));
   const g=ctx.createGain();g.gain.value=1;musicMicSource.connect(g);g.connect(musicDestination);
 }
 if(screenAudioTrack){
   // Compartilhamento de tela com áudio já estava rolando num grafo próprio —
   // religa a fonte da tela no grafo da música em vez de perder esse áudio.
   try{screenAudioSource?.disconnect()}catch(e){}
   if(screenAudioCtx&&screenAudioCtx!==ctx){try{screenAudioCtx.close()}catch(e){}}
   screenAudioCtx=ctx;
   screenAudioSource=ctx.createMediaStreamSource(new MediaStream([screenAudioTrack]));
   const sg=ctx.createGain();sg.gain.value=.85;
   screenAudioSource.connect(sg);sg.connect(musicDestination);
 }
 const mixed=musicDestination.stream.getAudioTracks()[0];peers.forEach(pc=>{const snd=pc.getSenders().find(x=>x.track?.kind==="audio");if(snd&&mixed)snd.replaceTrack(mixed).catch(()=>{})});
 setPeersAudioProfile("music");
 musicTrack=track;musicElement.onended=()=>{if(musicHost&&socket?.connected)socket.emit("music-next",{room})};
 try{if(Number(state?.position)>0)musicElement.currentTime=Number(state.position)}catch(e){}
 try{await musicElement.play();$("audioUnlock")?.classList.add("hidden");}catch(e){$("audioUnlock")?.classList.remove("hidden");setCallStatus("Clique em 🔊 Ativar áudio para iniciar a música.","warn")}
 syncMusicPlayback(state);
}

function syncMusicPlayback(state){if(!musicElement||!state?.track)return;musicVolume=Math.max(0,Math.min(1,Number(state.volume??musicVolume)));updateMusicGains();if(state.paused)musicElement.pause();else if(musicElement.paused)musicElement.play().catch(()=>{});renderMusicPanel(state);}
function restoreMicTrack(){const mic=localStream?.getAudioTracks?.()[0];if(musicTrack&&musicDestination){refreshMusicMicSource();return;}if(screenAudioTrack&&screenMixDestination){applyAudioTrackToPeers(screenMixDestination.stream.getAudioTracks()[0]);return;}peers.forEach(pc=>{const snd=pc.getSenders().find(x=>x.track?.kind==="audio");if(snd)snd.replaceTrack(mic||null).catch(()=>{})});setPeersAudioProfile("voice");}
function refreshMusicMicSource(){if(!musicAudioContext||!musicDestination||!localStream?.getAudioTracks?.().length)return;try{if(musicMicSource)musicMicSource.disconnect()}catch(e){}try{musicMicSource=musicAudioContext.createMediaStreamSource(new MediaStream([localStream.getAudioTracks()[0]]));const g=musicAudioContext.createGain();g.gain.value=1;musicMicSource.connect(g);g.connect(musicDestination);const mixed=musicDestination.stream.getAudioTracks()[0];peers.forEach(pc=>{const snd=pc.getSenders().find(x=>x.track?.kind==="audio");if(snd&&mixed)snd.replaceTrack(mixed).catch(()=>{})})}catch(e){}}
function stopMusicLocal(clear=true){musicHost=false;musicTrack=null;musicMediaToken="";if(clear)musicState=null;if(musicElement){try{musicElement.pause()}catch(e){}musicElement.removeAttribute("src");musicElement.load();musicElement=null;}if(musicSource)try{musicSource.disconnect()}catch(e){}musicSource=null;if(musicLocalGainNode)try{musicLocalGainNode.disconnect()}catch(e){}musicLocalGainNode=null;if(musicTransmitGainNode)try{musicTransmitGainNode.disconnect()}catch(e){}musicTransmitGainNode=null;if(musicMicSource)try{musicMicSource.disconnect()}catch(e){}musicMicSource=null;restoreMicTrack();updateMusicUI(null);renderMusicPanel(null);}
function emitMusicCommand(ev,p={}){return new Promise((resolve,reject)=>{if(!inCall||!socket?.connected){reject(new Error("Entre em uma call para usar o bot de música."));return;}let settled=false;const done=(res)=>{if(settled)return;settled=true;if(res?.ok)resolve(res);else reject(new Error(res?.error||"Não foi possível concluir o comando de música."));};try{socket.emit(ev,{room,...p},done);setTimeout(()=>{if(!settled){settled=true;reject(new Error("O servidor não confirmou o comando de música. Tente novamente."));}},7000);}catch(e){reject(e);}})}
async function searchAndPlayMusic(term){if(!inCall||!socket?.connected){appToast("Entre em uma call para usar o bot de música.","error");return false;}const q=String(term||"").trim();if(q.length<2){appToast("Use /m nome da música","error");return false;}try{const d=await api("/api/music/search?q="+encodeURIComponent(q));const track=d.tracks?.[0];if(!track)throw Error("Não encontrei essa música.");await emitMusicCommand("music-play",{track});appToast("Música adicionada.","success");return true}catch(e){setCallStatus(e.message||"Não foi possível tocar a música.","error");return false;}}
async function musicControl(ev,p={}){try{const d=await emitMusicCommand(ev,p);if(ev==="music-volume")appToast("Volume da música atualizado.","success");return d}catch(e){appToast(e.message||"Não foi possível concluir o comando de música.","error");setCallStatus(e.message||"Erro no bot de música.","error");return null;}}
function handleMusicCommand(t){t=String(t||"").trim();if(!/^\/(m|skip|pause|resume|volume|queue|stop|music)\b/i.test(t))return false;let m=t.match(/^\/m\s+(.+)$/i);if(m){try{const c=ensureMusicAudio();if(c.state==="suspended")c.resume().catch(()=>{});}catch(e){}searchAndPlayMusic(m[1]);return true;}if(/^\/skip$/i.test(t)){musicControl("music-next");return true;}if(/^\/pause$/i.test(t)){musicControl("music-pause");return true;}if(/^\/resume$/i.test(t)){musicControl("music-resume");return true;}if(/^\/queue$/i.test(t)){musicControl("music-queue");return true;}if(/^\/stop$/i.test(t)){musicControl("music-stop");return true;}m=t.match(/^\/volume\s+(\d{1,3})$/i);if(m){const n=Number(m[1]);if(n>100){appToast("Volume entre 0 e 100.","error");return true;}musicControl("music-volume",{volume:n/100});return true;}if(/^\/music$/i.test(t)){appToast("/m música • /queue • /skip • /pause • /resume • /volume 0-100 • /stop","info");return true;}return true;}
let musicAudioContext=null,musicElement=null,musicSource=null,musicDestination=null,musicMicSource=null,musicLocalGainNode=null,musicTransmitGainNode=null,musicTrack=null,musicHost=false,musicVolume=.7,musicState=null,musicMediaToken="",localMusicVolume=Number(localStorage.getItem("freechatLocalMusicVolume")??70)/100,localMusicMuted=false;
const callAudioSettings={
  micDevice:localStorage.getItem("freechatMicDevice")||"",
  echoCancellation:localStorage.getItem("freechatEchoCancellation")!=="0",
  noiseSuppression:localStorage.getItem("freechatNoiseSuppression")!=="0",
  autoGainControl:localStorage.getItem("freechatAutoGain")!=="0",
  videoQuality:localStorage.getItem("freechatVideoQuality")||"high",
  autoQuality:localStorage.getItem("freechatAutoQuality")!=="0",
  outputDevice:localStorage.getItem("freechatOutputDevice")||""
};
const VIDEO_PROFILES={low:{label:"Econômica",width:640,height:360,fps:15,bitrate:450000},medium:{label:"Equilibrada",width:854,height:480,fps:20,bitrate:900000},high:{label:"Alta",width:1280,height:720,fps:30,bitrate:2500000},ultra:{label:"Máxima",width:1920,height:1080,fps:30,bitrate:4500000}};
let micTestStream=null,micTestCtx=null,micTestAnalyser=null,micTestTimer=null;
function renderLocalMusicVolume(){const v=Math.round(localMusicVolume*100);$("musicLocalVolume")?.setAttribute("value",String(v));$("musicLocalVolumeValue")?.replaceChildren(document.createTextNode(v+"%"));const shared=Math.round(musicVolume*100);$("musicSharedVolume")?.setAttribute("value",String(shared));$("musicSharedVolumeValue")?.replaceChildren(document.createTextNode(shared+"%"));const b=$("musicLocalMute");if(b){b.textContent=localMusicMuted?"🔇 Som desligado":"🔊 Som ligado";b.classList.toggle("muted",localMusicMuted);}}
function updateMusicGains(){const local=(localMusicMuted?0:localMusicVolume)*musicVolume;if(musicLocalGainNode)musicLocalGainNode.gain.value=local;if(musicTransmitGainNode)musicTransmitGainNode.gain.value=musicVolume;renderLocalMusicVolume();}
function setLocalMusicVolume(v){localMusicVolume=Math.max(0,Math.min(1,Number(v)/100));localStorage.setItem("freechatLocalMusicVolume",String(Math.round(localMusicVolume*100)));localMusicMuted=localMusicVolume===0;if(localMusicVolume>0)localMusicMuted=false;updateMusicGains();}
function toggleLocalMusicMute(){localMusicMuted=!localMusicMuted;updateMusicGains();}
// Quem PODE controlar a música (pausar/pular/parar/volume geral) é o criador da
// call — é essa a regra que o servidor aplica em musicController(). Isso é
// diferente de musicHost, que indica apenas quem está com o áudio carregado no
// próprio navegador e mixando na call. Confundir os dois deixava os botões
// habilitados para quem o servidor ia recusar (e desabilitados para o criador).
function canControlMusic(){return isHost();}
function setSharedMusicVolume(v){const n=Math.max(0,Math.min(1,Number(v)/100));if(!canControlMusic()){renderLocalMusicVolume();return;}musicControl("music-volume",{volume:n});musicVolume=n;updateMusicGains();}
function stopMusic(){if(socket?.connected&&musicHost)socket.emit("music-stop",{room});stopMusicLocal();}
function saveCallAudioSettings(){localStorage.setItem("freechatMicDevice",callAudioSettings.micDevice);localStorage.setItem("freechatEchoCancellation",callAudioSettings.echoCancellation?"1":"0");localStorage.setItem("freechatNoiseSuppression",callAudioSettings.noiseSuppression?"1":"0");localStorage.setItem("freechatAutoGain",callAudioSettings.autoGainControl?"1":"0");localStorage.setItem("freechatVideoQuality",callAudioSettings.videoQuality);localStorage.setItem("freechatAutoQuality",callAudioSettings.autoQuality?"1":"0");localStorage.setItem("freechatOutputDevice",callAudioSettings.outputDevice);}
function micConstraints(){const a={echoCancellation:callAudioSettings.echoCancellation,noiseSuppression:callAudioSettings.noiseSuppression,autoGainControl:callAudioSettings.autoGainControl,channelCount:1,sampleRate:48000};if(callAudioSettings.micDevice)a.deviceId={exact:callAudioSettings.micDevice};return a;}
async function applyMicTrackSettings(track){if(!track)return;const c=micConstraints();try{await track.applyConstraints(c)}catch(e){const fallback={echoCancellation:c.echoCancellation,noiseSuppression:c.noiseSuppression,autoGainControl:c.autoGainControl};try{await track.applyConstraints(fallback)}catch(_){} } refreshMusicMicSource();startMicMeter();}
async function replaceMicrophoneDevice(){if(!inCall||!navigator.mediaDevices?.getUserMedia)return;try{const stream=await withTimeout(navigator.mediaDevices.getUserMedia({audio:micConstraints(),video:false}),7000);const next=stream.getAudioTracks()[0];if(!next)throw Error("Microfone não encontrado.");const old=localStream?.getAudioTracks?.()[0];if(old)localStream.removeTrack(old);localStream?.addTrack(next);await applyMicTrackSettings(next);micOn=true;forcedMuted=false;updateMicButton();if(!musicTrack){peers.forEach(pc=>{const sender=pc.getSenders().find(x=>x.track?.kind==="audio");if(sender)sender.replaceTrack(next).catch(()=>{})});}else refreshMusicMicSource();if(old)try{old.stop()}catch(e){}appToast("Microfone alterado.","success");}catch(e){appToast(e.message||"Não foi possível trocar o microfone.","error");loadAudioDevices();}}
async function loadAudioDevices(){if(!navigator.mediaDevices?.enumerateDevices)return;try{const devices=await navigator.mediaDevices.enumerateDevices();const mic=$("micDeviceSelect"),out=$("audioOutputSelect");if(mic){const current=callAudioSettings.micDevice;mic.innerHTML='<option value="">Microfone padrão</option>';devices.filter(d=>d.kind==="audioinput").forEach((d,i)=>{const o=document.createElement("option");o.value=d.deviceId;o.textContent=d.label||`Microfone ${i+1}`;mic.appendChild(o)});mic.value=current;if(mic.value!==current)callAudioSettings.micDevice="";}if(out){out.innerHTML='<option value="">Saída padrão</option>';devices.filter(d=>d.kind==="audiooutput").forEach((d,i)=>{const o=document.createElement("option");o.value=d.deviceId;o.textContent=d.label||`Saída ${i+1}`;out.appendChild(o)});out.value=callAudioSettings.outputDevice;}}catch(e){}}
async function applyOutputDevice(){const id=callAudioSettings.outputDevice;if(!id)return;const els=[...remoteAudioEls.values(),musicElement].filter(Boolean);for(const el of els){try{if(typeof el.setSinkId==="function")await el.setSinkId(id)}catch(e){}}}
async function applyTransmissionProfile(profile=callAudioSettings.videoQuality){const p=VIDEO_PROFILES[profile]||VIDEO_PROFILES.high;callAudioSettings.videoQuality=profile;saveCallAudioSettings();const track=screenTrack||localStream?.getVideoTracks?.()[0];if(track){try{await track.applyConstraints({width:{ideal:p.width,max:p.width},height:{ideal:p.height,max:p.height},frameRate:{ideal:p.fps,max:p.fps}})}catch(e){}}peers.forEach(pc=>{const sender=pc.getSenders().find(x=>x.track?.kind==="video");if(!sender)return;try{const params=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];params.encodings[0].maxBitrate=p.bitrate;params.encodings[0].maxFramerate=p.fps;sender.setParameters(params).catch(()=>{});}catch(e){}});setCallStatus(`Transmissão: ${p.label} • ${p.width}×${p.height} • ${p.fps} FPS`,"ok");}
function updateAudioSettingsUI(){const set=(id,v)=>{const e=$(id);if(e)e.value=v;};set("micDeviceSelect",callAudioSettings.micDevice);set("videoQualitySelect",callAudioSettings.videoQuality);set("audioOutputSelect",callAudioSettings.outputDevice);set("callOutputVolume",Math.round(callVolumeLevel*100));set("echoCancellationToggle",callAudioSettings.echoCancellation);set("noiseSuppressionToggle",callAudioSettings.noiseSuppression);set("autoGainToggle",callAudioSettings.autoGainControl);set("autoQualityToggle",callAudioSettings.autoQuality);const cv=$("callOutputVolumeValue");if(cv)cv.textContent=Math.round(callVolumeLevel*100)+"%";}
async function testMicrophone(){if(micTestStream){stopMicrophoneTest();return;}try{micTestStream=await navigator.mediaDevices.getUserMedia({audio:micConstraints(),video:false});const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)throw Error("Web Audio indisponível.");micTestCtx=new Ctx();if(micTestCtx.state==="suspended")await micTestCtx.resume().catch(()=>{});const src=micTestCtx.createMediaStreamSource(micTestStream),an=micTestCtx.createAnalyser();an.fftSize=256;src.connect(an);micTestAnalyser=an;$("testMicBtn").textContent="⏹ Parar teste";const data=new Uint8Array(an.fftSize);micTestTimer=setInterval(()=>{if(!micTestAnalyser)return;an.getByteTimeDomainData(data);let sum=0;for(const x of data){const n=(x-128)/128;sum+=n*n}const rms=Math.min(1,Math.sqrt(sum/data.length)*4);const bar=$("micTestMeter")?.firstElementChild;if(bar)bar.style.width=Math.round(rms*100)+"%";},70);}catch(e){appToast(e.message||"Não foi possível testar o microfone.","error");stopMicrophoneTest();}}
function stopMicrophoneTest(){if(micTestTimer)clearInterval(micTestTimer);micTestTimer=null;try{micTestStream?.getTracks?.().forEach(t=>t.stop())}catch(e){}micTestStream=null;try{micTestCtx?.close?.()}catch(e){}micTestCtx=null;micTestAnalyser=null;const bar=$("micTestMeter")?.firstElementChild;if(bar)bar.style.width="0%";const b=$("testMicBtn");if(b)b.textContent="🎙️ Testar microfone";}
function initCallAudioSettings(){
 $("callSettingsPanel")?.addEventListener("change",async e=>{const id=e.target.id;if(id==="micDeviceSelect"){callAudioSettings.micDevice=e.target.value;saveCallAudioSettings();await replaceMicrophoneDevice();}else if(id==="echoCancellationToggle"){callAudioSettings.echoCancellation=e.target.checked;saveCallAudioSettings();await applyMicTrackSettings(localStream?.getAudioTracks?.()[0]);}else if(id==="noiseSuppressionToggle"){callAudioSettings.noiseSuppression=e.target.checked;saveCallAudioSettings();await applyMicTrackSettings(localStream?.getAudioTracks?.()[0]);}else if(id==="autoGainToggle"){callAudioSettings.autoGainControl=e.target.checked;saveCallAudioSettings();await applyMicTrackSettings(localStream?.getAudioTracks?.()[0]);}else if(id==="videoQualitySelect"){await applyTransmissionProfile(e.target.value);}else if(id==="autoQualityToggle"){callAudioSettings.autoQuality=e.target.checked;saveCallAudioSettings();}else if(id==="audioOutputSelect"){callAudioSettings.outputDevice=e.target.value;saveCallAudioSettings();await applyOutputDevice();}});
 
 $("callOutputVolume")?.addEventListener("input",e=>{callVolumeLevel=Math.max(0,Math.min(1,Number(e.target.value)/100));callVolumeMuted=callVolumeLevel===0;if(callVolumeLevel>0)callVolumeMuted=false;const v=$("callOutputVolumeValue");if(v)v.textContent=Math.round(callVolumeLevel*100)+"%";applyCallVolumeState();});
 $("refreshAudioDevices")?.addEventListener("click",async()=>{await loadAudioDevices();appToast("Dispositivos atualizados.","success")});
 $("testMicBtn")?.addEventListener("click",testMicrophone);
 updateAudioSettingsUI();loadAudioDevices();
}
let lastAutoQualityAt=0;
function maybeAutoQuality(q){
 if(!callAudioSettings.autoQuality||!q)return;
 // Sem medição real ainda: null??0 daria "0ms / 0% de perda", ou seja, uma rede
 // perfeita, e a qualidade subia sozinha sem nenhum dado para justificar.
 const rtt=Number.isFinite(q.rtt)?q.rtt:null,loss=Number.isFinite(q.loss)?q.loss:null;
 if(rtt==null&&loss==null)return;
 // Evita ficar trocando de perfil a cada leitura (a cada 2,2s), o que enche o
 // status de mensagens e faz o encoder oscilar sem parar.
 if(Date.now()-lastAutoQualityAt<12000)return;
 const bad=(loss??0)>8||(rtt??0)>280;
 const veryBad=(loss??0)>15||(rtt??0)>450;
 const order=["low","medium","high","ultra"];
 let cur=order.indexOf(callAudioSettings.videoQuality);if(cur<0)cur=2;
 let next=cur;
 if(veryBad)next=0;
 else if(bad)next=Math.max(0,cur-1);
 else if((loss??99)<1&&(rtt??999)<100&&cur<2)next=cur+1;
 if(next!==cur){lastAutoQualityAt=Date.now();applyTransmissionProfile(order[next]);}
}
function withTimeout(promise,ms){
  return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error("MEDIA_TIMEOUT"),{name:"TimeoutError"})),ms))]);
}


/* FreeChat 2.5.1 — navegação por gesto no celular */
let mobileView=0;
let mobileSwipe={active:false,startX:0,startY:0,pointerId:null};
function isMobileLayout(){return window.matchMedia?.("(max-width: 900px)").matches===true}
function animateMainMenu(){const menu=document.getElementById("callMenu");if(!menu)return;menu.classList.remove("menu-enter");void menu.offsetWidth;menu.classList.add("menu-enter");setTimeout(()=>menu.classList.remove("menu-enter"),650)}

// Ações rápidas do menu principal
document.addEventListener("click",(e)=>{
  const btn=e.target.closest?.("[data-menu-action]");
  if(!btn)return;
  const action=btn.dataset.menuAction;
  if(action==="call") $("createCallBtn")?.click();
  else if(action==="feed") $("feedBtnMenu")?.click();
  else if(action==="friend"){
    const input=$("friendCodeInput");
    input?.focus();
    input?.scrollIntoView({behavior:"smooth",block:"center"});
  }
  else if(action==="servers") window.openServers?.();
  else if(action==="random") window.openRandomCall?.();
  else if(action==="admin") window.openAdminPanel?.();
  else if(action==="messages") window.openMessagesInbox?.();
  else if(action==="settings"){e.preventDefault();e.stopPropagation();window.openSettings?.();}
});
function setMobileView(view){
 view=Math.max(0,Math.min(2,Number(view)||0)); mobileView=view;
 const root=$("app"),nav=$("mobileNav"); if(!root)return;
 root.classList.toggle("mobile-view-call",view===0); root.classList.toggle("mobile-view-chat",view===1); root.classList.toggle("mobile-view-social",view===2);
 if(nav){nav.classList.toggle("hidden",!isMobileLayout()||!inCall);nav.querySelectorAll("[data-mobile-view]").forEach(b=>b.classList.toggle("active",Number(b.dataset.mobileView)===view));}
 const pos=$("mobileCallPosition"); if(pos)pos.textContent=view===0?"1/3 • Call":view===1?"2/3 • Chat":"3/3 • Social";
 const hint=$("mobileSwipeHint"); if(hint)hint.textContent=view===0?"Deslize ← para o chat • deslize novamente para Social":view===1?"Deslize ← para Social • → para voltar à call":"← para voltar ao chat • → para voltar à call";
 if(view===2){$("friendsPanel")?.classList.add("hidden");openSocial("feed");} else {$("socialPanel")?.classList.add("hidden");}
}
function syncMobileLayout(){if(!isMobileLayout()){$("mobileNav")?.classList.add("hidden");$("app")?.classList.remove("mobile-view-call","mobile-view-chat","mobile-view-social");return;} if(inCall)setMobileView(mobileView);else $("mobileNav")?.classList.add("hidden");}
function handleMobileSwipeStart(e){if(!isMobileLayout()||!inCall)return;if(e.pointerType==="mouse"&&e.button!==0)return;mobileSwipe={active:true,startX:e.clientX,startY:e.clientY,pointerId:e.pointerId};try{e.currentTarget.setPointerCapture?.(e.pointerId)}catch(_){} }
function handleMobileSwipeEnd(e){if(!mobileSwipe.active||e.pointerId!==mobileSwipe.pointerId)return;const dx=e.clientX-mobileSwipe.startX,dy=e.clientY-mobileSwipe.startY;mobileSwipe.active=false;if(Math.abs(dx)<58||Math.abs(dx)<Math.abs(dy)*1.15)return;if(dx<0)setMobileView(mobileView+1);else setMobileView(mobileView-1);}
function initMobileNavigation(){const call=$("call");if(call&&!call.dataset.swipeReady){call.dataset.swipeReady="1";call.addEventListener("pointerdown",handleMobileSwipeStart,{passive:true});call.addEventListener("pointerup",handleMobileSwipeEnd,{passive:true});call.addEventListener("pointercancel",handleMobileSwipeEnd,{passive:true});} document.querySelectorAll("#mobileNav [data-mobile-view]").forEach(b=>b.addEventListener("click",()=>setMobileView(Number(b.dataset.mobileView))));window.addEventListener("resize",syncMobileLayout,{passive:true});window.addEventListener("orientationchange",()=>setTimeout(syncMobileLayout,120),{passive:true});syncMobileLayout();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initMobileNavigation);else initMobileNavigation();


/* FreeChat 3.1.0 — WebRTC media hardening */
function getVideoDuration(file){
 return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file),v=document.createElement("video");
   v.preload="metadata";v.onloadedmetadata=()=>{const d=Number(v.duration);URL.revokeObjectURL(url);if(!Number.isFinite(d)||d<=0)reject(new Error("Duração inválida"));else resolve(d)};
   v.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Vídeo inválido"))};v.src=url;
 });
}

let selectedPostMedia=null,callStatsTimer=null,callChatHistory=[],callFocusedTile=null,postPreviewObjectUrl=null,connectWatchdogTimer=null;
function clearPostMedia(){selectedPostMedia=null;const i=$("postMedia");if(i)i.value="";const p=$("postMediaPreview");if(p){p.innerHTML="";p.classList.add("hidden")}if(postPreviewObjectUrl){URL.revokeObjectURL(postPreviewObjectUrl);postPreviewObjectUrl=null}}
function renderPostMediaPreview(file){
 const p=$("postMediaPreview");if(!p)return;
 p.classList.remove("hidden");p.innerHTML="";
 const wrap=document.createElement("div");wrap.className="post-preview-inner";
 const remove=document.createElement("button");remove.type="button";remove.className="preview-remove";remove.textContent="×";remove.onclick=clearPostMedia;
 postPreviewObjectUrl=URL.createObjectURL(file);
 if(file.type.startsWith("image/")){const img=document.createElement("img");img.src=postPreviewObjectUrl;wrap.appendChild(img)}
 else{const v=document.createElement("video");v.controls=true;v.playsInline=true;v.src=postPreviewObjectUrl;wrap.appendChild(v)}
 const info=document.createElement("span");info.textContent=file.name+" • "+(file.size/1024/1024).toFixed(1)+" MB";
 wrap.append(info,remove);p.appendChild(wrap);
}
$("postMediaBtn")?.addEventListener("click",()=>$("postMedia")?.click());
$("postMedia")?.addEventListener("change",async e=>{
 const f=e.target.files?.[0];if(!f)return;
 if(f.size>20*1024*1024){appToast("A mídia precisa ter no máximo 20 MB.","error");clearPostMedia();return}
 if(!/^(image\/|video\/)/i.test(f.type)){appToast("Use uma foto ou vídeo.","error");clearPostMedia();return}
 if(f.type.startsWith("video/")){
   try{const d=await getVideoDuration(f);if(d>60.5){appToast("O vídeo precisa ter até 1 minuto.","error");clearPostMedia();return}f._freechatDuration=d}catch(err){appToast("Não foi possível verificar a duração do vídeo.","error");clearPostMedia();return}
 }
 selectedPostMedia=f;renderPostMediaPreview(f);
});

function updateCallParticipantCount(){
 const n=Math.max(people?.size||0,document.querySelectorAll("#videos .tile").length);
 $("callParticipantCount")?.replaceChildren(document.createTextNode(String(n)));
 $("callEmptyState")?.classList.toggle("hidden",n>0);
}
function openCallPanel(kind="participants"){
 const panel=$("callSidePanel");if(!panel)return;
 panel.classList.remove("hidden");
 const title=$("callPanelTitle"),content=$("callPanelContent");if(!title||!content)return;
 if(kind==="chat"){
   title.textContent="Chat da call";
   content.innerHTML=`<div class="call-chat-list" id="callChatList">${callChatHistory.map(m=>`<div><b>${messageEscape(m.name)}</b><span>${messageEscape(m.text)}</span><small>${messageEscape(m.time||"")}</small></div>`).join("")}</div><form id="callChatForm" class="call-chat-form"><input id="callChatInput" maxlength="1000" placeholder="Mensagem para a call..."><button>➤</button></form>`;
   const list=$("callChatList");if(list)list.scrollTop=list.scrollHeight;
   $("callChatForm")?.addEventListener("submit",e=>{e.preventDefault();const v=$("callChatInput").value.trim();if(v&&socket?.connected){socket.emit("chat",{room,text:v});$("callChatInput").value="";$("callChatInput").focus()}});
 }else{
   title.textContent="Amigos na call • "+(people?.size||0);
   content.innerHTML=[...people.values()].map(u=>`<div class="call-person-row"><span class="call-person-avatar">${messageEscape((u.name||"?").charAt(0).toUpperCase())}</span><div><b>${messageEscape(u.name||"Participante")}</b><small>${u.id===socket?.id?"Você":(u.id===callHostId?"Criador da call":"Participante")}</small></div><span class="call-person-state">${u.id===callHostId?"👑":"🎙️"}</span></div>`).join("")||'<div class="muted">Nenhum participante.</div>';
 }
}
function closeCallPanel(){$("callSidePanel")?.classList.add("hidden")}
function setCallPanelFromChat(){openCallPanel("chat")}
$("callParticipantsBtn")?.addEventListener("click",()=>openCallPanel("participants"));
$("callParticipantsBtnBottom")?.addEventListener("click",()=>openCallPanel("participants"));


$("callPanelClose")?.addEventListener("click",closeCallPanel);
$("callSettingsBtn")?.addEventListener("click",()=>{$("callSettingsPanel")?.classList.toggle("hidden");closeCallPanel()});
$("callSettingsClose")?.addEventListener("click",()=>$("callSettingsPanel")?.classList.add("hidden"));
$("callVolumeBtn")?.addEventListener("click",toggleCallVolume);
$("callMusicBtn")?.addEventListener("click",()=>{$("callMusicPanel")?.classList.toggle("hidden");renderMusicPanel(musicState);$("callMusicSearch")?.focus()});
$("callMusicClose")?.addEventListener("click",()=>$("callMusicPanel")?.classList.add("hidden"));
$("musicLocalVolume")?.addEventListener("input",e=>setLocalMusicVolume(e.target.value));
$("musicLocalMute")?.addEventListener("click",toggleLocalMusicMute);
$("musicPause")?.addEventListener("click",()=>musicControl("music-pause"));
$("musicResume")?.addEventListener("click",()=>musicControl("music-resume"));
$("musicSkipPanel")?.addEventListener("click",()=>musicControl("music-next"));
$("musicStopPanel")?.addEventListener("click",()=>musicControl("music-stop"));
$("musicSharedVolume")?.addEventListener("input",e=>setSharedMusicVolume(e.target.value));
renderLocalMusicVolume();
$("callMusicSearchBtn")?.addEventListener("click",async()=>{
 const q=$("callMusicSearch")?.value.trim();if(!q)return;
 const box=$("callMusicResults");if(box)box.innerHTML='<div class="music-search-loading">🔎 Procurando músicas...</div>';
 try{
   const d=await api("/api/music/search?q="+encodeURIComponent(q));
   const tracks=(d.tracks||[]); box.innerHTML=tracks.map((t,i)=>`<div class="music-result"><div class="music-result-main">${t.artwork?`<img src="${messageEscape(t.artwork)}" alt="" loading="lazy">`:'<span class="music-result-art">🎵</span>'}<div><b>${messageEscape(t.title)}</b><small>${messageEscape(t.artist)}${t.duration?" • "+formatMusicTime(t.duration):""}</small></div></div><button type="button" data-track-index="${i}">＋ Fila</button></div>`).join("")||'<span class="muted">Nenhum resultado.</span>';
   box.querySelectorAll("[data-track-index]").forEach(b=>b.onclick=async()=>{const track=tracks[Number(b.dataset.trackIndex)];if(!track)return;const old=b.textContent;b.disabled=true;b.textContent="Adicionando…";try{await emitMusicCommand("music-play",{track});b.textContent="✓ Adicionada";appToast("Faixa adicionada à fila.","success");setTimeout(()=>{if(document.body.contains(b)){b.disabled=false;b.textContent="＋ Fila"}},900)}catch(e){b.disabled=false;b.textContent=old;appToast(e.message||"Não foi possível adicionar a faixa.","error");setCallStatus(e.message||"Não foi possível adicionar a faixa.","error")}});
 }catch(e){if(box)box.innerHTML="";appToast(e.message||"Não foi possível buscar música.","error")}
});
$("callSettingsPanel")?.addEventListener("change",e=>{if(e.target.id==="reduceCallMotion")document.documentElement.classList.toggle("reduce-call-motion",e.target.checked)});
initCallAudioSettings();
function updateCallQualityUI(q){
 const ping=q?.rtt!=null?Math.round(q.rtt)+" ms":"-- ms",fps=q?.fps!=null?Math.round(q.fps)+" fps":"-- fps";
 $("callStatsMini")?.replaceChildren(document.createTextNode(ping+" • "+fps));
 $("callPingValue")?.replaceChildren(document.createTextNode(ping));
 $("callFpsValue")?.replaceChildren(document.createTextNode(fps));
 $("callResValue")?.replaceChildren(document.createTextNode(q?.width&&q?.height?`${q.width}×${q.height}`:"--"));
 $("callLossValue")?.replaceChildren(document.createTextNode(q?.loss!=null?`${q.loss.toFixed(1)}%`:"--"));
 const quality=q?.rtt>400||q?.loss>8?"Instável":q?.rtt>220||q?.loss>3?"Boa":"Excelente";
 $("callQualityText")?.replaceChildren(document.createTextNode(quality));
 const qel=$("callQualityText");if(qel)qel.className=quality==="Instável"?"quality-bad":quality==="Boa"?"quality-good":"quality-best";
}
function watchdogRemoteAudio(){
  remoteAudioEls.forEach((audio,id)=>{
    if(!audio.paused)return;
    const p=audio.play();
    if(p?.catch)p.catch(()=>{
      const tile=document.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if(tile)showAudioButton(tile,audio);
      $("audioUnlock")?.classList.remove("hidden");
    });
  });
}
async function collectCallStats(){
 if(!inCall)return;
 watchdogRemoteAudio();
 if(!peers?.size){
   $("callStatsMini")?.replaceChildren(document.createTextNode("-- ms • -- fps"));
   const qel=$("callQualityText");
   if(qel){qel.replaceChildren(document.createTextNode("Sozinho na call"));qel.className="";}
   return;
 }
 let best=null;
 for(const pc of peers.values()){
   try{
     const stats=await pc.getStats();let rtt=null,loss=null,width=null,height=null,fps=null,relay=false;
     const candidateTypes={};
     stats.forEach(s=>{if(s.type==="candidate"){candidateTypes[s.id]=s.candidateType;}});
     stats.forEach(s=>{
       if(s.type==="candidate-pair"&&s.state==="succeeded"&&s.currentRoundTripTime!=null){
         rtt=Math.min(rtt==null?999:rtt,Number(s.currentRoundTripTime)*1000);
         const localType=candidateTypes[s.localCandidateId],remoteType=candidateTypes[s.remoteCandidateId];
         if(localType==="relay"||remoteType==="relay")relay=true;
       }
       if(s.type==="inbound-rtp"&&s.kind==="video"){width=Number(s.frameWidth||width||0);height=Number(s.frameHeight||height||0);fps=Number(s.framesPerSecond||fps||0);const total=Number(s.packetsReceived||0)+Number(s.packetsLost||0);if(total)loss=(Number(s.packetsLost||0)/total)*100;}
     });
     const cur={rtt,loss,width,height,fps,relay};if(!best||((rtt??999)+(loss??99)*20)<((best.rtt??999)+(best.loss??99)*20))best=cur;
   }catch(e){}
 }
 updateCallQualityUI(best||{});
 maybeAutoQuality(best||{});
 // Só avisa uma vez por call — saber que a conexão precisou de TURN ajuda a
 // diagnosticar "dá pra entrar mas não ouço/vejo ninguém" (NAT simétrico),
 // sem assustar quem está numa rede em que isso é normal e funciona bem.
 if(best?.relay&&!window.__relayNoticeShown){
   window.__relayNoticeShown=true;
   console.info("[Conversa Live] Conexão de call estabelecida via retransmissão TURN (rede com NAT restritivo).");
 }
}
function startCallStats(){clearInterval(callStatsTimer);callStatsTimer=setInterval(collectCallStats,2200);collectCallStats();startConnectWatchdog()}
function stopCallStats(){clearInterval(callStatsTimer);callStatsTimer=null;updateCallQualityUI({});clearTimeout(connectWatchdogTimer);connectWatchdogTimer=null;window.__relayNoticeShown=false;}
function startConnectWatchdog(){
  clearTimeout(connectWatchdogTimer);
  connectWatchdogTimer=setTimeout(()=>{
    if(!inCall||!peers?.size)return;
    const stuck=[...peers.values()].every(pc=>!["connected","completed"].includes(pc.iceConnectionState));
    if(stuck){
      setCallStatus("Não foi possível conectar com os outros participantes. Isso costuma acontecer quando a rede (Wi-Fi/4G, roteador ou firewall) bloqueia a conexão direta. Tente trocar de rede (ex.: Wi-Fi ↔ dados móveis) ou pedir para o outro participante tentar.","error");
    }
  },12000);
}

const originalAddVideo=addVideo;
addVideo=function(n,s,id){
 originalAddVideo(n,s,id);updateCallParticipantCount();
 const tile=document.querySelector(`[data-id="${CSS.escape(id)}"]`);if(!tile)return;
 tile.classList.add("neon-tile");
 if(id==="local")tile.classList.add("local-tile");
 let badge=tile.querySelector(".tile-status");if(!badge){badge=document.createElement("div");badge.className="tile-status";tile.appendChild(badge)}
 badge.textContent=id==="local"?"Você":(n||"Participante");
};
const originalRemoveVideo=removeVideo;
removeVideo=function(id){originalRemoveVideo(id);updateCallParticipantCount();};
const originalRenderPeople=renderPeople;
renderPeople=function(){originalRenderPeople();updateCallParticipantCount();if(!$("callSidePanel")?.classList.contains("hidden"))openCallPanel("participants")};

const originalOpenCall=openCall;
openCall=async function(){
 await originalOpenCall();
 if(inCall){$("callRoomLabel")?.replaceChildren(document.createTextNode("# "+room));startCallStats();updateCallParticipantCount();applyCallVolumeState();}else{applyCallVolumeState();}
};
const originalLeaveCall=leaveCall;
leaveCall=function(ending){stopCallStats();stopSpeakingMeter("local");closeCallPanel();$("callMusicPanel")?.classList.add("hidden");$("callSettingsPanel")?.classList.add("hidden");originalLeaveCall(ending);updateCallParticipantCount()};

const oldChatHandlerMarker="__freechat25chat";
if(!window[oldChatHandlerMarker]){
 window[oldChatHandlerMarker]=true;
 const oldAddMessage=addMessage;
 // Capture lobby messages in a lightweight call-side history without changing the main chat.
 socket?.on?.("chat",m=>{callChatHistory.push(m);if(callChatHistory.length>80)callChatHistory.shift();if(!$("callSidePanel")?.classList.contains("hidden")&&$("callPanelTitle")?.textContent==="Chat da call")openCallPanel("chat")});
}

/* FreeChat 2.5.1 — Social, notificações e PWA */
let socialLoaded=false;
function openSocial(tab="friends"){const panel=$("socialPanel");if(!panel)return;panel.classList.remove("hidden");switchSocialTab(tab);if(tab==="friends")window.renderFriends?.();if(tab==="notifications")loadNotifications();if(tab==="profile")loadProfile();}
let feedReturnScreen="callMenu";
let feedTopPostId=null,feedSyncTimer=null;
function startFeedSyncPolling(){
  stopFeedSyncPolling();
  feedSyncTimer=setInterval(checkForNewFeedPosts,45000);
}
function stopFeedSyncPolling(){
  if(feedSyncTimer){clearInterval(feedSyncTimer);feedSyncTimer=null}
  $("feedNewPostsBanner")?.classList.add("hidden");
}
async function checkForNewFeedPosts(){
  if(document.hidden||$("feedScreen")?.classList.contains("hidden"))return;
  try{
    const d=await api(`/api/feed?limit=1&offset=0&filter=${encodeURIComponent(feedFilter)}`);
    const latest=d.posts?.[0]?.id;
    if(latest&&feedTopPostId&&String(latest)!==String(feedTopPostId)){
      $("feedNewPostsBanner")?.classList.remove("hidden");
    }
  }catch(e){/* checagem silenciosa — não interrompe quem está lendo o feed */}
}
function openFeed(){
  feedReturnScreen = ($("app") && !$("app").classList.contains("hidden")) ? "app" : "callMenu";
  $("login")?.classList.add("hidden");$("callMenu")?.classList.add("hidden");$("app")?.classList.add("hidden");
  $("feedScreen")?.classList.remove("hidden");
  loadFeed();
  startFeedSyncPolling();
  // A tela do feed acabou de sair de "hidden" — só depois disso o navegador
  // sabe a altura real dela. Recalcular aqui evita que os cards do feed
  // fiquem "achatados" (a métrica só era calculada uma vez, no carregamento
  // da página, quando a tela ainda estava escondida e media 0px).
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.updateFeedSnapMetrics?.()));
}
function closeFeed(){
  $("feedScreen")?.classList.add("hidden");
  $(feedReturnScreen)?.classList.remove("hidden");
  stopFeedSyncPolling();
}
function closeSocialPanel(){$("socialPanel")?.classList.add("hidden");}
function switchSocialTab(tab){document.querySelectorAll(".social-tab,.social-v3-nav").forEach(b=>b.classList.toggle("active",b.dataset.socialTab===tab));["friends","notifications","profile"].forEach(x=>$("social"+x.charAt(0).toUpperCase()+x.slice(1))?.classList.toggle("hidden",x!==tab));}
function openPostComposer(){$("postComposerModal")?.classList.remove("hidden");document.body.classList.add("modal-open");setTimeout(()=>$("postBody")?.focus(),80);}
function closePostComposer(){$("postComposerModal")?.classList.add("hidden");document.body.classList.remove("modal-open");}
let feedDoubleTapTimer=null,feedOffset=0,feedLoading=false,feedHasMore=true,feedFilter="for_you";
let feedViewObserver=null,feedEventTimers=new Map();
const feedLikeLock=new Set(),feedSaveLock=new Set(),feedCommentCache=new Map();
function formatFeedDate(v){const d=new Date(v),now=Date.now(),diff=Math.max(0,now-d.getTime());if(diff<60000)return"agora";if(diff<3600000)return Math.floor(diff/60000)+" min";if(diff<86400000)return Math.floor(diff/3600000)+" h";if(diff<604800000)return Math.floor(diff/86400000)+" d";return d.toLocaleDateString([],{day:"2-digit",month:"short"})}
function feedAvatar(u,cls="post-avatar"){const initial=messageEscape((u.name||"?").trim().charAt(0).toUpperCase());const style=u.avatarUrl?` style="background-image:url(&quot;${serverUrl()+u.avatarUrl}&quot;);background-size:cover;background-position:center"`:"";return `<div class="${cls}"${style}>${u.avatarUrl?"":initial}</div>`}
function burstHeart(card){const media=card?.querySelector(".post-media");if(!media)return;const heart=document.createElement("div");heart.className="post-heart-burst";heart.textContent="♥";media.appendChild(heart);setTimeout(()=>heart.remove(),850)}
async function toggleLike(id,fromCard){if(feedLikeLock.has(String(id)))return;feedLikeLock.add(String(id));try{const d=await api("/api/feed/"+id+"/like",{method:"POST"});document.querySelectorAll(`[data-like="${id}"]`).forEach(b=>{b.classList.toggle("liked",d.liked);b.querySelector(".action-count")?.replaceChildren(document.createTextNode(d.likes));const icon=b.querySelector(".action-icon");if(icon)icon.textContent=d.liked?"♥":"♡"});if(d.liked&&fromCard)burstHeart(fromCard)}catch(e){appToast(e.message,"error")}finally{feedLikeLock.delete(String(id))}}
async function toggleSave(id){sendFeedEvent(id,"save");if(feedSaveLock.has(String(id)))return;feedSaveLock.add(String(id));try{const d=await api("/api/feed/"+id+"/save",{method:"POST"});document.querySelectorAll(`[data-save="${id}"]`).forEach(b=>{b.classList.toggle("saved",d.saved);b.querySelector(".action-icon")?.replaceChildren(document.createTextNode(d.saved?"🔖":"▱"));b.querySelector(".action-count")?.replaceChildren(document.createTextNode(d.saves||0))});appToast(d.saved?"Publicação salva.":"Publicação removida dos salvos.","success")}catch(e){appToast(e.message,"error")}finally{feedSaveLock.delete(String(id))}}
async function sharePost(post){sendFeedEvent(post?.id||post?.postId,"share");const text=(post.body||"").slice(0,180)||"Veja esta publicação no FreeChat.";try{if(navigator.share)await navigator.share({title:"FreeChat",text});else{await navigator.clipboard.writeText(text);appToast("Texto copiado para compartilhar.","success")}}catch(e){if(e?.name!=="AbortError")appToast("Não foi possível compartilhar.","error")}}
async function loadComments(id,box){if(!box)return;box.innerHTML='<div class="comment-loading">Carregando comentários…</div>';try{const d=await api("/api/feed/"+id+"/comments");feedCommentCache.set(String(id),d.comments||[]);renderComments(id,box,d.comments||[])}catch(e){box.innerHTML=`<div class="comment-error">${messageEscape(e.message||"Erro ao carregar comentários.")}</div>`}}
function renderComments(id,box,comments){box.innerHTML=`<div class="comments-list">${comments.length?comments.map(c=>`<div class="comment-item">${feedAvatar(c,"comment-avatar")}<div><b>${messageEscape(c.name)}</b><span>${messageEscape(c.body)}</span><small>${formatFeedDate(c.created_at)}</small></div></div>`).join(""):"<div class=\"comment-empty\">Ainda não há comentários.</div>"}</div><form class="comment-form" data-comment-form="${id}"><input maxlength="800" placeholder="Adicione um comentário…" autocomplete="off"><button type="submit">Enviar</button></form>`;box.querySelector("form")?.addEventListener("submit",async e=>{e.preventDefault();const input=e.currentTarget.querySelector("input"),body=input.value.trim();if(!body)return;const btn=e.currentTarget.querySelector("button");btn.disabled=true;try{const d=await api("/api/feed/"+id+"/comments",{method:"POST",body:JSON.stringify({body})});const arr=feedCommentCache.get(String(id))||[];arr.push(d.comment);feedCommentCache.set(String(id),arr);renderComments(id,box,arr);const count=document.querySelector(`[data-comments-count="${id}"]`);if(count)count.textContent=String(arr.length)}catch(err){appToast(err.message,"error");btn.disabled=false}})}
function toggleComments(card,id){const box=card?.querySelector(".comments-box");if(!box)return;const opening=box.classList.toggle("hidden")===false;if(opening){if(feedCommentCache.has(String(id)))renderComments(id,box,feedCommentCache.get(String(id)));else loadComments(id,box);}}
function postHtml(p){
 const safe=messageEscape(p.body||""),date=formatFeedDate(p.created_at),isOwn=Number(p.author_id)===Number(window.CONVERSA_USER?.id||0);
 let media="";
 if(p.media?.id){const src=mediaUrl(p.media);if(p.media.type==="image")media=`<div class="post-media" data-dbltap><img src="${src}" alt="${messageEscape(p.media.name||"Foto")}" loading="lazy" decoding="async"></div>`;else media=`<div class="post-media"><video controls playsinline preload="metadata" src="${src}"></video><small>🎬 ${Math.round(p.media.duration||0)}s</small></div>`}
 const textOnlyClass=p.media?.id?"":" text-only-post";
 return `<article class="post-card feed-tiktok-card${textOnlyClass}" data-post-id="${p.id}"><header class="post-head"><div class="post-head-main">${feedAvatar(p)}<div class="post-author"><b>${messageEscape(p.name)}</b><small>${messageEscape(p.code)} · ${date}</small></div></div>${p.code!==window.CONVERSA_USER?.code?`<button class="post-follow-btn ${p.isFollowing?"following":""}" data-follow-code="${messageEscape(p.code)}" type="button">${p.isFollowing?"Seguindo":"Seguir"}</button>`:""}<button class="post-more" type="button" aria-label="Mais opções" title="Mais opções">•••</button></header><div class="post-menu hidden" role="menu">${isOwn?`<button type="button" data-delete-post="${p.id}" class="post-menu-danger">🗑️ Excluir publicação</button>`:`<button type="button" data-close-post-menu="${p.id}">Fechar menu</button>`}</div>${media}${safe?`<div class="post-body">${safe.replace(/\n/g,"<br>")}</div>`:""}<div class="post-actions"><div class="post-actions-left"><button class="post-action ${p.liked?"liked":""}" data-like="${p.id}" type="button"><span class="action-icon">${p.liked?"♥":"♡"}</span><span class="action-count">${Number(p.likes||0)}</span></button><button class="post-action" data-comments="${p.id}" type="button"><span class="action-icon">◌</span><span class="action-count" data-comments-count="${p.id}">${Number(p.comments||0)}</span></button><button class="post-action" data-share="${p.id}" type="button"><span class="action-icon">➤</span></button></div><button class="post-action save-action ${p.saved?"saved":""}" data-save="${p.id}" type="button"><span class="action-icon">${p.saved?"🔖":"▱"}</span><span class="action-count">${Number(p.saves||0)}</span></button></div>${safe?`<div class="post-caption"><b>${messageEscape(p.name)}</b> ${safe.replace(/\n/g,"<br>")}</div>`:""}<div class="comments-box hidden"></div></article>`
}
async function deleteOwnPost(id,card){
 const postId=String(id||"");if(!postId||!card)return;
 if(!await fcConfirm("Esta ação não pode ser desfeita.",{title:"Excluir esta publicação?",confirmText:"Excluir",danger:true,kicker:"Publicação"}))return;
 const btn=card.querySelector('[data-delete-post]');if(btn)btn.disabled=true;
 try{
  await api("/api/feed/"+encodeURIComponent(postId),{method:"DELETE"});
  card.animate?.([{opacity:1,transform:"scale(1)"},{opacity:0,transform:"scale(.98)"}],{duration:180,easing:"ease",fill:"forwards"});
  setTimeout(()=>{
    card.remove();
    const list=$("feedList");
    if(list && !list.querySelector(".post-card")){
      $("feedEndState")?.classList.add("hidden");
      list.innerHTML='<div class="social-empty"><span>✦</span><b>Nada por aqui ainda</b><small>Publique algo para começar a conversa.</small></div>';
    }
  },170);
  appToast("Publicação excluída.","success");
 }catch(e){if(btn)btn.disabled=false;appToast(e.message||"Não foi possível excluir a publicação.","error")}
}
async function toggleFollow(btn){
 if(!btn)return;const code=btn.dataset.followCode;if(!code)return;const was=btn.classList.contains("following");btn.disabled=true;
 try{const d=await api("/api/follows/"+encodeURIComponent(code),{method:was?"DELETE":"POST"});btn.classList.toggle("following",!!d.following);btn.textContent=d.following?"Seguindo":"Seguir";appToast(d.following?"Agora você segue este perfil.":"Você deixou de seguir este perfil.","success");if(feedFilter==="following")loadFeed(true,true)}catch(e){appToast(e.message||"Não foi possível atualizar o seguimento.","error")}finally{btn.disabled=false}
}
function renderFeedStories(friends=[]){const box=$("feedStories");if(!box)return;const list=friends.slice(0,12);box.innerHTML=`<button class="story-bubble own" id="storyCreate" type="button">${feedAvatar(window.CONVERSA_USER||{},"story-avatar")}<span class="story-plus">＋</span><b>Seu perfil</b></button>`+list.map(f=>`<button class="story-bubble" type="button" data-story-code="${messageEscape(f.code)}">${feedAvatar(f,"story-avatar")}<span class="story-dot ${f.online?"online":""}"></span><b>${messageEscape((f.name||"Amigo").split(" ")[0])}</b></button>`).join("");$("storyCreate")?.addEventListener("click",openPostComposer);box.querySelectorAll("[data-story-code]").forEach(b=>b.addEventListener("click",()=>{const code=b.dataset.storyCode;const card=[...document.querySelectorAll(".post-card")].find(x=>x.textContent.includes(code));card?.scrollIntoView({behavior:"smooth",block:"center"})}))}
async function loadFeedStories(){try{const d=await api("/api/friends");renderFeedStories(d.friends||[])}catch(e){renderFeedStories([])}}
function setFeedLoading(on){$("feedLoadMore")?.classList.toggle("hidden",!on)}
function renderFeedError(e){const list=$("feedList");if(!list)return;list.classList.add("tiktok-list");$("feedScreen")?.querySelector(".feed-scroll")?.classList.add("tiktok-mode");list.innerHTML=`<div class="social-empty feed-error-state"><span>📡</span><b>Não foi possível carregar o feed</b><small>${messageEscape(e.message||"Verifique sua conexão.")}</small><button id="feedRetryBtn" class="secondary-btn small-btn" type="button">↻ Tentar novamente</button></div>`;$("feedRetryBtn")?.addEventListener("click",()=>loadFeed(true,true))}
async function loadFeed(reset=true,showSpinner=true){if(feedLoading)return;if(reset){feedOffset=0;feedHasMore=true;if($("feedList"))$("feedList").innerHTML="";$("feedEndState")?.classList.add("hidden");$("feedNewPostsBanner")?.classList.add("hidden")}if(!feedHasMore)return;feedLoading=true;setFeedLoading(true);try{const d=await api(`/api/feed?limit=12&offset=${feedOffset}&filter=${encodeURIComponent(feedFilter)}`);const list=$("feedList");if(!list)return;if(reset)feedTopPostId=d.posts?.[0]?.id??feedTopPostId;if(reset&&!d.posts?.length){list.innerHTML='<div class="social-empty"><span>✦</span><b>Seu feed está esperando por você</b><small>Publique algo e compartilhe com a comunidade do FreeChat.</small><button id="feedEmptyPost" class="primary-btn small-btn" type="button">＋ Criar publicação</button></div>';$("feedEmptyPost")?.addEventListener("click",openPostComposer)}else{list.insertAdjacentHTML("beforeend",(d.posts||[]).map(postHtml).join(""));bindFeedCards(list);feedOffset=d.offset||feedOffset+(d.posts||[]).length;feedHasMore=!!d.hasMore;initFeedAlgorithmObserver();if(!feedHasMore&&list.children.length)$("feedEndState")?.classList.remove("hidden")}}catch(e){if(reset)renderFeedError(e);else appToast(e.message,"error")}finally{feedLoading=false;setFeedLoading(false)}}
$("feedNewPostsBanner")?.addEventListener("click",()=>{loadFeed(true,true);$("feedList")?.scrollIntoView?.({behavior:"smooth",block:"start"});});
function bindFeedCards(root){root.querySelectorAll(".post-card:not([data-feed-bound])").forEach(card=>{card.dataset.feedBound="1";const id=card.dataset.postId;card.querySelector(`[data-like="${id}"]`)?.addEventListener("click",()=>toggleLike(id,card));card.querySelector(`[data-save="${id}"]`)?.addEventListener("click",()=>toggleSave(id));card.querySelector(`[data-comments="${id}"]`)?.addEventListener("click",()=>toggleComments(card,id));card.querySelector(`[data-share="${id}"]`)?.addEventListener("click",()=>{const p={id,body:card.querySelector(".post-body")?.innerText||card.querySelector(".post-caption")?.innerText||""};sharePost(p)});const more=card.querySelector(".post-more"),menu=card.querySelector(".post-menu");more?.addEventListener("click",e=>{e.stopPropagation();document.querySelectorAll(".post-menu:not(.hidden)").forEach(m=>{if(m!==menu)m.classList.add("hidden")});menu?.classList.toggle("hidden")});card.querySelector(`[data-follow-code]`)?.addEventListener("click",()=>toggleFollow(card.querySelector(`[data-follow-code]`)));
  card.querySelector(`[data-delete-post="${id}"]`)?.addEventListener("click",()=>deleteOwnPost(id,card));card.querySelector(`[data-close-post-menu="${id}"]`)?.addEventListener("click",()=>menu?.classList.add("hidden"));card.querySelector("[data-dbltap]")?.addEventListener("dblclick",()=>{const b=card.querySelector(`[data-like="${id}"]`);if(b&&!b.classList.contains("liked"))toggleLike(id,card);else burstHeart(card)});let last=0;card.querySelector("[data-dbltap]")?.addEventListener("touchend",()=>{const now=Date.now();if(now-last<320){const b=card.querySelector(`[data-like="${id}"]`);if(b&&!b.classList.contains("liked"))toggleLike(id,card);else burstHeart(card)}last=now},{passive:true})})}

function initFeedScroll(){
  const scroll=$("feedScreen")?.querySelector(".feed-scroll");
  if(!scroll||scroll.dataset.ready)return;
  scroll.dataset.ready="1";
  let loadTimer=0,snapTimer=0,snapping=false,resizeTimer=0;
  const updateSnapMetrics=()=>{
    const h=scroll.clientHeight;
    scroll.style.setProperty("--feed-scroll-h",`${h}px`);
    const tabs=scroll.querySelector(".feed-tiktok-tabs");
    if(tabs)scroll.style.setProperty("--feed-tabs-h",`${tabs.offsetHeight}px`);
    // Gives the first and last post enough breathing room to also reach the center.
    const space=Math.max(0,Math.round((h*0.5)-72));
    const list=$("feedList");
    if(list)list.style.setProperty("--feed-center-space",`${space}px`);
  };
  const snapToNearest=()=>{
    if(snapping||!scroll.classList.contains("tiktok-mode"))return;
    const cards=[...scroll.querySelectorAll(".feed-tiktok-card")];
    if(!cards.length)return;
    const sr=scroll.getBoundingClientRect(),center=sr.top+scroll.clientHeight/2;
    let best=null,bestDist=Infinity;
    for(const card of cards){
      const r=card.getBoundingClientRect();
      const d=Math.abs((r.top+r.height/2)-center);
      if(d<bestDist){bestDist=d;best=card;}
    }
    if(!best)return;
    const r=best.getBoundingClientRect();
    const delta=(r.top+r.height/2)-center;
    if(Math.abs(delta)<3)return;
    const start=scroll.scrollTop;
    const target=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,start+delta));
    const distance=target-start;
    const duration=Math.min(720,Math.max(520,Math.abs(distance)*1.35));
    const t0=performance.now();
    snapping=true;
    const ease=t=>1-Math.pow(1-t,3);
    const step=now=>{
      const p=Math.min(1,(now-t0)/duration);
      scroll.scrollTop=start+distance*ease(p);
      if(p<1)requestAnimationFrame(step);
      else{scroll.scrollTop=target;snapping=false;}
    };
    requestAnimationFrame(step);
  };
  const scheduleSnap=(delay=650)=>{
    clearTimeout(snapTimer);
    snapTimer=setTimeout(snapToNearest,delay);
  };
  updateSnapMetrics();
  window.updateFeedSnapMetrics=updateSnapMetrics;
  window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(updateSnapMetrics,100)},{passive:true});
  scroll.addEventListener("scroll",()=>{
    if(scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<700){
      clearTimeout(loadTimer);loadTimer=setTimeout(()=>loadFeed(false,false),180);
    }
    if(!snapping && !("onscrollend" in window))scheduleSnap(700);
  },{passive:true});
  if("onscrollend" in window){
    scroll.addEventListener("scrollend",()=>{if(!snapping)scheduleSnap(80)},{passive:true});
  }else{
    scroll.addEventListener("touchend",()=>scheduleSnap(700),{passive:true});
    scroll.addEventListener("wheel",()=>scheduleSnap(700),{passive:true});
  }
}
function setFeedFilter(v){feedFilter=v;document.querySelectorAll(".feed-tab").forEach(b=>b.classList.toggle("active",b.dataset.feedFilter===v));loadFeed(true,true)}
function sendFeedEvent(postId,eventType,dwellMs=0){if(!postId)return;api("/api/feed/event",{method:"POST",body:JSON.stringify({postId:Number(postId),eventType,dwellMs})}).catch(()=>{});}
function initFeedAlgorithmObserver(){const root=$("feedList");if(!root||!window.IntersectionObserver)return;if(feedViewObserver)feedViewObserver.disconnect();feedViewObserver=new IntersectionObserver(entries=>{entries.forEach(e=>{const id=e.target.dataset.postId;if(!id)return;if(e.isIntersecting&&e.intersectionRatio>=.65){sendFeedEvent(id,"view");if(!feedEventTimers.has(id)){const started=Date.now();feedEventTimers.set(id,setTimeout(()=>{sendFeedEvent(id,"dwell",Date.now()-started);feedEventTimers.delete(id)},2200));}}else{const t=feedEventTimers.get(id);if(t){clearTimeout(t);feedEventTimers.delete(id);}}})},{root:$("feedScreen")?.querySelector(".feed-scroll")||null,threshold:[.2,.65,.9]});root.querySelectorAll(".post-card").forEach(c=>feedViewObserver.observe(c));}
async function loadNotifications(){try{const d=await api("/api/notifications");const list=$("notificationList"),badge=$("notificationBadge");if(badge){badge.textContent=d.unread||0;badge.classList.toggle("hidden",!d.unread)}if(!list)return;if(!d.notifications?.length){list.innerHTML='<div class="social-empty">🔔<b>Nenhuma notificação</b><span>Quando algo acontecer, aparecerá aqui.</span></div>';return}list.innerHTML=d.notifications.map(n=>`<div class="notification-item ${n.read_at?"":"unread"}"><span class="notification-icon">${n.type==="message"?"💬":n.type==="friend"?"👥":"✨"}</span><div><b>${messageEscape(n.title)}</b><p>${messageEscape(n.body||"")}</p><small>${new Date(n.created_at).toLocaleString([],{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</small></div></div>`).join("")}catch(e){}}
async function loadProfile(){try{const d=await api("/api/me");const u=d.user||{};window.CONVERSA_USER={...window.CONVERSA_USER,...u};const name=u.name||"Usuário",code=u.code||"";["profileName"].forEach(id=>{const el=$(id);if(el)el.textContent=name});["profileCode","profileHeroCode"].forEach(id=>{const el=$(id);if(el)el.textContent=code});const handle=$("profileHandle");if(handle)handle.textContent=code;const input=$("profileNameInput");if(input)input.value=name;window.applyAvatar?.($("profileAvatar"),u.avatarUrl,name);$("removeAvatarBtn")?.classList.toggle("hidden",!u.avatarUrl);window.applyAvatar?.($("avatar"),u.avatarUrl,name);const fd=await api("/api/friends").catch(()=>({friends:[]}));const fs=fd.friends||[];if($("profileFriendsCount"))$("profileFriendsCount").textContent=String(fs.length);const sv=await api("/api/servers").catch(()=>({mine:[]}));if($("profileServersCount"))$("profileServersCount").textContent=String((sv.mine||[]).length);const pc=await api("/api/feed?limit=1&offset=0&filter=for_you").catch(()=>({}));if($("profilePostsCount"))$("profilePostsCount").textContent=String(pc.totalPosts??"—");}catch(e){}}
async function saveProfile(){const input=$("profileNameInput"),name=input?.value.trim();if(!name)return;try{const d=await api("/api/me",{method:"PATCH",body:JSON.stringify({name})});window.CONVERSA_USER={...window.CONVERSA_USER,...d.user};localStorage.setItem("conversaLiveUser",JSON.stringify(window.CONVERSA_USER));$("welcomeName").textContent=d.user.name;$("sideWelcomeName").textContent=d.user.name;$("me").textContent=d.user.name;appToast("Perfil atualizado!","success");$("profileEditor")?.classList.add("hidden");loadProfile();renderFriends();}catch(e){$("profileStatus").textContent=e.message||"Erro ao salvar."}}
function handleNewNotification(n){playFriendNotificationSound?.();appToast(n?.title||"Nova notificação","info");loadNotifications();}window.openSocial=openSocial;
async function uploadAvatar(file){
 if(!file)return;
 if(!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)){appToast("Use uma imagem JPG, PNG, WEBP ou GIF.","error");return}
 if(file.size>6*1024*1024){appToast("A imagem precisa ter até 6 MB.","error");return}
 const btn=$("profileAvatarBtn");btn?.classList.add("uploading");
 try{
  const fd=new FormData();fd.append("avatar",file);
  const d=await api("/api/me/avatar",{method:"POST",body:fd});
  window.CONVERSA_USER={...window.CONVERSA_USER,...d.user};
  localStorage.setItem("conversaLiveUser",JSON.stringify(window.CONVERSA_USER));
  localStorage.setItem("conversaLiveAvatarVersion",String(Date.now()));
  window.applyAvatar?.($("profileAvatar"),d.user.avatarUrl,d.user.name);
  window.applyAvatar?.($("avatar"),d.user.avatarUrl,d.user.name);
  socket?.emit("profile-updated",{avatarUrl:d.user.avatarUrl||null,name:d.user.name});
  $("removeAvatarBtn")?.classList.toggle("hidden",!d.user.avatarUrl);
  appToast("Foto de perfil atualizada!","success");
  renderFriends();
 }catch(e){appToast(e.message||"Não foi possível salvar a foto.","error")}
 finally{btn?.classList.remove("uploading");}
}
$("profileAvatarBtn")?.addEventListener("click",()=>$("profileAvatarInput")?.click());
$("profileAvatarInput")?.addEventListener("change",e=>{const f=e.target.files?.[0];uploadAvatar(f);e.target.value="";});
$("removeAvatarBtn")?.addEventListener("click",async()=>{
 try{
  const d=await api("/api/me/avatar",{method:"DELETE"});
  window.CONVERSA_USER={...window.CONVERSA_USER,...d.user};
  localStorage.setItem("conversaLiveUser",JSON.stringify(window.CONVERSA_USER));
  localStorage.setItem("conversaLiveAvatarVersion",String(Date.now()));
  window.applyAvatar?.($("profileAvatar"),null,d.user.name);
  window.applyAvatar?.($("avatar"),null,d.user.name);
  socket?.emit("profile-updated",{avatarUrl:null,name:d.user.name});
  $("removeAvatarBtn")?.classList.add("hidden");
  appToast("Foto removida.","success");
  renderFriends();
 }catch(e){appToast(e.message||"Não foi possível remover a foto.","error")}
});
$("socialBtn")?.addEventListener("click",()=>openSocial("friends"));$("feedBtn")?.addEventListener("click",openFeed);$("feedBtnMenu")?.addEventListener("click",openFeed);$("feedRefreshBtn")?.addEventListener("click",()=>loadFeed(true,true));$("feedRefreshBtnAlt")?.addEventListener("click",()=>loadFeed(true,true));$("feedBack")?.addEventListener("click",closeFeed);$("feedFab")?.addEventListener("click",openPostComposer);$("feedNewPostBtn")?.addEventListener("click",openPostComposer);$("feedInlineComposer")?.addEventListener("click",openPostComposer);$("feedInlineMedia")?.addEventListener("click",()=>{$("postMedia")?.click();openPostComposer()});document.querySelectorAll(".feed-tab").forEach(b=>b.addEventListener("click",()=>setFeedFilter(b.dataset.feedFilter)));initFeedScroll();loadFeedStories();$("postComposerClose")?.addEventListener("click",closePostComposer);$("socialClose")?.addEventListener("click",closeSocialPanel);$("profileEditBtnV3")?.addEventListener("click",()=>$("profileEditor")?.classList.remove("hidden"));$("profileEditBtn")?.addEventListener("click",()=>$("profileEditor")?.classList.remove("hidden"));$("profileEditBtnV3Row")?.addEventListener("click",()=>$("profileEditor")?.classList.remove("hidden"));$("profileEditorClose")?.addEventListener("click",()=>$("profileEditor")?.classList.add("hidden"));$("profileCopyCodeBtnV3")?.addEventListener("click",()=>$("copyUserCode")?.click());$("profileFriendsBtnV3")?.addEventListener("click",()=>openSocial("friends"));$("profileNotificationsBtnV3")?.addEventListener("click",()=>openSocial("notifications"));$("profileSupportBtnTopV3")?.addEventListener("click",()=>$("supportCreatorBtn")?.click());$("saveProfileBtn")?.addEventListener("click",saveProfile);$("socialRefreshFriends")?.addEventListener("click",()=>renderFriends());$("socialFriendsSearch")?.addEventListener("input",e=>{window.friendSearchTerm=e.target.value;renderFriends()});$("postBody")?.addEventListener("input",e=>$("postCount").textContent=e.target.value.length+"/1000");document.querySelectorAll(".social-tab,.social-v3-nav").forEach(b=>b.addEventListener("click",()=>{switchSocialTab(b.dataset.socialTab);const t=b.dataset.socialTab;if(t==="friends")renderFriends();if(t==="notifications")loadNotifications();if(t==="profile")loadProfile()}));$("postForm")?.addEventListener("submit",async e=>{
 e.preventDefault();
 const body=$("postBody").value.trim(),file=$("postMedia")?.files?.[0];
 if(!body&&!file){appToast("Escreva algo ou escolha uma foto/vídeo.","error");return}
 const btn=e.currentTarget.querySelector("button[type=submit]");btn.disabled=true;
 try{
   if(file){
     let duration=0;
     if(file.type.startsWith("video/"))duration=await getVideoDuration(file);
     const fd=new FormData();if(body)fd.append("body",body);fd.append("file",file);if(duration)fd.append("duration",String(duration));
     await api("/api/feed/media",{method:"POST",body:fd});
   }else await api("/api/feed",{method:"POST",body:JSON.stringify({body})});
   $("postBody").value="";$("postCount").textContent="0/1000";clearPostMedia();closePostComposer();await loadFeed();
   appToast("Publicado!","success");
 }catch(err){appToast(err.message,"error")}
 finally{btn.disabled=false}
});
$("markNotificationsRead")?.addEventListener("click",async()=>{try{await api("/api/notifications/read",{method:"POST"});loadNotifications()}catch(e){}});async function openCall(){
  if(inCall||joiningCall)return;
  const attempt=++callAttempt;
  if(!socket?.connected){
    $("callStatus").textContent="Conectando ao servidor...";
    addSystem("Aguarde a conexão com o servidor.");
    return;
  }

  joiningCall=true;
  $("call").classList.remove("hidden");
  $("app").classList.add("call-open");
  if(isMobileLayout())setMobileView(0);
  setCallStatus("Entrando na call... 🎧");
  const turnPromise=loadTurnCredentials(); // roda em paralelo com a captura de mídia, sem atrasar a entrada na call

  if(!navigator.mediaDevices?.getUserMedia){
    joiningCall=false;
    $("callStatus").textContent="Câmera/microfone indisponíveis. Use o site em HTTPS.";
    $("call").classList.add("hidden");
    $("app").classList.remove("call-open");
    return;
  }

  let stream=null;
  let mediaWarning="";
  try{
    try{
      stream=await withTimeout(navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},
        video:{width:{ideal:640,max:1280},height:{ideal:360,max:720},frameRate:{ideal:24,max:30}}
      }),8000);
    }catch(e){
      try{
        stream=await withTimeout(navigator.mediaDevices.getUserMedia({audio:true}),6000);
        mediaWarning="Câmera indisponível; entrando somente com áudio.";
      }catch(e2){
        // Não deixa a entrada da call travada se o navegador não liberar mídia.
        // Entramos sem mídia e permitimos tentar novamente pelos botões.
        stream=new MediaStream();
        mediaWarning=(e2?.name==="NotAllowedError")
          ? "Permissão de microfone/câmera negada. Você entrou sem mídia."
          : "Não foi possível acessar microfone/câmera. Você entrou sem mídia.";
      }
    }
  }catch(e){
    stream=new MediaStream();
    mediaWarning="Você entrou sem câmera/microfone. Tente ativá-los pelos controles da call.";
  }

  if(attempt!==callAttempt||!joiningCall){
    try{stream?.getTracks?.().forEach(t=>t.stop())}catch(e){}
    return;
  }

  localStream=stream;
  // A successful getUserMedia call can still return disabled tracks after a previous call.
  localStream.getTracks().forEach(t=>{t.enabled=true});
  stopMusicLocal();
  const localAudio=localStream.getAudioTracks()[0];
  if(localAudio){await applyMicTrackSettings(localAudio);}
  micOn=localStream.getAudioTracks().length>0;
  // A câmera começa ligada quando o dispositivo a disponibiliza. Isso evita
  // que participantes, especialmente em celulares, entrem na call com o
  // vídeo silenciosamente desativado e pareçam "invisíveis" para os outros.
  // O usuário continua podendo desligá-la imediatamente pelo controle.
  camOn=localStream.getVideoTracks().length>0;
  localStream.getVideoTracks().forEach(t=>{t.enabled=camOn});
  forcedMuted=false;
  updateMicButton();
  const b=$("cam");if(b){b.innerHTML=`<span class="control-icon">${camOn?"📷":"🚫"}</span><span>${camOn?"Câmera":"Câmera off"}</span>`;b.classList.toggle("muted",!camOn);}
  addVideo("Você",localStream,"local");
  setTileCamOff("local",true);
  if(localAudio)startSpeakingMeter("local",localStream,()=>micOn&&!forcedMuted);
  startMicMeter();
  await applyTransmissionProfile(callAudioSettings.videoQuality);

  // Só agora consideramos que a pessoa realmente entrou na call.
  inCall=true;
  joiningCall=false;
  if(isMobileLayout())setMobileView(0);
  setCallStatus(mediaWarning||"Conectando à chamada...");
  if(callVolumeMuted)appToast("O som da call está mudo (ficou assim de uma call anterior). Toque no botão 🔇 pra ligar de novo.","warn");

  // O servidor decide quem é o criador. Mesmo que o cliente ainda não saiba
  // o host, call-start retorna o host atual. Isso evita eleger a própria pessoa
  // por engano quando ela entra em uma call existente.
  callReady=true;
  setCallStatus("Conectando à chamada...", "warn");

  // O servidor confirma explicitamente que a entrada na call foi registrada.
  // Isso evita ficar preso no estado "Entrando na call..." quando o evento
  // call-host chega depois ou há uma reconexão do Socket.IO.
  if(attempt!==callAttempt||!inCall||!socket?.connected)return;
  try{await withTimeout(turnPromise,4000);}catch(e){} // não deixa a Cloudflare travar a entrada na call
  socket.emit("call-start",{room},(ack)=>{
    if(!inCall)return;
    if(ack?.ok){
      callHostId=ack.host||callHostId;
      setCallStatus(isHost()?"Você é o criador da call. 🎙️📷":"Conectado à call. Aguardando os outros participantes...", "ok");
      socket.emit("call-ready",{room});broadcastCameraState();
      if(isHost())requestReadyPeers();
      startPeerRepair();
    }else{
      setCallStatus("Não foi possível entrar na call. Tente novamente.","error");
    }
  });

  // Fallback para servidores/reconexões que não retornem acknowledgement.
  setTimeout(()=>{
    if(!inCall||attempt!==callAttempt)return;
    if(callHostId){
      setCallStatus(isHost()?"Você é o criador da call. 🎙️📷":"Conectado à call. Aguardando os outros participantes...", "ok");
      if(isHost())requestReadyPeers();
    }else if(socket?.connected){
      setCallStatus("Call ativa • aguardando participantes...", "ok");
      socket.emit("call-ready",{room});broadcastCameraState();
      startPeerRepair();
    }
  },1500);
}
function requestReadyPeers(){
  if(socket?.connected)socket.emit("call-ready-request",{room});
}
function startPeerRepair(){
  clearInterval(peerRepairTimer);
  peerRepairTimer=setInterval(()=>{
    if(!inCall||!callReady||!socket?.connected)return;
    // Reenvia o estado de pronto e tenta recuperar pares que ficaram sem
    // negociação após uma reconexão/entrada rápida. Só um lado por par cria
    // a oferta para evitar glare.
    socket.emit("call-ready",{room});
    for(const [id] of people){
      if(id===socket.id||peers.has(id))continue;
      if(socket.id>id)createPeer(id,true).catch(()=>{});
    }
    if(isHost())requestReadyPeers();
  },2500);
}
function stopPeerRepair(){clearInterval(peerRepairTimer);peerRepairTimer=null;}

let cfTurnRequested=false;
async function loadTurnCredentials(){
  if(cfTurnRequested||!window.CONVERSA_TOKEN)return;
  cfTurnRequested=true;
  try{
    const d=await window.api?.("/api/turn-credentials");
    if(d?.ok&&Array.isArray(d.iceServers)&&d.iceServers.length){
      ICE.iceServers.push(...d.iceServers);
      console.info("[Conversa Live] TURN da Cloudflare carregado como opção extra de conexão.");
    }
  }catch(e){
    // Sem problema: o TURN público de fallback (já presente em ICE.iceServers)
    // continua disponível mesmo se a Cloudflare não estiver configurada.
  }
}
async function createPeer(id,initiator){
  if(peers.has(id)||!localStream||!socket?.connected)return peers.get(id);

  const pc=new RTCPeerConnection(ICE);
  pc.pendingIce=[];
  peers.set(id,pc);

  const earlyIce=pendingRemoteIce.get(id)||[];
  pendingRemoteIce.delete(id);
  if(earlyIce.length)pc.pendingIce.push(...earlyIce);

  // Use the standard addTrack path. It creates the correct sendrecv
  // transceivers for both microphone and camera and is less error-prone than
  // manually constructing transceivers for each track.
  let hasVideoSender=false;
  for(const track of localStream.getTracks()){
    const sendTrack=(track.kind==="video"&&screenTrack)?screenTrack:track;
    try{
      const sender=pc.addTrack(sendTrack,localStream);
      if(track.kind==="video")hasVideoSender=!!sender;
    }catch(e){console.warn("addTrack",id,track.kind,e)}
  }
  // Sempre crie um m-line de vídeo. Assim, se a call começou sem câmera,
  // compartilhar a tela pode usar replaceTrack() sem depender de uma
  // renegociação tardia (que alguns navegadores/pares podem rejeitar).
  if(!hasVideoSender){
    try{pc.addTransceiver("video",{direction:"sendrecv"});}catch(e){console.warn("addTransceiver video",id,e)}
  }

  // Prefer Opus for voice when the browser exposes codec capabilities.
  try{
    const caps=RTCRtpSender.getCapabilities?.("audio");
    if(caps?.codecs){
      const opus=caps.codecs.filter(c=>/opus/i.test(c.mimeType));
      const rest=caps.codecs.filter(c=>!opus.includes(c));
      pc.getTransceivers().filter(t=>t.sender?.track?.kind==="audio").forEach(t=>{
        try{t.setCodecPreferences([...opus,...rest])}catch(e){}
      });
    }
  }catch(e){}
  // Garante prioridade alta de rede para o áudio desde o início da conexão —
  // antes, isso só era aplicado depois de trocar o microfone ou parar música,
  // deixando a primeira conexão de cada call sem essa proteção contra
  // disputa de banda com o vídeo.
  setPeersAudioProfile(musicTrack?"music":"voice");

  pc.onicecandidate=e=>{
    if(e.candidate)socket.emit("signal",{to:id,data:{type:"ice",candidate:e.candidate}});
  };
  pc.onicecandidateerror=e=>{
    if(e?.errorCode&&e.errorCode!==701)console.warn("WebRTC ICE candidate error",id,e.errorCode,e.url||"");
  };

  pc.ontrack=e=>{
    const track=e.track;
    if(!track)return;
    track.enabled=true;

    // Alguns navegadores móveis entregam áudio e vídeo em eventos ontrack
    // separados, e outros reutilizam o mesmo MediaStream. Manter um stream
    // remoto por participante evita que a chegada da segunda trilha substitua
    // a primeira e deixa o vídeo consistente entre Chrome Android, Safari iOS
    // e desktop.
    let stream=remoteMediaStreams.get(id);
    if(!stream){
      stream=e.streams?.[0]||new MediaStream();
      remoteMediaStreams.set(id,stream);
    }
    if(!stream.getTracks().some(t=>t.id===track.id)){
      try{stream.addTrack(track)}catch(err){console.warn("remote addTrack",id,err)}
    }

    const u=people.get(id);
    addVideo(u?.name||"Participante",stream,id);
    const tile=document.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if(!tile)return;
    const video=tile.querySelector("video");
    if(video){
      video.muted=true;
      video.autoplay=true;
      video.playsInline=true;
      video.srcObject=stream;
      video.play().catch(()=>{});
    }

    if(track.kind==="audio"){
      let audio=remoteAudioEls.get(id);
      if(!audio){
        audio=document.createElement("audio");
        audio.className="remote-call-audio";
        audio.autoplay=true;
        audio.playsInline=true;
        audio.setAttribute("aria-label","Áudio de "+(u?.name||"participante"));
        document.body.appendChild(audio);
        remoteAudioEls.set(id,audio);
        applyOutputDevice();
      }
      audio.srcObject=new MediaStream([track]);
      audio.muted=callVolumeMuted;
      audio.volume=callVolumeMuted?0:callVolumeLevel;
      startSpeakingMeter(id,audio.srcObject);
      const play=audio.play();
      if(play?.catch)play.catch(()=>{
        showAudioButton(tile,audio);
        $("audioUnlock")?.classList.remove("hidden");
      });
      setCallStatus("Áudio remoto recebido. 🎧","ok");
    }else if(track.kind==="video"){
      setTileCamOff(id,!track.enabled);
      setCallStatus("Vídeo remoto recebido. 📷","ok");
    }
  };

  pc.onconnectionstatechange=()=>{
    const st=pc.connectionState;
    if(st==="connected"){
      setCallStatus("Call conectada. 🎉 Áudio e vídeo conectados.","ok");
      startCallStats();
    }else if(st==="disconnected"){
      setCallStatus("Conexão interrompida — tentando recuperar...","warn");
    }else if(st==="failed"){
      setCallStatus("Falha na conexão WebRTC. Tentando reconectar...","error");
      try{
        if(pc.restartIce)pc.restartIce();
        if(initiator) setTimeout(async()=>{
          if(!peers.has(id)||pc.signalingState==="closed")return;
          try{
            const offer=await pc.createOffer({iceRestart:true});
            offer.sdp=enhanceOpusSdp(offer.sdp);
            await pc.setLocalDescription(offer);
            socket.emit("signal",{to:id,data:{type:"offer",sdp:pc.localDescription}});
          }catch(e){console.warn("ICE restart",e)}
        },300);
      }catch(e){}
    }
    if(st==="closed")closePeer(id);
  };

  pc.oniceconnectionstatechange=()=>{
    const st=pc.iceConnectionState;
    if(st==="connected"||st==="completed")setCallStatus("Conexão WebRTC estabelecida. 🎧📷","ok");
    if(st==="failed"&&initiator){
      try{pc.restartIce?.()}catch(e){}
    }
  };

  if(initiator){
    const offer=await pc.createOffer();
    offer.sdp=enhanceOpusSdp(offer.sdp);
    await pc.setLocalDescription(offer);
    socket.emit("signal",{to:id,data:{type:"offer",sdp:pc.localDescription}});
  }
  return pc;
}

function enhanceOpusSdp(sdp){
  if(!sdp)return sdp;
  try{
    const lines=sdp.split("\r\n");
    const opusLine=lines.find(l=>/^a=rtpmap:\d+ opus\/48000/i.test(l));
    if(!opusLine)return sdp;
    const pt=opusLine.match(/^a=rtpmap:(\d+)/)[1];
    let found=false;
    const next=lines.map(l=>{
      if(l.startsWith(`a=fmtp:${pt} `)){
        found=true;
        let fmtp=l;
        fmtp=/useinbandfec=/.test(fmtp)?fmtp.replace(/useinbandfec=\d/,"useinbandfec=1"):fmtp+";useinbandfec=1";
        fmtp=/usedtx=/.test(fmtp)?fmtp.replace(/usedtx=\d/,"usedtx=0"):fmtp+";usedtx=0";
        return fmtp;
      }
      return l;
    });
    if(!found){
      const idx=next.findIndex(l=>l===opusLine);
      if(idx>=0)next.splice(idx+1,0,`a=fmtp:${pt} useinbandfec=1;usedtx=0`);
    }
    return next.join("\r\n");
  }catch(e){return sdp}
}
async function renegotiatePeer(id,pc){
  try{
    if(pc.signalingState!=="stable")return;
    const offer=await pc.createOffer();
    offer.sdp=enhanceOpusSdp(offer.sdp);
    await pc.setLocalDescription(offer);
    socket.emit("signal",{to:id,data:{type:"offer",sdp:pc.localDescription}});
  }catch(e){console.warn("renegotiatePeer",id,e);}
}

async function handleSignal(m){
  if(!inCall)return;
  const id=m.from,d=m.data;
  if(!id||!d)return;

  try{
    if(d.type==="offer"){
      let pc=peers.get(id);
      if(!pc)pc=await createPeer(id,false);
      if(!pc)return;
      // If an old offer arrives while negotiating, replace the stale peer and
      // answer the newest offer instead of silently dropping it.
      if(pc.signalingState!=="stable"&&pc.signalingState!=="have-remote-offer"){
        try{pc.close()}catch(e){}
        peers.delete(id);
        pc=await createPeer(id,false);
        if(!pc)return;
      }
      await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      for(const c of pc.pendingIce.splice(0))await pc.addIceCandidate(c).catch(()=>{});
      const answer=await pc.createAnswer();
      answer.sdp=enhanceOpusSdp(answer.sdp);
      await pc.setLocalDescription(answer);
      socket.emit("signal",{to:id,data:{type:"answer",sdp:pc.localDescription}});
    }else if(d.type==="answer"){
      const pc=peers.get(id);
      if(pc&&pc.signalingState==="have-local-offer"){
        await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
        for(const c of pc.pendingIce.splice(0))await pc.addIceCandidate(c).catch(()=>{});
      }
    }else if(d.type==="ice"){
      const pc=peers.get(id);
      if(pc){
        if(pc.remoteDescription)await pc.addIceCandidate(d.candidate).catch(()=>{});
        else pc.pendingIce.push(d.candidate);
      }else{
        const q=pendingRemoteIce.get(id)||[];
        q.push(d.candidate);
        if(q.length>100)q.shift();
        pendingRemoteIce.set(id,q);
      }
    }
  }catch(err){
    console.error("WebRTC signal error",id,d.type,err);
    setCallStatus("Erro na negociação da call. Tentando novamente...","error");
  }
}

function closePeer(id){
  pendingRemoteIce.delete(id);
  const pc=peers.get(id);
  if(pc){try{pc.close();}catch(e){}peers.delete(id);}
  const audio=remoteAudioEls.get(id);
  if(audio){try{audio.pause()}catch(e){}try{audio.srcObject=null}catch(e){}audio.remove();remoteAudioEls.delete(id);}
  remoteMediaStreams.delete(id);
  stopSpeakingMeter(id);
  removeVideo(id);
}
function applyCallVolumeState(){
 localStorage.setItem("freechatCallVolumeLevel",String(Math.round(callVolumeLevel*100)));
 document.querySelectorAll("#videos .tile video").forEach(v=>{if(v.closest(".local-tile")||v.dataset.local==="1")return;v.muted=true;}); remoteAudioEls.forEach(v=>{v.muted=callVolumeMuted;v.volume=callVolumeLevel;});
 const b=$("callVolumeBtn");if(b){b.classList.toggle("muted",callVolumeMuted);const i=b.querySelector(".control-icon");if(i)i.textContent=callVolumeMuted?"🔇":"🔊";const t=b.querySelector("span:not(.control-icon)");if(t)t.textContent=callVolumeMuted?"Sem som":"Volume";}
 const out=$("callOutputVolume");if(out)out.value=Math.round(callVolumeLevel*100);const ov=$("callOutputVolumeValue");if(ov)ov.textContent=Math.round(callVolumeLevel*100)+"%";applyOutputDevice();
}
function toggleCallVolume(){callVolumeMuted=!callVolumeMuted;localStorage.setItem("freechatCallVolumeMuted",callVolumeMuted?"1":"0");applyCallVolumeState();}
function addVideo(n,s,id){
  let tile=document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  let v=tile?.querySelector("video");
  if(!tile){
    tile=document.createElement("div");
    tile.className="tile"+(id==="local"?" local-tile":"");
    tile.dataset.id=id;
    v=document.createElement("video");
    const avatarWrap=document.createElement("div");
    avatarWrap.className="tile-avatar";
    avatarWrap.innerHTML='<div class="tile-avatar-ring"><span class="tile-avatar-photo">?</span></div>';
    const label=document.createElement("span");
    label.className="video-label";
    label.textContent=n;
    tile.append(v,avatarWrap,label);
    tile.addEventListener("click",e=>{
      if(e.target?.closest?.("button"))return;
      enterOrExitTileFocus(tile);
    });
    tile.classList.add("cam-off");
    $("videos").appendChild(tile);
  }
  const u=people.get(id);
  const label=tile.querySelector(".video-label");
  if(label)label.textContent=(n||u?.name||"Participante")+(id==="local" && micOn && !forcedMuted ? " • 🎙️" : "");
  const avatarPhoto=tile.querySelector(".tile-avatar-photo");
  if(avatarPhoto){
    const avatarUrl=id==="local"?window.CONVERSA_USER?.avatarUrl:u?.avatarUrl;
    const avatarName=id==="local"?(window.CONVERSA_USER?.name||"Você"):(u?.name||n||"Participante");
    window.applyAvatar?.(avatarPhoto,avatarUrl,avatarName);
  }
  v.autoplay=true;
  v.playsInline=true;
  v.muted=id==="local";
  v.dataset.local=id==="local"?"1":"0";
  v.volume=1;
  if(v.srcObject!==s)v.srcObject=s;
  const tryPlay=()=>{
    if(id!=="local"){v.muted=callVolumeMuted;v.volume=callVolumeLevel;}
    else v.muted=true;
    const p=v.play();
    if(id!=="local" && p?.catch){
      p.catch(()=>{
        showAudioButton(tile,v);
        $("audioUnlock")?.classList.remove("hidden");
      });
    }
  };
  if(v.readyState>=2)tryPlay();
  else v.onloadedmetadata=tryPlay;
}
function showAudioButton(tile,v){
  if(tile.querySelector(".audio-unlock"))return;
  const b=document.createElement("button");
  b.className="audio-unlock";
  b.type="button";
  b.textContent="🔊 Ativar áudio";
  b.onclick=()=>{
    enableRemoteAudio(v);
    v.play().then(()=>{b.remove();$("audioUnlock")?.classList.add("hidden");}).catch(()=>{});
  };
  tile.appendChild(b);
}
function removeVideo(id){document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();}
function setTileCamOff(id,off){
  const tile=document.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if(tile)tile.classList.toggle("cam-off",!!off);
}
function setTileSpeaking(id,speaking){
  const ring=document.querySelector(`[data-id="${CSS.escape(id)}"] .tile-avatar-ring`);
  if(ring)ring.classList.toggle("speaking",!!speaking);
}
const speakingLoops=new Map();
function stopSpeakingMeter(id){
  const loop=speakingLoops.get(id);
  if(loop){cancelAnimationFrame(loop.raf);try{loop.source?.disconnect()}catch(e){}speakingLoops.delete(id);}
  setTileSpeaking(id,false);
}
function startSpeakingMeter(id,stream,isActive){
  try{
    const track=stream?.getAudioTracks?.()[0];
    if(!track)return;
    stopSpeakingMeter(id);
    const Ctx=window.AudioContext||window.webkitAudioContext;
    if(!Ctx)return;
    if(!window.__freechatSpeakingCtx)window.__freechatSpeakingCtx=new Ctx();
    const ctx=window.__freechatSpeakingCtx;
    const source=ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser=ctx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=.55;
    source.connect(analyser);
    const data=new Uint8Array(analyser.fftSize);
    let speaking=false,aboveAt=0,belowAt=0;
    const tick=()=>{
      analyser.getByteTimeDomainData(data);
      let sum=0;for(let i=0;i<data.length;i++){const n=(data[i]-128)/128;sum+=n*n;}
      const rms=Math.sqrt(sum/data.length);
      const now=Date.now();
      const talking=rms>0.045 && (isActive?isActive():true);
      if(talking){belowAt=0;if(!aboveAt)aboveAt=now;if(!speaking && now-aboveAt>70){speaking=true;setTileSpeaking(id,true);}}
      else{aboveAt=0;if(!belowAt)belowAt=now;if(speaking && now-belowAt>350){speaking=false;setTileSpeaking(id,false);}}
      const raf=requestAnimationFrame(tick);
      speakingLoops.set(id,{raf,source});
    };
    tick();
  }catch(e){}
}
function enterOrExitTileFocus(tile){
  const isFs=document.fullscreenElement===tile||document.webkitFullscreenElement===tile;
  if(isFs){
    if(document.exitFullscreen)document.exitFullscreen().catch(()=>{});
    else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
    return;
  }
  if(tile.requestFullscreen){
    tile.requestFullscreen().catch(()=>fallbackTileFocus(tile));
    return;
  }
  const video=tile.querySelector("video");

  video?.setAttribute("playsinline","");
  video?.setAttribute("autoplay","");
  if(video.dataset.local==="1"){video.muted=true;video.volume=0;video.play().catch(()=>{});}
  else{video.muted=true;video.play().catch(()=>{});}
  applyCallVolumeState();
}
function fallbackTileFocus(tile){
  const wasFocused=tile.classList.contains("tile-focused");
  document.querySelectorAll("#videos .tile-focused").forEach(t=>t.classList.remove("tile-focused"));
  if(!wasFocused)tile.classList.add("tile-focused");
}
document.addEventListener("fullscreenchange",()=>{
  document.querySelectorAll("#videos .tile-focused").forEach(t=>t.classList.remove("tile-focused"));
});

function leaveCall(ending){
  clearInterval(callStatsTimer);callStatsTimer=null;stopPeerRepair();
  ++callAttempt;
  const wasHost=isHost();
  if(ending&&wasHost&&socket)socket.emit("call-end",{room});
  if(socket?.connected)socket.emit("call-leave",{room});
  if(inCall)window.playCallSound?.("leave",`self-leave:${room}`);
  // O próximo ciclo de call começa limpo, sem herdar eventos da call anterior.
  window.resetCallSoundSeen?.();
  inCall=false;callReady=false;joiningCall=false;
  peers.forEach(pc=>{try{pc.close();}catch(e){}});
  peers.clear();
  $("videos").innerHTML="";
  if(screenTrack){try{screenTrack.stop();}catch(e){}screenTrack=null;}
  updateScreenButton();
  stopMusic();
  if(musicAudioContext){try{musicAudioContext.close()}catch(e){}musicAudioContext=null;musicDestination=null;musicLocalGainNode=null;musicTransmitGainNode=null;}
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  stopMicMeter();stopMicrophoneTest();
  $("call").classList.add("hidden");
  $("app").classList.remove("call-open","mobile-view-call","mobile-view-chat","mobile-view-social");
  $("mobileNav")?.classList.add("hidden");
  mobileView=0;
  $("callStatus").textContent="Pronto.";
  forcedMuted=false;
  if(wasHost)callHostId=null;
  renderPeople();
}

function updateScreenShareBanner(){
  const banner=$("screenShareBanner");
  if(!banner)return;
  const shared=[...document.querySelectorAll("#videos .tile.sharing")];
  banner.classList.toggle("hidden",shared.length===0);
}
function updateScreenButton(){
  const btn=$("screen");if(!btn)return;
  if(screenTrack){btn.innerHTML='🛑 <span>Parar tela</span>';btn.classList.add("active-share");btn.title="Parar de transmitir a tela";}
  else{btn.innerHTML='🖥️ <span>Tela</span>';btn.classList.remove("active-share");btn.title="Compartilhar tela";}
}
let screenAudioTrack=null,screenAudioSource=null,screenAudioCtx=null,screenMixDestination=null;
function applyAudioTrackToPeers(track){
  if(!track)return;
  peers.forEach(pc=>{
    const sender=pc.getTransceivers().find(t=>t.sender?.track?.kind==="audio"||(t.receiver?.track?.kind==="audio"&&t.sender))?.sender
      || pc.getSenders().find(x=>x.track?.kind==="audio");
    if(sender)sender.replaceTrack(track).catch(()=>{});
  });
}
async function setupScreenAudioMix(track){
  screenAudioTrack=track;
  try{
    if(musicTrack&&musicAudioContext&&musicDestination){
      // Já existe uma mixagem rolando pra música — só soma o áudio da tela nela,
      // em vez de abrir um segundo grafo de áudio concorrente.
      screenAudioCtx=musicAudioContext;
      if(screenAudioCtx.state==="suspended")await screenAudioCtx.resume().catch(()=>{});
      screenAudioSource=musicAudioContext.createMediaStreamSource(new MediaStream([track]));
      const g=musicAudioContext.createGain();g.gain.value=1;
      screenAudioSource.connect(g);g.connect(musicDestination);
      applyAudioTrackToPeers(musicDestination.stream.getAudioTracks()[0]);
    }else{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return;
      screenAudioCtx=new Ctx();
      // Sem isso, se o navegador criar o contexto suspenso (comum quando isso
      // roda depois do usuário escolher a janela/tela no seletor nativo, um
      // instante "fora" do clique original), a trilha de saída fica sem som —
      // ela existe e chega no outro participante, mas carrega só silêncio.
      if(screenAudioCtx.state==="suspended")await screenAudioCtx.resume().catch(()=>{});
      screenMixDestination=screenAudioCtx.createMediaStreamDestination();
      const micTrack=localStream?.getAudioTracks?.()[0];
      if(micTrack){
        const micSrc=screenAudioCtx.createMediaStreamSource(new MediaStream([micTrack]));
        micSrc.connect(screenMixDestination);
      }
      const screenSrc=screenAudioCtx.createMediaStreamSource(new MediaStream([track]));
      const screenGain=screenAudioCtx.createGain();screenGain.gain.value=.85; // um pouco abaixo pra não abafar a voz
      screenSrc.connect(screenGain);screenGain.connect(screenMixDestination);
      screenAudioSource=screenSrc;
      applyAudioTrackToPeers(screenMixDestination.stream.getAudioTracks()[0]);
    }
  }catch(e){console.warn("screen-audio-mix",e);}
}
function teardownScreenAudioMix(){
  try{screenAudioSource?.disconnect();}catch(e){}
  if(screenAudioCtx&&screenAudioCtx!==musicAudioContext){try{screenAudioCtx.close();}catch(e){}}
  screenAudioSource=null;screenAudioCtx=null;screenMixDestination=null;screenAudioTrack=null;
  if(musicTrack&&musicDestination)applyAudioTrackToPeers(musicDestination.stream.getAudioTracks()[0]);
  else applyAudioTrackToPeers(localStream?.getAudioTracks?.()[0]||null);
}
function restoreCameraAfterScreenShare(){
  teardownScreenAudioMix();
  const cameraTrack=localStream?.getVideoTracks()[0];
  if(cameraTrack){
    peers.forEach(pc=>{
      const sender=pc.getTransceivers().find(t=>t.sender?.track?.kind==="video")?.sender || pc.getSenders().find(x=>x.track?.kind==="video");
      if(sender)sender.replaceTrack(cameraTrack).catch(()=>{});
    });
    const localVideo=document.querySelector('[data-id="local"] video');
    if(localVideo){localVideo.srcObject=localStream;localVideo.play().catch(()=>{});}
  }else{
    // Não havia câmera antes de compartilhar a tela (call entrou só com áudio),
    // então o sender de vídeo foi criado na hora para a tela — precisa ser
    // removido, ou os outros ficam vendo o último quadro da tela congelado.
    peers.forEach((pc,id)=>{
      const sender=pc.getSenders().find(x=>x.track?.kind==="video");
      if(sender){try{pc.removeTrack(sender);renegotiatePeer(id,pc);}catch(e){}}
    });
    const localVideo=document.querySelector('[data-id="local"] video');
    if(localVideo)localVideo.srcObject=null;
  }
  document.querySelector('[data-id="local"]')?.classList.remove("sharing");
  if(!camOn)document.querySelector('[data-id="local"]')?.classList.add("cam-off");
  if(socket?.connected)socket.emit("call-screen-state",{room,sharing:false});
  screenTrack=null;
  updateScreenShareBanner();
  updateScreenButton();
  $("callStatus").textContent=cameraTrack?"Câmera restaurada.":"Compartilhamento de tela encerrado.";
}
function stopScreenSharing(){
  if(!screenTrack)return;
  try{screenTrack.stop();}catch(e){}
  restoreCameraAfterScreenShare();
}
$("mic").onclick=()=>{
  if(!localStream)return;
  if(forcedMuted){$("callStatus").textContent="O criador silenciou seu microfone.";return;}
  micOn=!micOn;
  localStream.getAudioTracks().forEach(t=>t.enabled=micOn);
  updateMicButton();
};
$("cam").onclick=()=>{
  if(!localStream)return;
  camOn=!camOn;
  localStream.getVideoTracks().forEach(t=>t.enabled=camOn);
  const b=$("cam");if(b){b.innerHTML=`<span class="control-icon">${camOn?"📷":"🚫"}</span><span>${camOn?"Câmera":"Câmera off"}</span>`;b.classList.toggle("muted",!camOn);}
  setTileCamOff("local",!camOn);
  broadcastCameraState();
};
$("screen").onclick=async()=>{
  if(screenTrack){stopScreenSharing();return;}
  if(!localStream){$("callStatus").textContent="Entre na call antes de compartilhar a tela.";return;}
  if(!navigator.mediaDevices?.getDisplayMedia){
    $("callStatus").textContent="Seu navegador não oferece compartilhamento de tela.";
    return;
  }
  const screenBtn=$("screen");
  setBusy(screenBtn,true,"Abrindo...");
  try{
    let s=null,lastError=null;
    const attempts=[
      {video:{frameRate:{ideal:30,max:60}},audio:{systemAudio:"include",surfaceSwitching:"include"}},
      {video:{frameRate:{ideal:30,max:60}},audio:true},
      {video:true,audio:false}
    ];
    for(const constraints of attempts){
      try{s=await navigator.mediaDevices.getDisplayMedia(constraints);break;}
      catch(err){lastError=err;if(err?.name==="NotAllowedError"||err?.name==="AbortError")break;}
    }
    if(!s)throw lastError||new Error("Não foi possível iniciar o compartilhamento.");
    const track=s.getVideoTracks()[0],audioTrack=s.getAudioTracks()[0];
    if(!track){s.getTracks().forEach(t=>{try{t.stop()}catch(_){}});throw new Error("O navegador não retornou uma trilha de vídeo.");}
    screenTrack=track;
    updateScreenButton();
    const localTile=document.querySelector('[data-id="local"]');
    localTile?.classList.add("sharing"); localTile?.classList.remove("cam-off");
    updateScreenShareBanner();
    if(socket?.connected)socket.emit("call-screen-state",{room,sharing:true});
    const negotiations=[];
    peers.forEach((pc,id)=>{
      try{
        let tx=pc.getTransceivers().find(t=>t.sender?.track?.kind==="video"||t.receiver?.track?.kind==="video");
        if(!tx)tx=pc.getTransceivers().find(t=>t.kind==="video"&&t.direction!=="inactive");
        if(!tx)tx=pc.addTransceiver("video",{direction:"sendrecv"});
        const hadTrack=!!tx.sender.track;
        negotiations.push(tx.sender.replaceTrack(track).then(async()=>{
          if(!hadTrack&&pc.signalingState==="stable")await renegotiatePeer(id,pc);
        }).catch(async err=>{
          console.warn("screen replaceTrack",id,err);
          try{if(pc.signalingState==="stable")await renegotiatePeer(id,pc)}catch(e){console.warn("screen renegotiate",id,e);}
        }));
      }catch(e){console.warn("screen setup",id,e);}
    });
    await Promise.allSettled(negotiations);
    if(audioTrack)await setupScreenAudioMix(audioTrack);
    const v=document.querySelector('[data-id="local"] video');
    if(v){v.srcObject=s;v.muted=true;v.play().catch(()=>{});}
    $("callStatus").textContent=audioTrack?"Transmitindo sua tela com áudio. 🖥️🔊":"Transmitindo sua tela. 🖥️";
    track.onended=()=>{if(screenTrack===track)restoreCameraAfterScreenShare();};
    if(audioTrack)audioTrack.onended=()=>{if(screenAudioTrack===audioTrack)teardownScreenAudioMix();};
  }catch(e){
    $("callStatus").textContent=(e?.name==="NotAllowedError"||e?.name==="AbortError")?"Compartilhamento cancelado.":"Não foi possível compartilhar a tela. Tente novamente.";
    console.warn("screen-share",e);
  }finally{
    setBusy(screenBtn,false); updateScreenButton();
  }
};
async function leaveChatRoom(){
  if(!room)return;
  if(inCall&&!await fcConfirm("Você está em uma call. Sair do chat também vai encerrar sua participação nela.",{title:"Sair do chat?",confirmText:"Sair e encerrar call",danger:true,kicker:"Chamada"}))return;
  if(inCall)leaveCall(true);
  if(socket?.connected)socket.emit("leave-room",{room});
  room="";
  people.clear();renderPeople();
  $("videos").innerHTML="";
  $("messages").innerHTML='<div class="empty-chat" id="emptyChat"><div>💬</div><b>Comece a conversa</b><span>Envie uma mensagem para a sala.</span></div>';
  $("app").classList.add("hidden");$("socialPanel")?.classList.add("hidden");
  try{history.replaceState(null,"",location.pathname)}catch(e){}
  $("callMenu")?.classList.remove("hidden"); animateMainMenu();
  window.renderFriends?.();
}
$("leaveChat")?.addEventListener("click",leaveChatRoom);

document.addEventListener("keydown",e=>{
  if(e.key==="Escape")document.querySelectorAll("#videos .tile-focused").forEach(t=>t.classList.remove("tile-focused"));
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="e"){
    e.preventDefault();$("emoji").click();
  }
});

window.addEventListener("beforeunload",()=>{try{if(inCall&&socket?.connected)socket.emit("call-leave",{room});}catch(e){}});

/* FreeChat 2.5.1 — chat privado com fotos, vídeos e notificações */
let activeFriendCode=null, messageTimer=null, lastLoadedMessages=[], selectedMessageFile=null;
const DM_CACHE_PREFIX="freechat_dm_cache_v1_";
function dmCacheKey(code){return DM_CACHE_PREFIX+String(code||"").toUpperCase();}
function saveMessagesCache(code,messages){
  if(!code||!Array.isArray(messages))return;
  try{
    const compact=messages.slice(-500).map(m=>({id:m.id,sender_id:m.sender_id,receiver_id:m.receiver_id,body:m.body||"",created_at:m.created_at,read_at:m.read_at||null,media:m.media?{id:m.media.id,type:m.media.type,name:m.media.name,mime:m.media.mime,size:m.media.size,duration:m.media.duration,url:m.media.url}:null}));
    localStorage.setItem(dmCacheKey(code),JSON.stringify({savedAt:Date.now(),messages:compact}));
    localStorage.setItem("freechat_dm_last",String(code).toUpperCase());
  }catch(e){console.warn("dm cache",e)}
}
function loadMessagesCache(code){
  try{const raw=localStorage.getItem(dmCacheKey(code));if(!raw)return null;const d=JSON.parse(raw);return Array.isArray(d?.messages)?d.messages:null}catch(e){return null}
}
function removeMessagesCache(code){try{localStorage.removeItem(dmCacheKey(code))}catch(e){}}

function mediaUrl(m){return serverUrl()+String(m?.url||("/api/messages/media/"+encodeURIComponent(m?.id||"")))}
function requestDesktopNotifications(){try{if("Notification" in window&&Notification.permission==="default")Notification.requestPermission().catch(()=>{})}catch(e){}}
function notifyIncomingMessage(name,message){
  window.playFriendNotificationSound?.();
  appToast((name||"Alguém")+" enviou uma mensagem 💬","info");
  try{if(document.hidden&&"Notification" in window&&Notification.permission==="granted"){const n=new Notification("Nova mensagem — FreeChat",{body:message?.body||"Enviou uma foto ou vídeo",icon:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%236d5dfc'/%3E%3Cpath d='M17 19h30v22H29l-8 7v-7h-4z' fill='white'/%3E%3C/svg%3E"});n.onclick=()=>{window.focus();if(activeFriendCode)loadMessages(true);n.close()}}}catch(e){}
}
window.notifyIncomingMessage=notifyIncomingMessage;
function dmDateLabel(v){
 const d=new Date(v);if(Number.isNaN(d.getTime()))return '';
 const today=new Date();today.setHours(0,0,0,0);const x=new Date(d);x.setHours(0,0,0,0);const days=Math.round((today-x)/86400000);
 if(days===0)return 'Hoje';if(days===1)return 'Ontem';return d.toLocaleDateString([], {day:'2-digit',month:'long',year:d.getFullYear()===today.getFullYear()?undefined:'numeric'});
}
function appendDirectMessage(message,scrollToBottom=false){
  if(!message?.id)return;
  const key=String(message.id);
  if(lastLoadedMessages.some(m=>String(m.id)===key))return;
  lastLoadedMessages.push(message);
  lastLoadedMessages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  saveMessagesCache(activeFriendCode,lastLoadedMessages);
  renderMessagesList(scrollToBottom);
}
function renderMessagesList(scroll=true){
 const list=$("messagesList");if(!list)return;
 const term=($("messagesSearch")?.value||'').trim().toLowerCase();
 const msgs=term?lastLoadedMessages.filter(m=>String(m.body||'').toLowerCase().includes(term)||String(m.media?.name||'').toLowerCase().includes(term)):lastLoadedMessages;
 if(!msgs.length){list.innerHTML=term?'<div class="dm-empty"><div>🔎</div><b>Nada encontrado</b><span>Nenhuma mensagem corresponde à sua busca.</span></div>':'<div class="dm-empty"><div>💬</div><b>Comece a conversar</b><span>Envie uma mensagem, foto ou vídeo.</span></div>';return}
 let lastDay='';
 list.innerHTML=msgs.map((m,i)=>{
   const mine=String(m.sender_id)===String(window.CONVERSA_USER?.id),day=dmDateLabel(m.created_at),sep=day!==lastDay?(lastDay=day?`<div class="dm-day"><span>${messageEscape(day)}</span></div>`:'') : '';
   let media='';
   if(m.media?.id){const src=mediaUrl(m.media),name=messageEscape(m.media.name||'arquivo');
     if(m.media.type==='image')media=`<a class="dm-media-link" href="${src}" target="_blank" rel="noopener"><img class="dm-media-image" src="${src}" alt="${name}" loading="lazy"></a>`;
     else media=`<video class="dm-media-video" controls preload="metadata" playsinline src="${src}"></video><div class="dm-media-meta">🎬 ${name}${m.media.duration?` • ${Math.round(m.media.duration)}s`:''}</div>`;
   }
   let body=m.body?`<div class="dm-body">${messageEscape(m.body).replace(/\n/g,'<br>')}</div>`:'';
   const time=formatMessageTime(m.created_at),status=mine?(m.read_at?'✓✓':'✓'):'';
   const action=`<button class="dm-copy" type="button" title="Copiar mensagem" data-copy-id="${m.id}">⋯</button>`;
   return `${sep}<div class="message-row ${mine?'mine':'theirs'}" data-message-id="${m.id}"><div class="message-bubble ${mine?'mine':'theirs'}">${media}${body}<div class="dm-meta"><time>${time}</time>${status?`<span class="dm-read">${status}</span>`:''}${action}</div></div></div>`;
 }).join('');
 list.querySelectorAll('[data-copy-id]').forEach(btn=>btn.addEventListener('click',async()=>{const m=lastLoadedMessages.find(x=>String(x.id)===String(btn.dataset.copyId));if(!m)return;try{await navigator.clipboard.writeText(m.body||m.media?.name||'');appToast('Mensagem copiada.','success')}catch(e){appToast('Não foi possível copiar.','error')}}));
 if(scroll){
   requestAnimationFrame(()=>{ list.scrollTop=list.scrollHeight; });
 }
}
async function loadMessages(scroll=true){
 if(!activeFriendCode)return;
 const code=activeFriendCode;
 const list=$("messagesList");
 const wasAtBottom=list?list.scrollHeight-list.scrollTop-list.clientHeight<80:true;
 const oldMessages=Array.isArray(lastLoadedMessages)?lastLoadedMessages.slice():[];
 const cached=loadMessagesCache(code);
 if(cached?.length){
   lastLoadedMessages=cached;
   renderMessagesList(scroll);
   $("messageStatus").textContent="Sincronizando histórico…";
 }
 try{
   const d=await api("/api/messages/"+encodeURIComponent(code));
   if(code!==activeFriendCode)return;
   const incoming=Array.isArray(d.messages)?d.messages:[];
   const byId=new Map();
   for(const m of oldMessages)if(m?.id!=null)byId.set(String(m.id),m);
   for(const m of (cached||[]))if(m?.id!=null)byId.set(String(m.id),m);
   for(const m of incoming)if(m?.id!=null)byId.set(String(m.id),m);
   const merged=[...byId.values()].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
   const changed=merged.length!==lastLoadedMessages.length || merged.some((m,i)=>String(m.id)!==String(lastLoadedMessages[i]?.id)||m.read_at!==lastLoadedMessages[i]?.read_at);
   lastLoadedMessages=merged;
   saveMessagesCache(code,lastLoadedMessages);
   if(changed)renderMessagesList(false);
   if(list&&wasAtBottom&&scroll)requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight});
   $("messagesFriendState").textContent=d.friend?.online?"● Online":"Conversa privada";
   $("messageStatus").textContent="";
 }catch(e){
   if(code!==activeFriendCode)return;
   if(cached?.length){$("messageStatus").textContent="Você está offline. Mostrando o histórico salvo.";}
   else $("messageStatus").textContent=e.message||"Não foi possível carregar a conversa.";
 }
}
function formatMessageTime(v){const d=new Date(v);if(Number.isNaN(d.getTime()))return "";return d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
function setSelectedMessageFile(file){selectedMessageFile=file||null;const info=$("messageFileInfo");if(!info)return;if(!file){info.textContent="";info.classList.add("hidden");return}info.classList.remove("hidden");info.innerHTML=`<span>${file.type.startsWith("image/")?"🖼️":"🎬"} ${messageEscape(file.name)}</span><button type="button" id="messageFileClear" aria-label="Remover arquivo">×</button>`;$("messageFileClear").onclick=()=>setSelectedMessageFile(null)}
let dmConversationsCache=[];
async function loadDirectConversations(){
 const box=$("messagesConversations");if(!box)return;
 box.innerHTML='<div class="dm-inbox-loading"><span>◌</span><b>Carregando conversas...</b></div>';
 try{
   const d=await api("/api/messages/conversations");
   dmConversationsCache=Array.isArray(d.conversations)?d.conversations:[];
   renderDirectConversations();
 }catch(e){
   box.innerHTML='<div class="dm-inbox-empty"><div>⚠️</div><b>Não foi possível carregar</b><small>'+messageEscape(e.message||"Tente novamente em alguns segundos.")+'</small><button type="button" class="secondary-btn small-btn" id="dmInboxRetry">↻ Tentar novamente</button></div>';
   $("dmInboxRetry")?.addEventListener("click",loadDirectConversations);
 }
}
function renderDirectConversations(){
 const box=$("messagesConversations");if(!box)return;
 const term=String($("messagesInboxSearch")?.value||"").trim().toLowerCase();
 const rows=dmConversationsCache.filter(c=>!term||String(c.name||"").toLowerCase().includes(term)||String(c.code||"").toLowerCase().includes(term));
 box.innerHTML="";
 if(!rows.length){box.innerHTML='<div class="dm-inbox-empty"><div>💬</div><b>'+(term?"Nenhuma conversa encontrada":"Você ainda não tem conversas")+'</b><small>'+(term?"Tente outro nome ou código.":"Quando alguém falar com você, a conversa aparecerá aqui.")+'</small></div>';return;}
 rows.forEach(c=>{
   const item=document.createElement("div");item.className="dm-conversation"+(c.pinned?" is-pinned":"");
   const last=c.lastMessage||{};let preview=last.body||"";if(!preview)preview=last.mediaType?.startsWith("video/")?"🎬 Vídeo":"🖼️ Foto";
   
   const when=last.created_at?dmInboxTime(last.created_at):"";
   item.innerHTML='<div class="dm-conversation-avatar"></div><div class="dm-conversation-main"><div class="dm-conversation-top"><b></b><span class="dm-conversation-time"></span></div><div class="dm-conversation-bottom"><span class="dm-conversation-preview"></span><button type="button" class="dm-pin-btn" title="'+(c.pinned?"Desafixar conversa":"Fixar conversa")+'">'+(c.pinned?"📌":"📍")+'</button><span class="dm-unread-badge" hidden></span></div></div>';
   window.applyAvatar?.(item.querySelector(".dm-conversation-avatar"),c.avatarUrl,c.name);
   item.querySelector("b").textContent=c.name||c.code;
   item.querySelector(".dm-conversation-time").textContent=when;
   item.querySelector(".dm-conversation-preview").textContent=preview;
   const ub=item.querySelector(".dm-unread-badge");if(Number(c.unread)>0){ub.textContent=Number(c.unread)>99?"99+":String(c.unread);ub.hidden=false}
   item.querySelector(".dm-pin-btn").onclick=async ev=>{ev.stopPropagation();const btn=ev.currentTarget;btn.disabled=true;try{const d=await api("/api/messages/conversations/"+encodeURIComponent(c.code)+"/pin",{method:"POST"});c.pinned=!!d.pinned;dmConversationsCache.sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||(new Date(b.lastMessage?.created_at||0)-new Date(a.lastMessage?.created_at||0)));renderDirectConversations();appToast(c.pinned?"Conversa fixada.":"Conversa desafixada.","success")}catch(e){appToast(e.message||"Não foi possível alterar a fixação.","error")}finally{btn.disabled=false}};
   item.onclick=()=>openMessages(c);
   box.appendChild(item);
 });
}
function dmInboxTime(v){const d=new Date(v);if(Number.isNaN(d.getTime()))return "";const now=new Date();const same=d.toDateString()===now.toDateString();return same?d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString([],{day:"2-digit",month:"2-digit"});}
function openMessagesInbox(){
 activeFriendCode=null;lastLoadedMessages=[];setSelectedMessageFile(null);
 $("messagesInboxView")?.classList.remove("hidden");$("messagesChatView")?.classList.add("hidden");
 const panel=$("messagesPanel");if(!panel)return;panel.classList.remove("hidden");document.body.classList.add("modal-open");
 if($("messagesInboxSearch"))$("messagesInboxSearch").value="";loadDirectConversations();
}
window.openMessagesInbox=openMessagesInbox;
window.openMessages=function(friend){
 if(!friend?.code)return;requestDesktopNotifications();window.clearUnread?.(friend.code);activeFriendCode=friend.code;lastLoadedMessages=[];setSelectedMessageFile(null);
 $("messagesInboxView")?.classList.add("hidden");$("messagesChatView")?.classList.remove("hidden");
 $("messagesFriendName").textContent=friend.name||friend.code;window.applyAvatar?.($("messagesFriendAvatar"),friend.avatarUrl,friend.name);$("messagesFriendState").textContent=friend.online?"● Online":"Conversa privada";const panel=$("messagesPanel");if(!panel)return;panel.classList.remove("hidden");document.body.classList.add("modal-open");$("messageStatus").textContent="";if($("messagesSearch"))$("messagesSearch").value="";loadMessages(true);setTimeout(()=>$("messageInput")?.focus(),80);
};
$("messageAttach")?.addEventListener("click",()=>{$("messageFile")?.click()});
$("messageFile")?.addEventListener("change",async e=>{
 const f=e.target.files?.[0];if(!f)return;
 const ok=/^(image\/|video\/)/i.test(f.type);
 if(!ok){appToast("Escolha uma foto ou vídeo válido.","error");e.target.value="";return}
 if(f.size>20*1024*1024){appToast("O arquivo precisa ter no máximo 20 MB.","error");e.target.value="";return}
 if(f.type.startsWith("video/")){
   try{const duration=await getVideoDuration(f);if(duration>60.5){appToast("O vídeo precisa ter até 1 minuto.","error");e.target.value="";return}f._freechatDuration=duration}catch(err){appToast("Não foi possível verificar a duração do vídeo.","error");e.target.value="";return}
 }
 setSelectedMessageFile(f)
});
$("messageForm")?.addEventListener("submit",async e=>{
 e.preventDefault();const input=$("messageInput"),body=input.value.trim(),file=selectedMessageFile;if(!activeFriendCode||(!body&&!file))return;const btn=e.currentTarget.querySelector("button[type=submit]");btn.disabled=true;$("messageStatus").textContent=file?"Enviando arquivo...":"Enviando...";
 try{
   const target=activeFriendCode;
   let sent;
   if(file){const fd=new FormData();fd.append("code",target);if(body)fd.append("body",body);fd.append("file",file);if(file._freechatDuration)fd.append("duration",String(file._freechatDuration));const d=await api("/api/messages/media",{method:"POST",body:fd});sent=d.message;$("messageFile").value="";setSelectedMessageFile(null)}
   else{const d=await api("/api/messages",{method:"POST",body:JSON.stringify({code:target,body})});sent=d.message}
   input.value="";appendDirectMessage(sent,true);$("messageStatus").textContent="Enviada ✓";
 }catch(err){$("messageStatus").textContent=err.message||"Erro ao enviar."}
 finally{btn.disabled=false;input.focus()}
});
function closePrivateChat(){ document.activeElement?.blur?.();const panel=$("messagesPanel");if(panel)panel.classList.add("hidden");activeFriendCode=null;setSelectedMessageFile(null);document.body.classList.remove("modal-open");refreshUnreadCounts(); }
function backToMessagesInbox(){activeFriendCode=null;setSelectedMessageFile(null);$("messagesChatView")?.classList.add("hidden");$("messagesInboxView")?.classList.remove("hidden");loadDirectConversations();}
function initPrivateChatUI(){
  $("messagesClose")?.addEventListener("click",closePrivateChat);$("messagesCloseInbox")?.addEventListener("click",closePrivateChat);
  $("messagesBack")?.addEventListener("click",backToMessagesInbox);
  $("directMessagesBtn")?.addEventListener("click",openMessagesInbox);
  $("messagesPanel")?.addEventListener("click",e=>{if(e.target.id==="messagesPanel")closePrivateChat();});
  $("messagesInboxSearch")?.addEventListener("input",renderDirectConversations);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initPrivateChatUI,{once:true});else initPrivateChatUI();
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("messagesPanel")?.classList.contains("hidden"))closePrivateChat();});
$("messageInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("messageForm")?.requestSubmit()}});
messageTimer=setInterval(()=>{if(!window.CONVERSA_TOKEN)return;refreshUnreadCounts()},10000);
document.addEventListener("DOMContentLoaded",()=>{$("friendsSearch")?.addEventListener("input",e=>{window.friendSearchTerm=e.target.value;renderFriends()});$("friendsSearchApp")?.addEventListener("input",e=>{window.friendSearchTerm=e.target.value;renderFriends()});$("messagesSearch")?.addEventListener("input",()=>renderMessagesList(false))});

/* FreeChat 2.5.1 — estabilidade global, rede e mobile polish */
(function(){
  let offlineToast=null;
  function setNetworkState(online){
    document.documentElement.classList.toggle("is-offline",!online);
    if(online){
      if(offlineToast){offlineToast.remove();offlineToast=null;}
      if(window.CONVERSA_TOKEN && typeof connectLobby==="function" && (!socket || !socket.connected)){
        try{connectLobby()}catch(e){}
      }
    }else if(!offlineToast){
      offlineToast=document.createElement("div");
      offlineToast.className="network-banner";
      offlineToast.setAttribute("role","status");
      offlineToast.textContent="Você está offline. Algumas funções ficam pausadas até a conexão voltar.";
      document.body.appendChild(offlineToast);
    }
  }
  window.addEventListener("online",()=>setNetworkState(true));
  window.addEventListener("offline",()=>setNetworkState(false));
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState!=="visible"||!navigator.onLine||!window.CONVERSA_TOKEN)return;
    try{if(socket?.connected)socket.emit("client-ping",performance.now());else connectLobby()}catch(e){}
  });
  setNetworkState(navigator.onLine);

  function syncViewportHeight(){
    const h=window.visualViewport?.height||window.innerHeight;
    document.documentElement.style.setProperty("--app-vh",`${h}px`);
  }
  syncViewportHeight();
  window.addEventListener("resize",syncViewportHeight,{passive:true});
  window.visualViewport?.addEventListener("resize",syncViewportHeight,{passive:true});

  const updateScrollLock=()=>{
    const modalOpen=[...document.querySelectorAll(".modal:not(.hidden)")].length>0;
    const mobileMenu=document.getElementById("callMenu");
    const authVisible=document.getElementById("login")&&!document.getElementById("login").classList.contains("hidden");
    document.body.classList.toggle("modal-open",modalOpen||authVisible);
  };
  const observer=new MutationObserver(updateScrollLock);
  observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:["class"]});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){document.querySelectorAll(".modal:not(.hidden)").forEach(m=>m.classList.add("hidden"));updateScrollLock()}});
  updateScrollLock();
})();


/* FreeChat 1.6.6 — modo tela cheia */
(function initFullscreen(){
  const btn=$("fullscreenBtn");
  if(!btn)return;
  const update=()=>{const active=!!document.fullscreenElement;btn.innerHTML=active?'↙ <span>Sair da tela cheia</span>':'⛶ <span>Tela cheia</span>';btn.title=active?'Sair da tela cheia':'Tela cheia'};
  btn.addEventListener("click",async()=>{
    try{
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({navigationUI:"hide"});
      else appToast("Seu navegador não permite tela cheia nesta página.","error");
    }catch(e){appToast("Não foi possível ativar a tela cheia. Tente novamente.","error")}
    update();
  });
  document.addEventListener("fullscreenchange",update);
  update();
})();

/* FreeChat 1.6.6 — apoio ao criador / PIX */
(function initCreatorSupport(){
  const modal=$("supportCreatorModal"), openBtn=$("supportCreatorBtn"), closeBtn=$("supportCreatorClose"), copyBtn=$("copyPixBtn"), keyEl=$("pixKey"), statusEl=$("pixCopyStatus");
  if(!modal||!openBtn)return;
  const close=()=>{modal.classList.add("hidden");document.body.classList.remove("modal-open")};
  const open=()=>{modal.classList.remove("hidden");document.body.classList.add("modal-open");setTimeout(()=>closeBtn?.focus(),0)};
  openBtn.addEventListener("click",open);
  closeBtn?.addEventListener("click",close);
  modal.addEventListener("click",e=>{if(e.target===modal)close()});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.classList.contains("hidden"))close()});
  copyBtn?.addEventListener("click",async()=>{
    const key=keyEl?.textContent?.trim()||"";
    if(!key)return;
    try{
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(key);
      else {const ta=document.createElement("textarea");ta.value=key;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();}
      if(statusEl){statusEl.textContent="Chave PIX copiada!";statusEl.className="status ok";setTimeout(()=>{statusEl.textContent="";statusEl.className="status"},2200)}
    }catch(e){if(statusEl){statusEl.textContent="Não foi possível copiar. Selecione a chave manualmente.";statusEl.className="status error"}}
  });
})();

/* PWA */
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();window._installPrompt=e;let b=$("pwaInstallBtn");if(!b){b=document.createElement("button");b.id="pwaInstallBtn";b.className="pwa-install";b.textContent="📲 Instalar FreeChat";document.body.appendChild(b);b.onclick=async()=>{try{await window._installPrompt?.prompt();window._installPrompt=null;b.remove()}catch(e){}}}});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(()=>{}));



/* ================= FreeChat 1.2.0 — Servidores + Conhecer alguém ================= */
(function initCommunityFeatures(){
  const $=id=>document.getElementById(id);
  let selectedServerId=null;
  let randomMatch=null;
  let randomQueueActive=false;
  let randomQueueTimer=null;
  let randomQueueRequest=null;

  function communityToast(msg,type="success"){
    if(typeof appToast==="function") appToast(msg,type);
    else console[type==="error"?"error":"log"](msg);
  }
  function currentUserId(){return Number(window.CONVERSA_USER?.id||0)}
  function avatarBackground(el,u){
    if(!el)return;
    if(u?.avatarUrl){
      el.style.backgroundImage=`url("${serverUrl()+u.avatarUrl}")`;
      el.textContent="";
    }else{
      el.style.backgroundImage="";
      el.textContent=(u?.name||"?").trim().charAt(0).toUpperCase()||"?";
    }
  }

  let serversTab="mine", serversData={mine:[],discover:[]},serverSearchTimer=null,serverLoading=false;
  function openServers(){
    $("serversPanel")?.classList.remove("hidden");
    $("serverCreateBox")?.classList.add("hidden");$("serverJoinBox")?.classList.add("hidden");
    switchServersTab("mine");loadServers();
  }
  function closeServers(){$("serversPanel")?.classList.add("hidden");selectedServerId=null;$('serverDetailSection')?.classList.add('hidden');}
  function switchServersTab(tab){
    serversTab=tab;
    document.querySelectorAll(".servers-tab").forEach(b=>b.classList.toggle("active",b.dataset.serversTab===tab));
    $("myServersSection")?.classList.toggle("hidden",tab!=="mine");$("discoverServersSection")?.classList.toggle("hidden",tab!=="discover");
    $("serverDetailSection")?.classList.add("hidden");
  }
  function toggleCreateBox(){
    $("serverJoinBox")?.classList.add("hidden");$("serverCreateBox")?.classList.toggle("hidden");
    if(!$('serverCreateBox')?.classList.contains('hidden'))setTimeout(()=>$('serverNameInput')?.focus(),50);
  }
  function toggleJoinBox(){
    $("serverCreateBox")?.classList.add("hidden");$("serverJoinBox")?.classList.toggle("hidden");
    if(!$('serverJoinBox')?.classList.contains('hidden'))setTimeout(()=>$('serverInviteInput')?.focus(),50);
  }
  function serverCard(s){
    const joined=!!s.joined, members=Number(s.member_count||0), initial=messageEscape((s.name||"S").trim().charAt(0).toUpperCase());
    return `<article class="server-item server-item-v2" data-server-card="${s.id}">
      <div class="server-icon">${initial}</div>
      <div class="server-item-info"><div class="server-item-title"><b>${messageEscape(s.name)}</b><span class="server-online-dot" title="Comunidade ativa"></span></div>
      <small>${messageEscape(s.description||"Uma comunidade do FreeChat")}</small><div class="server-item-meta"><span class="server-pill">👥 ${members} membro${members===1?"":"s"}</span><span class="server-pill ${s.is_public?"public":"private"}">${s.is_public?"🌍 Público":"🔒 Privado"}</span></div></div>
      <div class="server-actions">${joined?`<button class="secondary-btn tiny-btn" data-open-server="${s.id}">Abrir</button>`:`<button class="primary-btn tiny-btn" data-join-server="${s.id}">Entrar</button>`}</div>
    </article>`;
  }
  function renderServers(){
    const query=String($("serverSearchInput")?.value||"").trim().toLocaleLowerCase();
    const filter=list=>list.filter(s=>!query||[s.name,s.description,s.is_public?"público":"privado"].some(v=>String(v||"").toLocaleLowerCase().includes(query)));
    const mine=filter(serversData.mine),discover=filter(serversData.discover),mineBox=$("myServersList"),pubBox=$("discoverServersList");
    if($("myServersCount"))$("myServersCount").textContent=String(mine.length);
    const empty=(icon,title,text)=>`<div class="servers-empty"><div>${icon}</div><b>${title}</b><small>${text}</small></div>`;
    if(mineBox)mineBox.innerHTML=mine.length?mine.map(serverCard).join(""):empty("✦",query?"Nenhum resultado":"Você ainda não criou ou entrou em comunidades","Crie um servidor ou explore comunidades públicas para começar.");
    if(pubBox)pubBox.innerHTML=discover.length?discover.map(serverCard).join(""):empty("🌐",query?"Nenhuma comunidade encontrada":"Nenhuma comunidade pública disponível","Tente outra busca ou crie a sua própria comunidade.");
    document.querySelectorAll("[data-open-server]").forEach(b=>b.onclick=()=>openServer(Number(b.dataset.openServer)));
    document.querySelectorAll("[data-join-server]").forEach(b=>b.onclick=()=>joinServer(Number(b.dataset.joinServer)));
  }
  async function loadServers(){
    if(serverLoading)return;serverLoading=true;const status=$("serversStatus");if(status)status.textContent="Sincronizando comunidades…";
    try{const q=encodeURIComponent(String($("serverSearchInput")?.value||"").trim());const d=await api("/api/servers"+(q?`?q=${q}`:""));serversData={mine:Array.isArray(d.mine)?d.mine:[],discover:Array.isArray(d.discover)?d.discover:[]};renderServers();if(status)status.textContent="";}
    catch(e){if(status)status.textContent=e.message||"Não foi possível carregar os servidores."}
    finally{serverLoading=false}
  }
  function queueServerSearch(){clearTimeout(serverSearchTimer);serverSearchTimer=setTimeout(loadServers,260);renderServers();}
  async function createServer(){
    const name=$("serverNameInput")?.value.trim(),desc=$("serverDescInput")?.value.trim(),visibility=String($("serverVisibilityInput")?.value||"public").toLowerCase(),isPublic=visibility!=="private";if(!name||name.length<2)return communityToast("Dê um nome com pelo menos 2 caracteres.","error");
    const btn=$("serverCreateBtn");if(btn)btn.disabled=true;
    try{const d=await api("/api/servers",{method:"POST",body:JSON.stringify({name,description:desc,isPublic})});$("serverNameInput").value="";$("serverDescInput").value="";$("serverCreateBox")?.classList.add("hidden");communityToast("Servidor criado com sucesso!","success");await loadServers();if(d.server?.id)openServer(Number(d.server.id));}
    catch(e){communityToast(e.message||"Não foi possível criar o servidor.","error")}finally{if(btn)btn.disabled=false}
  }
  async function joinServer(id){
    const btn=document.querySelector(`[data-join-server="${CSS.escape(String(id))}"]`);if(btn)btn.disabled=true;
    try{await api(`/api/servers/${encodeURIComponent(id)}/join`,{method:"POST"});communityToast("Você entrou na comunidade!","success");await loadServers();openServer(id)}catch(e){communityToast(e.message||"Não foi possível entrar.","error")}finally{if(btn)btn.disabled=false}
  }
  async function joinServerByInvite(){
    const input=$("serverInviteInput"),code=String(input?.value||"").trim().toUpperCase().replace(/\s+/g,"");if(!code)return communityToast("Digite o código do convite.","error");
    const btn=$("serverJoinBtn");if(btn)btn.disabled=true;
    try{const d=await api("/api/servers/join",{method:"POST",body:JSON.stringify({inviteCode:code})});if(input)input.value="";$("serverJoinBox")?.classList.add("hidden");communityToast("Você entrou na comunidade!","success");await loadServers();if(d.server?.id)openServer(Number(d.server.id));}
    catch(e){communityToast(e.message||"Convite inválido.","error")}finally{if(btn)btn.disabled=false}
  }
  async function leaveServer(){
    if(!selectedServerId)return;if(!await fcConfirm("Você deixará de participar desta comunidade.",{title:"Sair desta comunidade?",confirmText:"Sair",danger:true,kicker:"Comunidade"}))return;
    try{await api(`/api/servers/${encodeURIComponent(selectedServerId)}/leave`,{method:"POST"});communityToast("Você saiu da comunidade.","success");selectedServerId=null;await loadServers();switchServersTab("mine");}catch(e){communityToast(e.message||"Não foi possível sair.","error")}
  }
  async function openServer(id){
    if(!Number.isSafeInteger(id)||id<1)return;const detail=$("serverDetailSection");if(detail)detail.classList.remove("hidden");$("myServersSection")?.classList.add("hidden");$("discoverServersSection")?.classList.add("hidden");
    try{
      const d=await api(`/api/servers/${encodeURIComponent(id)}`),s=d.server;if(!s)throw new Error("Servidor não encontrado.");selectedServerId=id;
      $("serverDetailIcon").textContent=(s.name||"S").trim().charAt(0).toUpperCase();$("serverDetailName").textContent=s.name;$("serverDetailDesc").textContent=s.description||"";$("serverDetailMeta").textContent=`👥 ${Number(s.member_count||0)} membro${Number(s.member_count||0)===1?"":"s"} · ${s.is_public?"Público":"Privado"}`;
      const inv=$("serverInviteCopyBtn"),view=$("serverInviteCodeView");if(s.invite_code){inv?.classList.remove("hidden");view?.classList.remove("hidden");view.textContent="Convite: "+s.invite_code;inv.onclick=async()=>{try{await navigator.clipboard.writeText(s.invite_code);communityToast("Código copiado.","success")}catch(_){communityToast("Código: "+s.invite_code,"success")}}}else{inv?.classList.add("hidden");view?.classList.add("hidden")}
      const add=$("serverAddChannelBtn");if(add){add.classList.toggle("hidden",!["owner","admin"].includes(s.role));add.onclick=async()=>{const name=await fcPrompt("Escolha o nome que aparecerá na lista de canais.",{title:"Novo canal",confirmText:"Continuar",kicker:"Servidor",inputLabel:"Nome do canal",placeholder:"ex.: geral"});if(!name?.trim())return;const typeRaw=await fcPrompt("Digite text para canal de texto ou voice para canal de voz.",{title:"Tipo do canal",confirmText:"Criar canal",kicker:"Servidor",value:"text",inputLabel:"Tipo",placeholder:"text ou voice"});const type=(typeRaw||"text").toLowerCase();try{await api(`/api/servers/${id}/channels`,{method:"POST",body:JSON.stringify({name,type})});communityToast("Canal criado.","success");openServer(id)}catch(e){communityToast(e.message||"Não foi possível criar o canal.","error")}}}
      const ch=$("serverChannelsList"),textCh=(s.channels||[]).filter(c=>c.type!=="voice"),voiceCh=(s.channels||[]).filter(c=>c.type==="voice");
      const channelBtn=c=>`<button class="server-channel" type="button" data-community-channel="${c.id}" data-room="${messageEscape(c.room_name)}"><span class="server-channel-icon">${c.type==="voice"?"🔊":"#"}</span><span>${messageEscape(c.name)}</span><small>${c.type==="voice"?"Voz":"Texto"}</small></button>`;
      if(ch)ch.innerHTML=(textCh.length?`<div class="server-channel-group"><small>CANAIS DE TEXTO</small>${textCh.map(channelBtn).join("")}</div>`:"")+(voiceCh.length?`<div class="server-channel-group"><small>CANAIS DE VOZ</small>${voiceCh.map(channelBtn).join("")}</div>`:"")||'<div class="servers-empty mini"><div>＋</div><b>Nenhum canal</b><small>Um administrador pode criar o primeiro.</small></div>';
      ch?.querySelectorAll("[data-community-channel]").forEach(b=>b.onclick=()=>{const room=b.dataset.room;$("serversPanel")?.classList.add("hidden");joinRoom(room,window.CONVERSA_USER?.name||"Visitante");appToast("Entrando no canal…","success")});
      const members=$('serverMembersList');if(members){members.innerHTML=(s.members||[]).map(m=>`<div class="server-member"><div class="server-member-avatar">${messageEscape((m.name||"?").charAt(0).toUpperCase())}</div><div class="server-member-info"><b>${messageEscape(m.name||"Usuário")}</b><small>${messageEscape(m.code||"")}</small></div><span class="server-member-role">${m.role==='owner'?'👑 dono':m.role==='admin'?'🛡️ admin':'membro'}</span></div>`).join("")||'<span class="muted">Nenhum membro.</span>'}
      $("serverSidebarMemberCount").textContent=`${Number(s.member_count||0)} membro${Number(s.member_count||0)===1?"":"s"}`;
      $("serverMemberStat").textContent=String(s.member_count||0);$("serverChannelStat").textContent=String((s.channels||[]).length);$("serverTypeStat").textContent=s.is_public?"Público":"Privado";$("serverAboutText").textContent=s.description||"Esta comunidade ainda não adicionou uma descrição.";$("serverWelcomeTitle").textContent=`Bem-vindo a ${s.name}`;$("serverWelcomeDesc").textContent=s.description||"Escolha um canal para começar.";
      const manage=$("serverManageBtn");if(manage){const canManage=['owner','admin'].includes(s.role);manage.classList.toggle('hidden',!canManage);manage.onclick=async()=>{const name=await fcPrompt("Escolha o nome público da comunidade.",{title:"Editar servidor",confirmText:"Próximo",kicker:"Servidor",value:s.name,inputLabel:"Nome"});if(name===null)return;const desc=await fcPrompt("Atualize a descrição que os membros verão.",{title:"Editar descrição",confirmText:"Salvar",kicker:"Servidor",value:s.description||"",inputLabel:"Descrição",placeholder:"Sobre esta comunidade"});if(desc===null)return;try{await api(`/api/servers/${id}`,{method:"PATCH",body:JSON.stringify({name,description:desc,isPublic:s.is_public})});communityToast("Servidor atualizado.","success");openServer(id);loadServers()}catch(e){communityToast(e.message||"Não foi possível atualizar.","error")}}}

    }catch(e){detail?.classList.add("hidden");communityToast(e.message||"Não foi possível abrir o servidor.","error")}
  }
  function backServerList(){$("serverDetailSection")?.classList.add("hidden");switchServersTab(serversTab)}

  function stopRandomPolling(){
    if(randomQueueTimer){clearInterval(randomQueueTimer);randomQueueTimer=null}
    if(randomQueueRequest){try{randomQueueRequest.abort()}catch(e){}randomQueueRequest=null}
  }
  async function openRandomCall(){
    $("randomCallPanel")?.classList.remove("hidden");
    randomMatch=null;
    randomQueueActive=false;
    stopRandomPolling();
    showRandomState("ready");
    try{
      const p=await api("/api/security/privacy");
      const enabled=!!p.random_enabled;
      $("randomCallEnablePrompt")?.classList.toggle("hidden",enabled);
      const start=$("randomCallStartBtn");
      if(start)start.textContent=enabled?"🎲 Encontrar alguém":"🔓 Ativar e encontrar alguém";
      const status=$("randomCallStatus");
      if(status)status.textContent=enabled?"Pronto para entrar na fila.":"Você precisa permitir o Conhecer alguém para usar a fila.";
    }catch(e){
      $("randomCallEnablePrompt")?.classList.add("hidden");
      const status=$("randomCallStatus");if(status)status.textContent="Não foi possível carregar sua privacidade.";
    }
  }
  function showRandomState(state){
    $("randomCallState")?.classList.toggle("hidden",state!=="ready");
    $("randomCallWaiting")?.classList.toggle("hidden",state!=="waiting");
    $("randomCallMatch")?.classList.toggle("hidden",state!=="match");
  }
  async function pollRandomQueue(){
    if(!randomQueueActive||randomQueueRequest)return;
    const controller=new AbortController();
    randomQueueRequest=controller;
    try{
      const d=await api("/api/random/queue",{method:"POST",signal:controller.signal});
      if(d.match)setRandomMatch(d.match);
    }catch(e){
      if(e?.name!=="AbortError"&&!/servidor demorou/i.test(e.message||"")){
        const status=$("randomCallStatus");if(status)status.textContent=e.message||"Tentando reconectar à fila...";
      }
    }finally{if(randomQueueRequest===controller)randomQueueRequest=null}
  }
  async function startRandomQueue(){
    if(randomQueueActive)return;
    $("randomCallEnablePrompt")?.classList.add("hidden");
    const start=$("randomCallStartBtn");if(start)start.disabled=true;
    try{
      const privacy=await api("/api/security/privacy");
      if(!privacy.random_enabled){
        const updated=await api("/api/security/privacy",{method:"POST",body:JSON.stringify({random_enabled:true,message_policy:privacy.message_policy||"friends",call_policy:privacy.call_policy||"friends",friend_policy:privacy.friend_policy||"everyone"})});
        if($("privacyRandom"))$("privacyRandom").checked=!!updated.random_enabled;
        window.freechatPrivacy=updated;
      }
      randomQueueActive=true;showRandomState("waiting");
      const status=$("randomCallStatus");if(status)status.textContent="Conectando você à fila...";
      await pollRandomQueue();
      if(randomQueueActive&&!randomMatch){
        const s=$("randomCallStatus");if(s)s.textContent="Você está na fila. Procurando outra pessoa...";
        randomQueueTimer=setInterval(pollRandomQueue,3000);
      }
    }catch(e){
      randomQueueActive=false;showRandomState("ready");
      communityToast(e.message||"Não foi possível entrar na fila.","error");
    }finally{if(start)start.disabled=false}
  }
  async function enableRandomAndRetry(){
    const btn=$("randomCallEnableBtn");if(btn)btn.disabled=true;
    try{
      await api("/api/security/privacy",{method:"POST",body:JSON.stringify({random_enabled:true,message_policy:$("privacyMessages")?.value||"friends",call_policy:$("privacyCalls")?.value||"friends",friend_policy:$("privacyFriends")?.value||"everyone"})});
      if($("privacyRandom"))$("privacyRandom").checked=true;
      $("randomCallEnablePrompt")?.classList.add("hidden");
      await startRandomQueue();
    }catch(e){communityToast(e.message,"error")}
    finally{if(btn)btn.disabled=false}
  }
  async function leaveRandomQueue(){
    stopRandomPolling();
    try{await api("/api/random/leave",{method:"POST"})}catch(e){}
    randomQueueActive=false;showRandomState("ready");randomMatch=null;
    const status=$("randomCallStatus");if(status)status.textContent="";
  }
  async function closeRandomCall(){
    await leaveRandomQueue();
    $("randomCallPanel")?.classList.add("hidden");
  }
  function setRandomMatch(m){
    stopRandomPolling();
    randomMatch=m;randomQueueActive=false;showRandomState("match");
    $("randomMatchName").textContent=m.name||"Conexão encontrada";
    $("randomMatchCode").textContent=m.code?("Código "+m.code):"";
    avatarBackground($("randomMatchAvatar"),m);
  }
  async function nextRandom(){
    try{
      const d=await api("/api/random/next",{method:"POST"});
      if(d.match)setRandomMatch(d.match);else{randomQueueActive=true;showRandomState("waiting")}
    }catch(e){communityToast(e.message,"error")}
  }
  async function blockRandom(){
    if(!randomMatch?.code)return leaveRandomQueue();
    try{await api("/api/security/block",{method:"POST",body:JSON.stringify({code:randomMatch.code})});communityToast("Usuário bloqueado.","success")}catch(e){communityToast(e.message,"error")}
    await leaveRandomQueue();
  }
  function joinRandomMatch(){
    if(!randomMatch)return;
    const room=randomMatch.room||("random-"+randomMatch.matchId);
    $("randomCallPanel")?.classList.add("hidden");
    joinRoom(room,window.CONVERSA_USER?.name||"Visitante");
    setTimeout(()=>{if(socket?.connected&&!inCall)openCall()},300);
  }

  window.addEventListener("freechat:random-match",e=>{if(e.detail?.match){setRandomMatch(e.detail.match);communityToast("Você encontrou alguém!","success") }});
  window.addEventListener("pagehide",()=>{if(randomQueueActive&&window.CONVERSA_TOKEN){try{fetch(serverUrl()+"/api/random/leave",{method:"POST",headers:{Authorization:"Bearer "+window.CONVERSA_TOKEN,"Content-Type":"application/json"},keepalive:true,body:"{}"})}catch(_){}}});
  // Reativa o heartbeat imediatamente ao voltar para a aba ou à internet.
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&randomQueueActive)pollRandomQueue()},{passive:true});
  window.addEventListener("online",()=>{if(randomQueueActive)pollRandomQueue()});
  const watchSocket=setInterval(()=>{
    if(window.__freechatRandomSocketBound||!window.socket)return;
    try{
      window.__freechatRandomSocketBound=true;
      window.socket.on("random-match-found",payload=>{if(payload?.partner){setRandomMatch({matchId:payload.matchId,room:payload.room,...payload.partner});communityToast("Conexão encontrada!","success")}});
      clearInterval(watchSocket);
    }catch(e){}
  },250);
  /* ===== Painel de administração ===== */
  let adminTab="overview";
  async function checkAdminAccess(){
    try{const d=await api("/api/admin/check");$("adminMenuCard")?.classList.toggle("hidden",!d.isAdmin);}
    catch(e){$("adminMenuCard")?.classList.add("hidden");}
  }
  function openAdminPanel(){
    $("adminPanel")?.classList.remove("hidden");
    switchAdminTab("overview");
  }
  function closeAdminPanel(){$("adminPanel")?.classList.add("hidden");}
  function switchAdminTab(tab){
    adminTab=tab;
    document.querySelectorAll(".admin-tab").forEach(b=>b.classList.toggle("active",b.dataset.adminTab===tab));
    ["overview","users","reports","servers"].forEach(t=>$("admin"+t.charAt(0).toUpperCase()+t.slice(1))?.classList.toggle("hidden",t!==tab));
    if(tab==="overview")loadAdminStats();
    else if(tab==="users")loadAdminUsers();
    else if(tab==="reports")loadAdminReports();
    else if(tab==="servers")loadAdminServers();
  }
  async function loadAdminStats(){
    const grid=$("adminStatsGrid");if(!grid)return;
    try{
      const d=await api("/api/admin/stats");
      const card=(icon,label,value)=>`<div class="admin-stat-card"><span class="admin-stat-icon">${icon}</span><b>${value}</b><small>${label}</small></div>`;
      grid.innerHTML=[
        card("👤","Usuários totais",d.totalUsers),
        card("✅","E-mails verificados",d.verifiedUsers),
        card("🚫","Usuários suspensos",d.bannedUsers),
        card("🆕","Novos usuários (7 dias)",d.newUsers7d),
        card("📰","Publicações totais",d.totalPosts),
        card("📅","Publicações (24h)",d.postsToday),
        card("🌐","Servidores criados",d.totalServers),
        card("⚑","Denúncias abertas",d.openReports),
        card("💬","Mensagens (7 dias)",d.messages7d),
        card("📞","Salas ativas agora",d.activeRooms),
        card("🎥","Calls ativas agora",d.activeCalls),
      ].join("");
      const badge=$("adminReportsBadge");if(badge){badge.textContent=String(d.openReports||0);badge.classList.toggle("hidden",!d.openReports)}
    }catch(e){grid.innerHTML=`<div class="servers-empty mini"><div>⚠️</div><b>${messageEscape(e.message||"Erro ao carregar.")}</b></div>`}
  }
  async function loadAdminUsers(){
    const list=$("adminUsersList");if(!list)return;
    list.innerHTML='<div class="servers-empty mini"><div>…</div><b>Carregando…</b></div>';
    const q=$("adminUserSearch")?.value.trim()||"";
    try{
      const d=await api(`/api/admin/users?q=${encodeURIComponent(q)}&limit=40`);
      const users=d.users||[];
      list.innerHTML=users.map(u=>`
        <div class="admin-user-row">
          <div class="admin-user-info">
            <b>${messageEscape(u.name)} ${u.online?'<span class="admin-online-dot" title="Online"></span>':""}</b>
            <small>${messageEscape(u.email)} · ${messageEscape(u.code)} · ${u.postCount} post${u.postCount===1?"":"s"}</small>
            ${u.banned?`<small class="admin-banned-tag">🚫 Suspenso${u.banReason?": "+messageEscape(u.banReason):""}</small>`:""}
            ${!u.verified?'<small class="admin-unverified-tag">✉️ E-mail não verificado</small>':""}
          </div>
          <div class="admin-user-actions">
            ${u.banned?`<button class="secondary-btn tiny-btn" data-unban="${u.id}">Reativar</button>`:`<button class="danger-btn tiny-btn" data-ban="${u.id}" data-name="${messageEscape(u.name)}">Suspender</button>`}
          </div>
        </div>`).join("")||'<div class="servers-empty mini"><div>👤</div><b>Nenhum usuário encontrado.</b></div>';
      list.querySelectorAll("[data-ban]").forEach(b=>b.addEventListener("click",async()=>{
        const reason=await fcPrompt("Motivo da suspensão (opcional, visível para o usuário):",{title:"Suspender "+b.dataset.name+"?",confirmText:"Suspender",placeholder:"Ex: violação das regras da comunidade"});
        if(reason===null)return;
        try{await api(`/api/admin/users/${b.dataset.ban}/ban`,{method:"POST",body:JSON.stringify({reason})});communityToast("Usuário suspenso.","success");loadAdminUsers()}
        catch(e){communityToast(e.message||"Não foi possível suspender.","error")}
      }));
      list.querySelectorAll("[data-unban]").forEach(b=>b.addEventListener("click",async()=>{
        try{await api(`/api/admin/users/${b.dataset.unban}/unban`,{method:"POST"});communityToast("Usuário reativado.","success");loadAdminUsers()}
        catch(e){communityToast(e.message||"Não foi possível reativar.","error")}
      }));
    }catch(e){list.innerHTML=`<div class="servers-empty mini"><div>⚠️</div><b>${messageEscape(e.message||"Erro ao carregar.")}</b></div>`}
  }
  async function loadAdminReports(){
    const list=$("adminReportsList");if(!list)return;
    list.innerHTML='<div class="servers-empty mini"><div>…</div><b>Carregando…</b></div>';
    const status=$("adminReportsFilter")?.value||"open";
    try{
      const d=await api(`/api/admin/reports?status=${encodeURIComponent(status)}`);
      const reports=d.reports||[];
      list.innerHTML=reports.map(rp=>`
        <div class="admin-report-row">
          <div class="admin-report-info">
            <b>⚑ ${messageEscape(rp.reason)}</b>
            <small>Denunciado: <b>${messageEscape(rp.target.name)}</b> (${messageEscape(rp.target.code)})${rp.target.banned?" · 🚫 já suspenso":""}</small>
            <small>Por: ${messageEscape(rp.reporter.name)} · ${new Date(rp.createdAt).toLocaleString([],{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</small>
            ${rp.details?`<p class="admin-report-details">${messageEscape(rp.details)}</p>`:""}
          </div>
          <div class="admin-user-actions">
            ${rp.status==="open"?`<button class="secondary-btn tiny-btn" data-resolve="${rp.id}">Marcar resolvida</button>`:'<span class="server-pill public">Resolvida</span>'}
            ${!rp.target.banned?`<button class="danger-btn tiny-btn" data-ban="${rp.target.id}" data-name="${messageEscape(rp.target.name)}">Suspender</button>`:""}
          </div>
        </div>`).join("")||'<div class="servers-empty mini"><div>✦</div><b>Nenhuma denúncia por aqui.</b></div>';
      list.querySelectorAll("[data-resolve]").forEach(b=>b.addEventListener("click",async()=>{
        try{await api(`/api/admin/reports/${b.dataset.resolve}/resolve`,{method:"POST"});communityToast("Denúncia marcada como resolvida.","success");loadAdminReports();loadAdminStats()}
        catch(e){communityToast(e.message||"Não foi possível atualizar.","error")}
      }));
      list.querySelectorAll("[data-ban]").forEach(b=>b.addEventListener("click",async()=>{
        const reason=await fcPrompt("Motivo da suspensão:",{title:"Suspender "+b.dataset.name+"?",confirmText:"Suspender"});
        if(reason===null)return;
        try{await api(`/api/admin/users/${b.dataset.ban}/ban`,{method:"POST",body:JSON.stringify({reason})});communityToast("Usuário suspenso.","success");loadAdminReports()}
        catch(e){communityToast(e.message||"Não foi possível suspender.","error")}
      }));
    }catch(e){list.innerHTML=`<div class="servers-empty mini"><div>⚠️</div><b>${messageEscape(e.message||"Erro ao carregar.")}</b></div>`}
  }
  async function loadAdminServers(){
    const list=$("adminServersList");if(!list)return;
    list.innerHTML='<div class="servers-empty mini"><div>…</div><b>Carregando…</b></div>';
    const q=$("adminServerSearch")?.value.trim()||"";
    try{
      const d=await api(`/api/admin/servers?q=${encodeURIComponent(q)}`);
      const servers=d.servers||[];
      list.innerHTML=servers.map(s=>`
        <div class="admin-server-row">
          <div class="server-icon">${messageEscape(s.icon)}</div>
          <div class="admin-user-info"><b>${messageEscape(s.name)}</b><small>${messageEscape(s.description||"Sem descrição")}</small><small>👤 ${messageEscape(s.owner.name)} · 👥 ${s.memberCount} membro${s.memberCount===1?"":"s"} · ${s.isPublic?"🌍 Público":"🔒 Privado"}</small></div>
          <div class="admin-user-actions"><button class="danger-btn tiny-btn" data-del-server="${s.id}" data-name="${messageEscape(s.name)}">Excluir</button></div>
        </div>`).join("")||'<div class="servers-empty mini"><div>🌐</div><b>Nenhum servidor encontrado.</b></div>';
      list.querySelectorAll("[data-del-server]").forEach(b=>b.addEventListener("click",async()=>{
        if(!await fcConfirm("Isso remove o servidor e todos os canais permanentemente.",{title:"Excluir "+b.dataset.name+"?",confirmText:"Excluir",danger:true}))return;
        try{await api(`/api/admin/servers/${b.dataset.delServer}`,{method:"DELETE"});communityToast("Servidor excluído.","success");loadAdminServers();loadAdminStats()}
        catch(e){communityToast(e.message||"Não foi possível excluir.","error")}
      }));
    }catch(e){list.innerHTML=`<div class="servers-empty mini"><div>⚠️</div><b>${messageEscape(e.message||"Erro ao carregar.")}</b></div>`}
  }
  $("adminClose")?.addEventListener("click",closeAdminPanel);
  document.querySelectorAll(".admin-tab").forEach(b=>b.addEventListener("click",()=>switchAdminTab(b.dataset.adminTab)));
  $("adminUserSearchBtn")?.addEventListener("click",loadAdminUsers);
  $("adminUserSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter")loadAdminUsers()});
  $("adminReportsFilter")?.addEventListener("change",loadAdminReports);
  $("adminServerSearchBtn")?.addEventListener("click",loadAdminServers);
  $("adminServerSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter")loadAdminServers()});
  window.checkAdminAccess=checkAdminAccess;window.openAdminPanel=openAdminPanel;window.closeAdminPanel=closeAdminPanel;

  window.openServers=openServers;window.openRandomCall=openRandomCall;window.closeServers=closeServers;window.leaveRandomQueue=leaveRandomQueue;window.closeRandomCall=closeRandomCall;

  $("serverSearchInput")?.addEventListener("input",queueServerSearch);
  $("serversDiscoverHeroBtn")?.addEventListener("click",()=>switchServersTab("discover"));
  $("serversMyHeroBtn")?.addEventListener("click",()=>switchServersTab("mine"));
  $("serversBtn")?.addEventListener("click",openServers);
  $("serversClose")?.addEventListener("click",closeServers);
  $("serversRefreshBtn")?.addEventListener("click",loadServers);
  $("serverCreateToggleBtn")?.addEventListener("click",toggleCreateBox);
  $("serverJoinToggleBtn")?.addEventListener("click",toggleJoinBox);
  $("serverCreateCancelBtn")?.addEventListener("click",()=>$("serverCreateBox")?.classList.add("hidden"));
  $("serverCreateBtn")?.addEventListener("click",createServer);
  $("serverJoinBtn")?.addEventListener("click",joinServerByInvite);
  $("serverDetailBack")?.addEventListener("click",backServerList);
  $("serverLeaveBtn")?.addEventListener("click",leaveServer);
  document.querySelectorAll(".servers-tab").forEach(b=>b.addEventListener("click",()=>switchServersTab(b.dataset.serversTab)));

  $("randomCallBtn")?.addEventListener("click",openRandomCall);
  $("randomCallClose")?.addEventListener("click",closeRandomCall);
  $("randomCallStartBtn")?.addEventListener("click",startRandomQueue);
  $("randomCallEnableBtn")?.addEventListener("click",enableRandomAndRetry);
  $("randomCallCancelBtn")?.addEventListener("click",leaveRandomQueue);
  $("randomCallJoinBtn")?.addEventListener("click",joinRandomMatch);
  $("randomCallNextBtn")?.addEventListener("click",nextRandom);
  $("randomCallBlockBtn")?.addEventListener("click",blockRandom);

  // PWA: registra o Service Worker para cache/offline e abertura como aplicativo.
  // O registro é feito somente em HTTPS/localhost, conforme as regras do navegador.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", {scope: "./"})
        .then(reg => {
          if (reg.waiting) reg.waiting.postMessage({type: "SKIP_WAITING"});
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                worker.postMessage({type: "SKIP_WAITING"});
              }
            });
          });
        })
        .catch(err => console.warn("Service Worker não pôde ser registrado:", err));
    }, {once:true});
  }

  // Mantém o estado visual quando o usuário muda de call/sala.
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&$("serversPanel")&&!$("serversPanel").classList.contains("hidden"))loadServers()});
})();

/* FreeChat 1.6.6 — barra global, painel lateral e atalhos do novo layout */
(function initV150Shell(){
  const bind=(id,fn)=>{const el=$(id);if(el)el.addEventListener("click",fn)};
  const click=(id)=>$(id)?.click();
  bind("globalFriendsBtn",()=>click("friendsBtn"));
  bind("globalSettingsBtn",()=>click("settingsBtn"));
  bind("globalNotificationsBtn",()=>{if(typeof openSocial==="function")openSocial("notifications");});
  bind("menuSettingsBtn",()=>click("settingsBtn"));
  bind("profileSettingsBtn",()=>{ if(typeof openSocial==="function") openSocial("profile"); else click("settingsBtn"); });
  bind("profileEditBtn",()=>{ if(typeof openSocial==="function") openSocial("profile"); else click("settingsBtn"); });
  bind("profileFriendsBtn",()=>{if(typeof openSocial==="function")openSocial("friends");else click("friendsBtn")});
  bind("profileNotificationsBtn",()=>{ if(typeof openSocial==="function") openSocial("notifications"); });
  bind("profileSupportBtnTop",()=>click("supportCreatorBtn"));
  bind("profileSupportBtn",()=>click("supportCreatorBtn"));
  bind("profileCopyCodeBtn",()=>click("copyUserCode"));
  bind("profileLogoutBtn",()=>click("logoutBtn"));
  bind("profileMoreBtn",()=>{
    const panel=document.querySelector("#profileSidebar");
    panel?.classList.toggle("profile-more-open");
  });
  const search=$("globalSearchInput");
  if(search){
    const focusSearch=()=>{
      const target=$("friendsSearchApp")||$("friendsSearch")||$("msg");
      if(target){target.focus();target.select?.();}
    };
    search.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();focusSearch();}});
    document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();search.focus();search.select();}});
  }
  function syncShell(){
    const user=window.CONVERSA_USER||{};
    const name=user.name||$("me")?.textContent?.trim()||"Usuário";
    const code=user.code||$("myCode")?.textContent?.trim()||"CL-000000";
    const avatar=(name||"?").charAt(0).toUpperCase();
    [$("globalUserName")].filter(Boolean).forEach(e=>e.textContent=name);
    [$("globalUserAvatar")].filter(Boolean).forEach(e=>e.textContent=avatar);
    [$("profileSidebarName")].filter(Boolean).forEach(e=>e.textContent=name);
    [$("profileSidebarAvatar")].filter(Boolean).forEach(e=>e.textContent=avatar);
    [$("profileSidebarCode")].filter(Boolean).forEach(e=>e.textContent=code);
    [$("profileSidebarAbout")].filter(Boolean).forEach(e=>e.textContent=user.about||user.bio||"Seu perfil do FreeChat.");
  }
  syncShell();
  const room=$("headRoom");
  if(room)new MutationObserver(syncShell).observe(room,{subtree:true,childList:true,characterData:true});
  const me=$("me");
  if(me)new MutationObserver(syncShell).observe(me,{subtree:true,childList:true,characterData:true});
})();
