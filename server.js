const express=require("express"),http=require("http"),cors=require("cors"),crypto=require("crypto"),{Server}=require("socket.io"),{Pool}=require("pg");
const app=express();
app.set("trust proxy",1);
const configuredOrigins=String(process.env.FRONTEND_URL||"").split(",").map(v=>v.trim()).filter(Boolean);
function allowOrigin(origin){
  if(!origin)return true;
  if(configuredOrigins.length===0||configuredOrigins.includes("*")||configuredOrigins.includes(origin))return true;
  if(origin==="https://freechat-ten.vercel.app")return true;
  if(/^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(origin))return true;
  return false;
}
const corsOptions={origin:(origin,cb)=>cb(null,allowOrigin(origin)),methods:["GET","POST","OPTIONS"],credentials:false};
app.use(cors(corsOptions));
app.use((req,res,next)=>{res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","DENY");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");res.setHeader("Permissions-Policy","camera=(self), microphone=(self), display-capture=(self)");next()});
app.use(express.json({limit:"32kb"}));
const server=http.createServer(app),io=new Server(server,{cors:{origin:(origin,cb)=>cb(null,allowOrigin(origin)),methods:["GET","POST"]}});
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});
const sessions=new Map(),rooms=new Map(),calls=new Map(),callReady=new Map(),rateLimits=new Map(),roomMusic=new Map(),musicTokens=new Map();
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
 await pool.query(`CREATE TABLE IF NOT EXISTS direct_messages(
   id BIGSERIAL PRIMARY KEY,
   sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   read_at TIMESTAMPTZ
 )`);
 await pool.query("CREATE INDEX IF NOT EXISTS direct_messages_pair_idx ON direct_messages(sender_id,receiver_id,created_at DESC)");
 await pool.query(`CREATE TABLE IF NOT EXISTS app_sessions(
   token TEXT PRIMARY KEY,
   user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   email VARCHAR(120) NOT NULL,
   expires_at TIMESTAMPTZ NOT NULL
 )`);
 await pool.query("CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions(expires_at)");
}

function cleanName(value){
  return String(value ?? "").replace(/\s+/g," ").trim().slice(0,24);
}
function cleanEmail(value){
  return String(value ?? "").trim().toLowerCase().slice(0,120);
}
function code(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out="CL-";
  for(let i=0;i<6;i++)out+=chars[crypto.randomInt(chars.length)];
  return out;
}
function hash(password,salt){
  return crypto.createHash("sha256").update(String(salt)+String(password)).digest("hex");
}
async function getUserByEmail(email){
  const x=await pool.query(
    "SELECT id,name,email,code,salt,password_hash,created_at FROM users WHERE email=$1 LIMIT 1",
    [cleanEmail(email)]
  );
  return x.rows[0]||null;
}
async function getUserByCode(value){
  const x=await pool.query(
    "SELECT id,name,email,code,salt,password_hash,created_at FROM users WHERE code=$1 LIMIT 1",
    [String(value??"").trim().toUpperCase()]
  );
  return x.rows[0]||null;
}
function pub(u){
  return {id:u.id,name:u.name,email:u.email,code:u.code};
}
async function token(u){
  const t=crypto.randomBytes(32).toString("hex");
  const expires=Date.now()+SESSION_TTL_MS;
  sessions.set(t,{userId:u.id,email:u.email,expires});
  await pool.query("INSERT INTO app_sessions(token,user_id,email,expires_at) VALUES($1,$2,$3,to_timestamp($4/1000.0))",[t,u.id,u.email,expires]);
  return t;
}
async function getSession(t){
  if(!t)return null;
  const mem=sessions.get(t);
  if(mem&&mem.expires>Date.now())return mem;
  if(mem)sessions.delete(t);
  const x=await pool.query("SELECT user_id,email,EXTRACT(EPOCH FROM expires_at)*1000 AS expires_ms FROM app_sessions WHERE token=$1 LIMIT 1",[t]);
  const row=x.rows[0];
  if(!row)return null;
  const expires=Number(row.expires_ms);
  if(!Number.isFinite(expires)||expires<Date.now()){
    await pool.query("DELETE FROM app_sessions WHERE token=$1",[t]);
    return null;
  }
  const sess={userId:row.user_id,email:row.email,expires};
  sessions.set(t,sess);
  return sess;
}
async function auth(req,res){
  const raw=String(req.headers.authorization||"");
  const t=raw.startsWith("Bearer ")?raw.slice(7).trim():"";
  const sess=await getSession(t);
  if(!sess){
    res.status(401).json({error:"Sessão inválida ou expirada. Entre novamente."});
    return null;
  }
  const u=await getUserByEmail(sess.email);
  if(!u){
    sessions.delete(t);
    await pool.query("DELETE FROM app_sessions WHERE token=$1",[t]);
    res.status(401).json({error:"Sessão inválida."});
    return null;
  }
  sess.expires=Date.now()+SESSION_TTL_MS;
  await pool.query("UPDATE app_sessions SET expires_at=to_timestamp($2/1000.0),email=$3 WHERE token=$1",[t,sess.expires,u.email]);
  return u;
}

