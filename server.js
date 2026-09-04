
const express=require("express"),http=require("http"),cors=require("cors"),crypto=require("crypto"),{Server}=require("socket.io"),{Pool}=require("pg");
const app=express();
app.set("trust proxy",1);
const configuredOrigins=String(process.env.FRONTEND_URL||"").split(",").map(v=>v.trim()).filter(Boolean);
const corsOptions={origin:(origin,cb)=>{if(!origin||configuredOrigins.length===0||configuredOrigins.includes("*")||configuredOrigins.includes(origin))return cb(null,true);return cb(null,false)},methods:["GET","POST","OPTIONS"],credentials:false};
app.use(cors(corsOptions));
app.use((req,res,next)=>{res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","DENY");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");res.setHeader("Permissions-Policy","camera=(self), microphone=(self), display-capture=(self)");next()});
app.use(express.json({limit:"32kb"}));
const server=http.createServer(app),io=new Server(server,{cors:{origin:(origin,cb)=>{if(!origin||configuredOrigins.length===0||configuredOrigins.includes("*")||configuredOrigins.includes(origin))return cb(null,true);return cb(null,false)},methods:["GET","POST"]}});
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});
const sessions=new Map(),rooms=new Map(),calls=new Map(),callReady=new Map(),rateLimits=new Map();
const SESSION_TTL_MS=7*24*60*60*1000;
function rateLimit(key,limit,windowMs){
  const now=Date.now(), old=rateLimits.get(key)||[];
  const fresh=old.filter(t=>now-t<windowMs);
  if(fresh.length>=limit)return false;
  fresh.push(now);rateLimits.set(key,fresh);return true;
}
function requestIp(req){return String(req.headers["x-forwarded-for"]||req.ip||"unknown").split(",")[0].trim();}
function guard(req,res,next){
  const key=requestIp(req)+":"+req.path;
  if(!rateLimit(key,20,10*60*1000))return res.status(429).json({error:"Muitas tentativas. Aguarde alguns minutos e tente novamente."});
  next();
}