app.get("/",(_,r)=>r.send("Conversa Live server OK — v2.0.4 PostgreSQL + música"));
app.get("/health",async(_,r)=>{try{await pool.query("SELECT 1");r.json({ok:true,database:true,version:"2.0.4"})}catch(e){r.status(503).json({ok:false,database:false,version:"2.0.4"})}});

// Music bot: searches the Audius catalog and streams public/authorized tracks.
// Credentials stay on the server. Configure AUDIUS_API_KEY and/or
// AUDIUS_BEARER_TOKEN in Render when required by the Audius API plan.
app.get("/api/music/search",async(q,r)=>{
  try{
    const me=await auth(q,r);if(!me)return;
    const term=String(q.query?.q||"").trim().slice(0,120);
    if(term.length<2)return r.status(400).json({error:"Digite o nome de uma música."});
    if(!rateLimit(requestIp(q)+":music-search",12,60*1000))return r.status(429).json({error:"Muitas buscas de música. Aguarde um pouco."});
    const u=new URL("https://api.audius.co/v1/tracks/search");
    u.searchParams.set("query",term);u.searchParams.set("limit","8");u.searchParams.set("sort_method","relevant");
    if(process.env.AUDIUS_API_KEY)u.searchParams.set("api_key",process.env.AUDIUS_API_KEY);
    const headers={Accept:"application/json"};
    if(process.env.AUDIUS_BEARER_TOKEN)headers.Authorization="Bearer "+process.env.AUDIUS_BEARER_TOKEN;
    if(process.env.AUDIUS_API_KEY)headers["x-api-key"]=process.env.AUDIUS_API_KEY;
    const x=await fetch(u,{headers});
    const body=await x.json().catch(()=>({}));
    if(!x.ok)return r.status(x.status===401||x.status===403?503:502).json({error:"O serviço de música recusou a busca. Configure AUDIUS_API_KEY no Render."});
    const rows=Array.isArray(body.data)?body.data:[];
    r.json({tracks:rows.filter(t=>t&&t.id&&t.isStreamable!==false).slice(0,8).map(t=>({
      id:String(t.id),title:String(t.title||"Sem título").slice(0,120),artist:String(t.user?.name||"Artista desconhecido").slice(0,80),
      duration:Number(t.duration||0),artwork:t.artwork?String(t.artwork._150x150||t.artwork._480x480||""):"",permalink:t.permalink?String(t.permalink):""
    }))});
  }catch(e){console.error("music-search",e);r.status(500).json({error:"Não foi possível buscar músicas agora."})}
});

app.get("/api/music/token",async(q,r)=>{
  try{
    const me=await auth(q,r);if(!me)return;
    const mt=crypto.randomBytes(24).toString("hex");
    const expires=Date.now()+15*60*1000;
    musicTokens.set(mt,{userId:me.id,expires});
    r.json({token:mt,expires});
  }catch(e){console.error("music-token",e);r.status(500).json({error:"Não foi possível preparar o áudio."})}
});

app.get("/api/music/stream/:id",async(q,r)=>{
  try{
    const mt=String(q.query?.mt||"").trim();
    const media=musicTokens.get(mt);
    if(!media||media.expires<Date.now()){if(mt)musicTokens.delete(mt);return r.status(401).json({error:"Token de áudio inválido ou expirado."});}
    const id=String(q.params.id||"").replace(/[^A-Za-z0-9_-]/g,"").slice(0,80);
    if(!id)return r.status(400).json({error:"Faixa inválida."});
    const u=new URL(`https://api.audius.co/v1/tracks/${encodeURIComponent(id)}/stream`);
    if(process.env.AUDIUS_API_KEY)u.searchParams.set("api_key",process.env.AUDIUS_API_KEY);
    const headers={Accept:"audio/*,*/*;q=0.8"};
    if(process.env.AUDIUS_BEARER_TOKEN)headers.Authorization="Bearer "+process.env.AUDIUS_BEARER_TOKEN;
    if(process.env.AUDIUS_API_KEY)headers["x-api-key"]=process.env.AUDIUS_API_KEY;
    if(q.headers.range)headers.Range=q.headers.range;
    const x=await fetch(u,{headers,redirect:"follow"});
    if(!x.ok)return r.status(x.status===401||x.status===403?503:502).json({error:"Não foi possível abrir o áudio desta faixa."});
    const ct=x.headers.get("content-type")||"audio/mpeg";
    r.status(x.status);
    r.setHeader("Content-Type",ct);r.setHeader("Cache-Control","no-store");r.setHeader("Accept-Ranges","bytes");
    for(const h of ["content-length","content-range","etag","last-modified"]){const v=x.headers.get(h);if(v)r.setHeader(h,v);}
    if(x.body){const {Readable}=require("stream");return Readable.fromWeb(x.body).pipe(r);}
    r.status(502).json({error:"Stream de áudio indisponível."});
  }catch(e){console.error("music-stream",e);r.status(500).json({error:"Não foi possível transmitir a música."})}
});

app.post("/api/register",guard,async(q,r)=>{
  try{
    const name=cleanName(q.body?.name),email=cleanEmail(q.body?.email),password=String(q.body?.password||"");
    if(name.length<2)return r.status(400).json({error:"O nome precisa ter pelo menos 2 caracteres."});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return r.status(400).json({error:"E-mail inválido."});
    if(password.length<6)return r.status(400).json({error:"A senha precisa ter pelo menos 6 caracteres."});
    if(await getUserByEmail(email))return r.status(409).json({error:"Este e-mail já possui uma conta."});
    let c;do c=code();while(await getUserByCode(c));
    const salt=crypto.randomBytes(16).toString("hex"),h=hash(password,salt);
    const x=await pool.query("INSERT INTO users(name,email,code,salt,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,code",[name,email,c,salt,h]);
    const u=x.rows[0];
    r.json({user:pub(u),token:await token(u),message:"Conta criada com sucesso."});
  }catch(e){
    console.error(e);
    r.status(500).json({error:e.message||"Não foi possível criar a conta."});
  }
});
app.post("/api/login",guard,async(q,r)=>{
  try{
    const email=cleanEmail(q.body?.email),p=String(q.body?.password||""),u=await getUserByEmail(email);
    if(!u)return r.status(401).json({error:"E-mail ou senha incorretos."});
    const h=hash(p,u.salt);
    const expected=Buffer.from(h,"hex");
    const stored=Buffer.from(String(u.password_hash||""),"hex");
    // timingSafeEqual throws when buffers have different lengths.
    // Treat malformed/legacy hashes as a normal invalid-password result.
    if(expected.length!==stored.length || !crypto.timingSafeEqual(expected,stored))
      return r.status(401).json({error:"E-mail ou senha incorretos."});
    r.json({user:pub(u),token:await token(u),message:"Login realizado com sucesso."});
  }catch(e){
    console.error(e);
    r.status(500).json({error:"Erro ao entrar."});
  }
});