const OTP_TTL_MS=10*60*1000;
const OTP_RESEND_MS=60*1000;
const OTP_MAX_ATTEMPTS=5;
const cleanEmail=v=>String(v||"").trim().toLowerCase().slice(0,120),cleanName=v=>String(v||"").trim().slice(0,24);
const hash=(p,s)=>crypto.scryptSync(p,s,64).toString("hex");
function code(){return "CL-"+crypto.randomBytes(3).toString("hex").toUpperCase()}
function pub(u){return{name:u.name,email:u.email,code:u.code}}
function token(u){const t=crypto.randomBytes(32).toString("hex");sessions.set(t,{email:u.email,expires:Date.now()+SESSION_TTL_MS});return t}
async function getUserByEmail(email){const r=await pool.query("SELECT id,name,email,code,salt,password_hash FROM users WHERE email=$1",[email]);return r.rows[0]}
async function getUserByCode(code){const r=await pool.query("SELECT id,name,email,code FROM users WHERE code=$1",[code]);return r.rows[0]}
async function auth(req,res){const t=String(req.headers.authorization||"").replace(/^Bearer /,"");const session=sessions.get(t);if(!session)return res.status(401).json({error:"Sessão inválida."});
if(session.expires<Date.now()){sessions.delete(t);return res.status(401).json({error:"Sessão expirada. Entre novamente."});}
const u=await getUserByEmail(session.email);if(!u)return res.status(401).json({error:"Sessão inválida."});return u}
function otpHash(code,salt){return crypto.scryptSync(String(code),salt,32).toString("hex")}
async function sendOtpEmail(to,name,code){
 const key=process.env.RESEND_API_KEY;
 if(!key)throw new Error("RESEND_API_KEY não configurada no servidor.");
 const from=process.env.EMAIL_FROM||"Conversa Live <onboarding@resend.dev>";
 const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;background:#101827;color:#fff;border-radius:16px"><h1 style="margin:0 0 10px">Conversa Live</h1><p>Olá, ${String(name).replace(/[<>&]/g,"")}!</p><p>Seu código de verificação em duas etapas é:</p><div style="font-size:34px;letter-spacing:8px;font-weight:700;background:#182338;padding:18px;text-align:center;border-radius:12px">${code}</div><p style="color:#b9c4d6">Ele expira em 10 minutos e só pode ser usado uma vez.</p><p style="color:#8f9bb0;font-size:13px">Se você não tentou entrar no Conversa Live, ignore este e-mail.</p></div>`;
 const resp=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject:"Seu código de verificação — Conversa Live",html})});
 if(!resp.ok){const text=await resp.text();throw new Error("Falha ao enviar e-mail: "+text.slice(0,300));}
}
async function createOtp(user){
 const recent=await pool.query("SELECT created_at FROM email_2fa_codes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",[user.id]);
 if(recent.rowCount && Date.now()-new Date(recent.rows[0].created_at).getTime()<OTP_RESEND_MS)throw new Error("Aguarde 60 segundos antes de solicitar outro código.");
 await pool.query("DELETE FROM email_2fa_codes WHERE user_id=$1 OR expires_at<NOW()",[user.id]);
 const code=String(crypto.randomInt(0,1000000)).padStart(6,"0"),salt=crypto.randomBytes(16).toString("hex"),challenge=crypto.randomBytes(32).toString("hex");
 await pool.query("INSERT INTO email_2fa_codes(challenge_token,user_id,code_salt,code_hash,expires_at,attempts) VALUES($1,$2,$3,$4,NOW()+INTERVAL '10 minutes',0)",[challenge,user.id,salt,otpHash(code,salt)]);
 try{await sendOtpEmail(user.email,user.name,code)}catch(e){await pool.query("DELETE FROM email_2fa_codes WHERE challenge_token=$1",[challenge]);throw e}
 return challenge;
}
async function initDb(){
 await pool.query(`CREATE TABLE IF NOT EXISTS users(
 id BIGSERIAL PRIMARY KEY,name VARCHAR(24) NOT NULL,email VARCHAR(120) UNIQUE NOT NULL,code VARCHAR(9) UNIQUE NOT NULL,
 salt TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW()
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS friend_requests(
 id BIGSERIAL PRIMARY KEY,sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status VARCHAR(12) NOT NULL DEFAULT 'pending',
 created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(sender_id,receiver_id)
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS friendships(
 id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 friend_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(user_id,friend_id)
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS email_2fa_codes(
 id BIGSERIAL PRIMARY KEY,challenge_token VARCHAR(64) UNIQUE NOT NULL,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 code_salt TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW()
 )`);
 await pool.query("CREATE INDEX IF NOT EXISTS email_2fa_user_idx ON email_2fa_codes(user_id)");
}
app.get("/",(_,r)=>r.send("Conversa Live server OK — v1.8 PostgreSQL + 2FA por e-mail"));
app.get("/health",async(_,r)=>{try{await pool.query("SELECT 1");r.json({ok:true,database:true,version:"1.8.1"})}catch(e){r.status(503).json({ok:false,database:false,version:"1.8.1"})}});
app.post("/api/2fa/verify",guard,async(q,r)=>{try{const challenge=String(q.body?.challenge||""),code=String(q.body?.code||"").replace(/\D/g,"");if(!/^[0-9]{6}$/.test(code)||challenge.length!==64)return r.status(400).json({error:"Código inválido."});const x=await pool.query(`SELECT c.*,u.id,u.name,u.email,u.code,u.salt,u.password_hash FROM email_2fa_codes c JOIN users u ON u.id=c.user_id WHERE c.challenge_token=$1 AND c.expires_at>NOW()`,[challenge]);if(!x.rowCount)return r.status(400).json({error:"Código expirado ou inválido. Solicite um novo código."});const row=x.rows[0];if(row.attempts>=OTP_MAX_ATTEMPTS){await pool.query("DELETE FROM email_2fa_codes WHERE id=$1",[row.id]);return r.status(429).json({error:"Muitas tentativas. Solicite um novo código."});}const h=otpHash(code,row.code_salt);if(!crypto.timingSafeEqual(Buffer.from(h,"hex"),Buffer.from(row.code_hash,"hex"))){await pool.query("UPDATE email_2fa_codes SET attempts=attempts+1 WHERE id=$1",[row.id]);return r.status(401).json({error:"Código incorreto."});}await pool.query("DELETE FROM email_2fa_codes WHERE id=$1",[row.id]);const u={id:row.id,name:row.name,email:row.email,code:row.code};r.json({user:pub(u),token:token(u)})}catch(e){console.error(e);r.status(500).json({error:"Erro ao verificar o código."})}});
app.post("/api/2fa/resend",guard,async(q,r)=>{try{const email=cleanEmail(q.body?.email),password=String(q.body?.password||""),u=await getUserByEmail(email);if(!u)return r.status(401).json({error:"E-mail ou senha incorretos."});const h=hash(password,u.salt);if(!crypto.timingSafeEqual(Buffer.from(h,"hex"),Buffer.from(u.password_hash,"hex")))return r.status(401).json({error:"E-mail ou senha incorretos."});const challenge=await createOtp(u);r.json({challenge,message:"Novo código enviado para seu e-mail."})}catch(e){console.error(e);r.status(e.message.includes("Aguarde 60")?429:500).json({error:e.message||"Não foi possível enviar o código."})}});
app.post("/api/register",guard,async(q,r)=>{try{const name=cleanName(q.body?.name),email=cleanEmail(q.body?.email),password=String(q.body?.password||"");if(name.length<2)return r.status(400).json({error:"O nome precisa ter pelo menos 2 caracteres."});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return r.status(400).json({error:"E-mail inválido."});if(password.length<6)return r.status(400).json({error:"A senha precisa ter pelo menos 6 caracteres."});if(await getUserByEmail(email))return r.status(409).json({error:"Este e-mail já possui uma conta."});let c;do c=code();while(await getUserByCode(c));const salt=crypto.randomBytes(16).toString("hex"),h=hash(password,salt);const x=await pool.query("INSERT INTO users(name,email,code,salt,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,code,salt,password_hash",[name,email,c,salt,h]);const u=x.rows[0];let challenge;try{challenge=await createOtp(u)}catch(e){await pool.query("DELETE FROM users WHERE id=$1",[u.id]);throw e}r.json({user:pub(u),challenge,message:"Conta criada. Enviamos um código de verificação para seu e-mail."})}catch(e){console.error(e);r.status(500).json({error:e.message||"Não foi possível criar a conta."})}});
app.post("/api/login",guard,async(q,r)=>{try{const email=cleanEmail(q.body?.email),p=String(q.body?.password||""),u=await getUserByEmail(email);if(!u)return r.status(401).json({error:"E-mail ou senha incorretos."});const h=hash(p,u.salt);if(!crypto.timingSafeEqual(Buffer.from(h,"hex"),Buffer.from(u.password_hash,"hex")))return r.status(401).json({error:"E-mail ou senha incorretos."});const challenge=await createOtp(u);r.json({user:pub(u),challenge,message:"Código enviado para seu e-mail."})}catch(e){console.error(e);r.status(e.message.includes("Aguarde 60")?429:500).json({error:e.message||"Erro ao entrar."})}});
app.get("/api/friends",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const f=await pool.query(`SELECT u.name,u.email,u.code FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=$1 ORDER BY u.name`,[u.id]);const reqs=await pool.query(`SELECT u.name,u.email,u.code FROM friend_requests fr JOIN users u ON u.id=fr.sender_id WHERE fr.receiver_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC`,[u.id]);r.json({friends:f.rows.map(pub),requests:reqs.rows.map(pub)})}catch(e){console.error(e);r.status(500).json({error:"Erro ao carregar amigos."})}});
app.post("/api/friends/request",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").trim().toUpperCase(),x=await getUserByCode(c);if(!x)return r.status(404).json({error:"Usuário não encontrado."});if(x.id===u.id)return r.status(400).json({error:"Você não pode adicionar a si mesmo."});const exists=await pool.query("SELECT 1 FROM friendships WHERE user_id=$1 AND friend_id=$2",[u.id,x.id]);if(exists.rowCount)return r.status(400).json({error:"Vocês já são amigos."});const reverse=await pool.query("SELECT 1 FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'",[x.id,u.id]);if(reverse.rowCount)return r.status(400).json({error:"Esse usuário já enviou uma solicitação para você."});await pool.query("INSERT INTO friend_requests(sender_id,receiver_id,status) VALUES($1,$2,'pending') ON CONFLICT(sender_id,receiver_id) DO UPDATE SET status='pending'",[u.id,x.id]);r.json({message:"Solicitação enviada."})}catch(e){console.error(e);r.status(500).json({error:"Erro ao enviar solicitação."})}});
app.post("/api/friends/accept",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").toUpperCase(),x=await getUserByCode(c);if(!x)return r.status(404).json({error:"Solicitação não encontrada."});const a=await pool.query("SELECT id FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'",[x.id,u.id]);if(!a.rowCount)return r.status(404).json({error:"Solicitação não encontrada."});const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE friend_requests SET status='accepted' WHERE id=$1",[a.rows[0].id]);await client.query("INSERT INTO friendships(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,x.id]);await client.query("INSERT INTO friendships(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[x.id,u.id]);await client.query("COMMIT")}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}r.json({ok:true})}catch(e){console.error(e);r.status(500).json({error:"Erro ao aceitar solicitação."})}});
app.post("/api/friends/remove",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").toUpperCase(),x=await getUserByCode(c);if(x){await pool.query("DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)",[u.id,x.id])}r.json({ok:true})}catch(e){console.error(e);r.status(500).json({error:"Erro ao remover amigo."})}});
function userList(room){const x=rooms.get(room);return x?[...x.values()].map(v=>({id:v.id,name:v.name,code:v.code,host:v.id===calls.get(room)})):[]}
const broadcast=room=>io.to(room).emit("room-users",userList(room)),valid=(s,id)=>!!rooms.get(s.data.room)?.has(id),ready=room=>(callReady.has(room)||callReady.set(room,new Set()),callReady.get(room));
function cleanReady(room,id){const s=callReady.get(room);if(!s)return;s.delete(id);if(!s.size)callReady.delete(room)}
io.use(async(s,n)=>{try{const sess=sessions.get(s.handshake.auth?.token);if(!sess||sess.expires<Date.now()){if(sess)sessions.delete(s.handshake.auth?.token);return n(new Error("Sessão expirada"));}
const u=await getUserByEmail(sess.email);if(!u)return n(new Error("Sessão inválida"));s.data.user=u;n()}catch(e){n(new Error("Falha na autenticação"))}});
io.on("connection",s=>{
 s.on("client-ping",t=>s.emit("client-pong",t));
 s.on("join",({room})=>{const u=s.data.user;if(!u)return;s.data.room=String(room||"geral").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32)||"geral";s.data.name=u.name;s.data.code=u.code;const rm=s.data.room;if(!rooms.has(rm))rooms.set(rm,new Map());rooms.get(rm).set(s.id,{id:s.id,name:u.name,code:u.code});s.join(rm);s.emit("room-users",userList(rm));s.to(rm).emit("user-joined",{id:s.id,name:u.name,code:u.code});if(calls.has(rm)){const h=calls.get(rm);s.emit("call-host",h);s.emit("call-state",{active:true,host:h,ready:[...ready(rm)]})}else s.emit("call-state",{active:false,host:null,ready:[]})});
 s.on("chat",({room,text})=>{if(room!==s.data.room)return;const t=String(text||"").trim().slice(0,1000);if(t)io.to(room).emit("chat",{name:s.data.name,text:t,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})})});
 s.on("call-start",({room})=>{if(room!==s.data.room)return;if(!calls.has(room)){calls.set(room,s.id);ready(room).add(s.id);io.to(room).emit("call-host",s.id);io.to(room).emit("system",s.data.name+" criou uma call.");broadcast(room)}s.emit("call-host",calls.get(room));s.emit("call-state",{active:true,host:calls.get(room),ready:[...ready(room)]})});
 s.on("call-ready",({room})=>{if(room!==s.data.room||!calls.has(room))return;ready(room).add(s.id);const h=calls.get(room);s.emit("call-host",h);s.emit("call-ready-users",[...ready(room)].filter(id=>id!==s.id&&valid(s,id)));if(h!==s.id)io.to(h).emit("call-participant-ready",{id:s.id,name:s.data.name})});
 s.on("call-ready-request",({room})=>{if(room===s.data.room&&calls.get(room)===s.id)s.emit("call-ready-users",[...ready(room)].filter(id=>id!==s.id&&valid(s,id)))});
 s.on("call-leave",({room})=>{if(room===s.data.room){cleanReady(room,s.id);s.to(room).emit("call-participant-left",{id:s.id})}});
 s.on("host-mute",({to,name,room,muted})=>{if(room!==s.data.room||calls.get(room)!==s.id||!valid(s,to))return;io.to(to).emit("participant-muted",{id:to,name,muted});s.to(room).emit("system",s.data.name+(muted?" silenciou ":" liberou o microfone de ")+name+".")});
 s.on("host-kick",({to,name,room})=>{if(room!==s.data.room||calls.get(room)!==s.id||!valid(s,to))return;cleanReady(room,to);io.to(to).emit("call-removed");io.to(room).emit("call-participant-left",{id:to});io.to(room).emit("system",s.data.name+" removeu "+name+" da call.")});
 s.on("call-end",({room})=>{if(room!==s.data.room||calls.get(room)!==s.id)return;calls.delete(room);callReady.delete(room);io.to(room).emit("call-ended");io.to(room).emit("call-state",{active:false,host:null,ready:[]});io.to(room).emit("system",s.data.name+" encerrou a call.");broadcast(room)});
 s.on("signal",({to,data})=>{if(!to||!valid(s,to))return;const set=callReady.get(s.data.room);if(set?.has(s.id)&&set.has(to))io.to(to).emit("signal",{from:s.id,data})});
 s.on("disconnect",()=>{const room=s.data.room;if(!room)return;const rm=rooms.get(room);if(!rm)return;const was=calls.get(room)===s.id;cleanReady(room,s.id);rm.delete(s.id);if(was){const next=[...rm.values()][0];if(next){calls.set(room,next.id);io.to(room).emit("call-host",next.id);io.to(room).emit("call-state",{active:true,host:next.id,ready:[...ready(room)]})}else{calls.delete(room);callReady.delete(room);io.to(room).emit("call-ended")}}s.to(room).emit("user-left",{id:s.id,name:s.data.name});s.to(room).emit("call-participant-left",{id:s.id});broadcast(room);if(!rm.size){rooms.delete(room);calls.delete(room);callReady.delete(room)}})
});
setInterval(()=>{const now=Date.now();for(const [t,v] of sessions)if(v.expires<now)sessions.delete(t);for(const [k,v] of rateLimits)if(!v.length||now-v[v.length-1]>10*60*1000)rateLimits.delete(k)},30*60*1000);
initDb().then(()=>server.listen(process.env.PORT||3000,()=>console.log("Conversa Live v1.8.1 server ativo com PostgreSQL + 2FA por e-mail"))).catch(e=>{console.error("Falha ao iniciar banco:",e);process.exit(1)});