app.get("/api/messages/unread",async(q,r)=>{
 try{
  const me=await auth(q,r);if(!me)return;
  const x=await pool.query(`SELECT u.code,COUNT(*)::int AS count FROM direct_messages m JOIN users u ON u.id=m.sender_id WHERE m.receiver_id=$1 AND m.read_at IS NULL GROUP BY u.code`,[me.id]);
  const unread={};x.rows.forEach(row=>unread[row.code]=Number(row.count||0));r.json({unread});
 }catch(e){console.error(e);r.status(500).json({error:"Não foi possível carregar notificações."})}
});
app.get("/api/messages/:code",async(q,r)=>{
 try{
  const me=await auth(q,r);if(!me)return;
  const other=await getUserByCode(String(q.params.code||"").trim().toUpperCase());
  if(!other)return r.status(404).json({error:"Usuário não encontrado."});
  if(Number(other.id)===Number(me.id))return r.status(400).json({error:"Você não pode conversar consigo mesmo."});
  const f=await pool.query("SELECT 1 FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1) LIMIT 1",[me.id,other.id]);
  if(!f.rowCount)return r.status(403).json({error:"Vocês precisam ser amigos para conversar."});
  const x=await pool.query(`SELECT id,sender_id,receiver_id,body,created_at,read_at FROM direct_messages
    WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)
    ORDER BY created_at ASC LIMIT 200`,[me.id,other.id]);
  await pool.query("UPDATE direct_messages SET read_at=NOW() WHERE receiver_id=$1 AND sender_id=$2 AND read_at IS NULL",[me.id,other.id]);
  r.json({friend:pub(other),messages:x.rows});
 }catch(e){console.error(e);r.status(500).json({error:"Não foi possível carregar as mensagens."})}
});
app.post("/api/messages",async(q,r)=>{
 try{
  const me=await auth(q,r);if(!me)return;
  const code=String(q.body?.code||"").trim().toUpperCase(),body=String(q.body?.body||"").trim();
  if(!body)return r.status(400).json({error:"Mensagem vazia."});
  if(body.length>4000)return r.status(400).json({error:"Mensagem muito longa."});
  const other=await getUserByCode(code);if(!other)return r.status(404).json({error:"Usuário não encontrado."});
  const f=await pool.query("SELECT 1 FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1) LIMIT 1",[me.id,other.id]);
  if(!f.rowCount)return r.status(403).json({error:"Vocês precisam ser amigos para conversar."});
  const x=await pool.query("INSERT INTO direct_messages(sender_id,receiver_id,body) VALUES($1,$2,$3) RETURNING id,sender_id,receiver_id,body,created_at,read_at",[me.id,other.id,body]);
  for(const [sid,ss] of io.sockets.sockets){
    if(Number(ss.data?.user?.id)===Number(other.id))io.to(sid).emit("dm-new",{code:me.code,message:x.rows[0]});
  }
  r.json({message:x.rows[0]});
 }catch(e){console.error(e);r.status(500).json({error:"Não foi possível enviar a mensagem."})}
});
app.get("/api/friends",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const f=await pool.query(`SELECT u.name,u.email,u.code FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=$1 ORDER BY u.name`,[u.id]);const reqs=await pool.query(`SELECT u.name,u.email,u.code FROM friend_requests fr JOIN users u ON u.id=fr.sender_id WHERE fr.receiver_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC`,[u.id]);r.json({friends:f.rows.map(pub),requests:reqs.rows.map(pub)})}catch(e){console.error(e);r.status(500).json({error:"Erro ao carregar amigos."})}});
app.post("/api/friends/request",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").trim().toUpperCase(),x=await getUserByCode(c);if(!x)return r.status(404).json({error:"Usuário não encontrado."});if(x.id===u.id)return r.status(400).json({error:"Você não pode adicionar a si mesmo."});const exists=await pool.query("SELECT 1 FROM friendships WHERE user_id=$1 AND friend_id=$2",[u.id,x.id]);if(exists.rowCount)return r.status(400).json({error:"Vocês já são amigos."});const reverse=await pool.query("SELECT 1 FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'",[x.id,u.id]);if(reverse.rowCount)return r.status(400).json({error:"Esse usuário já enviou uma solicitação para você."});await pool.query("INSERT INTO friend_requests(sender_id,receiver_id,status) VALUES($1,$2,'pending') ON CONFLICT(sender_id,receiver_id) DO UPDATE SET status='pending'",[u.id,x.id]);r.json({message:"Solicitação enviada."})}catch(e){console.error(e);r.status(500).json({error:"Erro ao enviar solicitação."})}});
app.post("/api/friends/accept",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").toUpperCase(),x=await getUserByCode(c);if(!x)return r.status(404).json({error:"Solicitação não encontrada."});const a=await pool.query("SELECT id FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'",[x.id,u.id]);if(!a.rowCount)return r.status(404).json({error:"Solicitação não encontrada."});const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE friend_requests SET status='accepted' WHERE id=$1",[a.rows[0].id]);await client.query("INSERT INTO friendships(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,x.id]);await client.query("INSERT INTO friendships(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[x.id,u.id]);await client.query("COMMIT")}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}r.json({ok:true})}catch(e){console.error(e);r.status(500).json({error:"Erro ao aceitar solicitação."})}});
app.post("/api/friends/remove",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").toUpperCase(),x=await getUserByCode(c);if(x){await pool.query("DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)",[u.id,x.id])}r.json({ok:true})}catch(e){console.error(e);r.status(500).json({error:"Erro ao remover amigo."})}});
function userList(room){const x=rooms.get(room);return x?[...x.values()].map(v=>({id:v.id,name:v.name,code:v.code,host:v.id===calls.get(room)})):[]}
const broadcast=room=>io.to(room).emit("room-users",userList(room)),valid=(s,id)=>!!rooms.get(s.data.room)?.has(id),ready=room=>(callReady.has(room)||callReady.set(room,new Set()),callReady.get(room));
function cleanReady(room,id){const s=callReady.get(room);if(!s)return;s.delete(id);if(!s.size)callReady.delete(room)}
io.use(async(s,n)=>{try{
 const t=String(s.handshake.auth?.token||"").trim();
 const sess=await getSession(t);
 if(!sess)return n(new Error("Sessão expirada"));
 const u=await getUserByEmail(sess.email);
 if(!u)return n(new Error("Sessão inválida"));
 sess.expires=Date.now()+SESSION_TTL_MS;
 await pool.query("UPDATE app_sessions SET expires_at=to_timestamp($2/1000.0) WHERE token=$1",[t,sess.expires]);
 s.data.user=u;n();
}catch(e){console.error("socket-auth",e);n(new Error("Falha na autenticação"))}});
io.on("connection",s=>{
 s.on("client-ping",t=>s.emit("client-pong",t));
 s.on("join",({room})=>{const u=s.data.user;if(!u)return;s.data.room=String(room||"geral").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32)||"geral";s.data.name=u.name;s.data.code=u.code;const rm=s.data.room;if(!rooms.has(rm))rooms.set(rm,new Map());rooms.get(rm).set(s.id,{id:s.id,name:u.name,code:u.code});s.join(rm);s.emit("room-users",userList(rm));s.to(rm).emit("user-joined",{id:s.id,name:u.name,code:u.code});if(calls.has(rm)){const h=calls.get(rm);s.emit("call-host",h);s.emit("call-state",{active:true,host:h,ready:[...ready(rm)]})}else s.emit("call-state",{active:false,host:null,ready:[]});if(roomMusic.has(rm))s.emit("music-state",musicStateFor(rm));});
 s.on("chat",({room,text})=>{if(room!==s.data.room)return;const t=String(text||"").trim().slice(0,1000);if(t)io.to(room).emit("chat",{name:s.data.name,text:t,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})})});
 s.on("call-start",({room},ack)=>{if(room!==s.data.room){if(typeof ack==="function")ack({ok:false,error:"Sala inválida"});return;}if(!calls.has(room)){calls.set(room,s.id);ready(room).add(s.id);io.to(room).emit("call-host",s.id);io.to(room).emit("system",s.data.name+" criou uma call.");broadcast(room)}const host=calls.get(room);s.emit("call-host",host);s.emit("call-state",{active:true,host,ready:[...ready(room)]});if(typeof ack==="function")ack({ok:true,host,ready:[...ready(room)]});});
 s.on("call-ready",({room})=>{if(room!==s.data.room||!calls.has(room))return;ready(room).add(s.id);const h=calls.get(room);s.emit("call-host",h);s.emit("call-ready-users",[...ready(room)].filter(id=>id!==s.id&&valid(s,id)));if(h!==s.id)io.to(h).emit("call-participant-ready",{id:s.id,name:s.data.name})});
 s.on("call-ready-request",({room})=>{if(room===s.data.room&&calls.get(room)===s.id)s.emit("call-ready-users",[...ready(room)].filter(id=>id!==s.id&&valid(s,id)))});
 s.on("call-leave",({room})=>{if(room===s.data.room){cleanReady(room,s.id);s.to(room).emit("call-participant-left",{id:s.id})}});
 s.on("host-mute",({to,name,room,muted})=>{if(room!==s.data.room||calls.get(room)!==s.id||!valid(s,to))return;io.to(to).emit("participant-muted",{id:to,name,muted});s.to(room).emit("system",s.data.name+(muted?" silenciou ":" liberou o microfone de ")+name+".")});
 s.on("host-kick",({to,name,room})=>{if(room!==s.data.room||calls.get(room)!==s.id||!valid(s,to))return;cleanReady(room,to);io.to(to).emit("call-removed");io.to(room).emit("call-participant-left",{id:to});io.to(room).emit("system",s.data.name+" removeu "+name+" da call.")});
 s.on("call-end",({room})=>{if(room!==s.data.room||calls.get(room)!==s.id)return;calls.delete(room);callReady.delete(room);roomMusic.delete(room);io.to(room).emit("call-ended");io.to(room).emit("call-state",{active:false,host:null,ready:[]});io.to(room).emit("music-stop");io.to(room).emit("system",s.data.name+" encerrou a call.");broadcast(room)});
 function musicStateFor(room){const st=roomMusic.get(room);if(!st)return null;const position=st.paused?Number(st.position||0):Math.max(0,Number(st.position||0)+(Date.now()-Number(st.startedAt||Date.now()))/1000);return {...st,position};}
 function cleanMusicTrack(t){const x={id:String(t?.id||"").replace(/[^A-Za-z0-9_-]/g,"").slice(0,80),title:String(t?.title||"Sem título").slice(0,120),artist:String(t?.artist||"Artista desconhecido").slice(0,80),duration:Number(t?.duration||0)};return x.id?x:null;}
 function musicParticipant(s,room){return room===s.data.room&&calls.has(room)&&ready(room).has(s.id);}
 function musicController(s,room){return room===s.data.room&&calls.get(room)===s.id&&ready(room).has(s.id);}
 s.on("music-play",({room,track})=>{if(!musicParticipant(s,room)){s.emit("music-command-error","Entre em uma call ativa para usar o bot de música.");return;}const clean=cleanMusicTrack(track);if(!clean)return;let st=roomMusic.get(room);if(st){if(st.queue.length>=50){s.emit("music-command-error","A fila está cheia (máximo 50).");return;}st.queue.push(clean);io.to(room).emit("music-state",musicStateFor(room));io.to(room).emit("system",s.data.name+" adicionou 🎵 "+clean.title+" à fila.");return;}st={track:clean,queue:[],hostId:s.id,startedAt:Date.now(),position:0,paused:false,volume:.7};roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));io.to(room).emit("system",s.data.name+" colocou 🎵 "+clean.title+" para tocar.");});
 s.on("music-next",({room})=>{if(!musicController(s,room))return;const st=roomMusic.get(room);if(!st)return;const n=st.queue.shift();if(n){st.track=n;st.startedAt=Date.now();st.position=0;st.paused=false;roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));}else{roomMusic.delete(room);io.to(room).emit("music-stop");io.to(room).emit("system","🎵 A fila terminou.");}});
 s.on("music-pause",({room})=>{if(!musicController(s,room))return;const st=roomMusic.get(room);if(!st||st.paused)return;st.position=musicStateFor(room).position;st.paused=true;roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));});
 s.on("music-resume",({room})=>{if(!musicController(s,room))return;const st=roomMusic.get(room);if(!st?.paused)return;st.startedAt=Date.now();st.paused=false;roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));});
 s.on("music-volume",({room,volume})=>{if(!musicController(s,room))return;const st=roomMusic.get(room);if(!st)return;st.volume=Math.max(0,Math.min(1,Number(volume)||0));roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));});
 s.on("music-queue",({room})=>{if(room!==s.data.room)return;const q=roomMusic.get(room)?.queue||[];s.emit("system",q.length?"🎵 Fila ("+q.length+"):\n"+q.slice(0,15).map((x,i)=>(i+1)+". "+x.title+" — "+x.artist).join("\n"):"🎵 A fila está vazia.");});
 s.on("music-stop",({room})=>{if(!musicController(s,room))return;roomMusic.delete(room);io.to(room).emit("music-stop");io.to(room).emit("system",s.data.name+" parou a música e limpou a fila.");});
 s.on("signal",({to,data})=>{if(!to||!valid(s,to))return;const set=callReady.get(s.data.room);if(set?.has(s.id)&&set.has(to))io.to(to).emit("signal",{from:s.id,data})});
 s.on("disconnect",()=>{const room=s.data.room;if(!room)return;const rm=rooms.get(room);if(!rm)return;const was=calls.get(room)===s.id;const musicWas=roomMusic.get(room)?.hostId===s.id;cleanReady(room,s.id);rm.delete(s.id);if(musicWas){roomMusic.delete(room);io.to(room).emit("music-stop")}if(was){const next=[...rm.values()][0];if(next){calls.set(room,next.id);io.to(room).emit("call-host",next.id);io.to(room).emit("call-state",{active:true,host:next.id,ready:[...ready(room)]})}else{calls.delete(room);callReady.delete(room);io.to(room).emit("call-ended")}}s.to(room).emit("user-left",{id:s.id,name:s.data.name});s.to(room).emit("call-participant-left",{id:s.id});broadcast(room);if(!rm.size){rooms.delete(room);calls.delete(room);callReady.delete(room)}})
});
setInterval(async()=>{const now=Date.now();for(const [t,v] of sessions)if(v.expires<now)sessions.delete(t);for(const [k,v] of rateLimits)if(!v.length||now-v[v.length-1]>10*60*1000)rateLimits.delete(k);for(const [k,v] of musicTokens)if(v.expires<now)musicTokens.delete(k);try{await pool.query("DELETE FROM app_sessions WHERE expires_at<NOW()")}catch(e){}},30*60*1000);
initDb().then(()=>server.listen(process.env.PORT||3000,()=>console.log("Conversa Live v2.0.8 server ativo com PostgreSQL + mensagens diretas + music bot + fila"))).catch(e=>{console.error("Falha ao iniciar banco:",e);process.exit(1)});
