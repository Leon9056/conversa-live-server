const express=require("express"),http=require("http"),cors=require("cors"),crypto=require("crypto"),multer=require("multer"),{Server}=require("socket.io"),{Pool}=require("pg");
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
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024},fileFilter:(req,file,cb)=>{const ok=/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|ogg))$/i.test(file.mimetype);cb(ok?null:new Error("Formato não suportado. Use JPG, PNG, WEBP ou vídeo MP4/WebM."),ok)}});
const sessions=new Map(),rooms=new Map(),calls=new Map(),callReady=new Map(),rateLimits=new Map(),roomMusic=new Map(),musicTokens=new Map();
const onlineByCode=new Map(); // code -> Set(socketId), presence independent of any room
function notifyUser(code,event,payload){
  const set=onlineByCode.get(code);
  if(!set||!set.size)return false;
  for(const sid of set)io.to(sid).emit(event,payload);
  return true;
}
async function addNotification(userId,type,title,body,data={}){
 try{const x=await pool.query("INSERT INTO notifications(user_id,type,title,body,data) VALUES($1,$2,$3,$4,$5) RETURNING id,type,title,body,data,created_at",[userId,type,title,String(body||"").slice(0,500),JSON.stringify(data||{})]);notifyUser((await getUserById(userId))?.code,"notification-new",x.rows[0]);return x.rows[0]}catch(e){console.error("notification",e);return null}
}
async function getUserById(id){const x=await pool.query("SELECT id,name,email,code FROM users WHERE id=$1 LIMIT 1",[id]);return x.rows[0]||null}
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
 await pool.query(`CREATE TABLE IF NOT EXISTS social_posts(
   id BIGSERIAL PRIMARY KEY, author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   body VARCHAR(1000), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   media_type VARCHAR(16), media_name VARCHAR(180), media_mime VARCHAR(120),
   media_size INTEGER, media_duration REAL, media_data BYTEA
 )`);
 await pool.query("ALTER TABLE social_posts ALTER COLUMN body DROP NOT NULL");
 await pool.query("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_type VARCHAR(16)");
 await pool.query("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_name VARCHAR(180)");
 await pool.query("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_mime VARCHAR(120)");
 await pool.query("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_size INTEGER");
 await pool.query("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_duration REAL");
 await pool.query("ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS media_data BYTEA");
 await pool.query(`CREATE TABLE IF NOT EXISTS social_likes(
   post_id BIGINT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(post_id,user_id)
 )`);
 await pool.query(`CREATE TABLE IF NOT EXISTS notifications(
   id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   type VARCHAR(32) NOT NULL, title VARCHAR(120) NOT NULL, body VARCHAR(500), data JSONB, read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await pool.query("CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,created_at DESC)");
 await pool.query(`CREATE TABLE IF NOT EXISTS direct_messages(
   id BIGSERIAL PRIMARY KEY,
   sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
   body TEXT,
   media_type VARCHAR(16),
   media_name VARCHAR(180),
   media_mime VARCHAR(120),
   media_size INTEGER,
   media_data BYTEA,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   read_at TIMESTAMPTZ
 )`);
 await pool.query("ALTER TABLE direct_messages ALTER COLUMN body DROP NOT NULL");
 await pool.query("ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_body_check");
 await pool.query("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_type VARCHAR(16)");
 await pool.query("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_name VARCHAR(180)");
 await pool.query("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_mime VARCHAR(120)");
 await pool.query("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_size INTEGER");
 await pool.query("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_duration REAL");
 await pool.query("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS media_data BYTEA");
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

app.get("/",(_,r)=>r.send("Conversa Live server OK — v3.0.0 PostgreSQL + música"));
app.get("/health",async(_,r)=>{try{await pool.query("SELECT 1");r.json({ok:true,database:true,version:"3.0.0"})}catch(e){r.status(503).json({ok:false,database:false,version:"3.0.0"})}});

// Music bot: searches the Audius catalog and streams public/authorized tracks.
// Credentials stay on the server. Configure AUDIUS_API_KEY and/or
// AUDIUS_BEARER_TOKEN in Render when required by the Audius API plan.
app.get("/api/me",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;r.json({user:pub(u)})}catch(e){r.status(500).json({error:"Erro ao carregar perfil."})}});
app.patch("/api/me",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const name=cleanName(q.body?.name);if(name.length<2)return r.status(400).json({error:"O nome precisa ter pelo menos 2 caracteres."});await pool.query("UPDATE users SET name=$1 WHERE id=$2",[name,u.id]);const updated=await getUserById(u.id);r.json({user:pub(updated)})}catch(e){console.error(e);r.status(500).json({error:"Não foi possível salvar o perfil."})}});
function feedPublic(row,viewerId){
 return {
  id:row.id,body:row.body||"",created_at:row.created_at,author_id:row.author_id,name:row.name,code:row.code,
  likes:Number(row.likes||0),liked:!!row.liked,
  media:row.media_id?{id:row.media_id,type:row.media_type,name:row.media_name,mime:row.media_mime,size:Number(row.media_size||0),duration:Number(row.media_duration||0),url:"/api/feed/media/"+row.media_id+"?mt="+encodeURIComponent(makeMediaToken(row.media_id,viewerId))}:null
 };
}
app.get("/api/feed",async(q,r)=>{try{
 const u=await auth(q,r);if(!u)return;
 const limit=Math.min(Math.max(Number(q.query.limit)||30,1),50);
 const x=await pool.query(`SELECT p.id,p.body,p.created_at,p.media_type,p.media_name,p.media_mime,p.media_size,p.media_duration,
   CASE WHEN p.media_data IS NOT NULL THEN p.id END AS media_id,
   u.id AS author_id,u.name,u.code,COUNT(l.post_id)::int AS likes,BOOL_OR(l.user_id=$1) AS liked
   FROM social_posts p JOIN users u ON u.id=p.author_id
   LEFT JOIN social_likes l ON l.post_id=p.id
   WHERE p.author_id=$1 OR p.author_id IN (SELECT friend_id FROM friendships WHERE user_id=$1)
   GROUP BY p.id,u.id ORDER BY p.created_at DESC LIMIT $2`,[u.id,limit]);
 r.json({posts:x.rows.map(p=>feedPublic(p,u.id))});
}catch(e){console.error(e);r.status(500).json({error:"Erro ao carregar o feed."})}});

app.post("/api/feed",async(q,r)=>{try{
 const u=await auth(q,r);if(!u)return;
 const body=String(q.body?.body||"").trim();
 if(body.length<1)return r.status(400).json({error:"Escreva algo antes de publicar."});
 if(body.length>1000)return r.status(400).json({error:"A publicação pode ter no máximo 1000 caracteres."});
 const x=await pool.query("INSERT INTO social_posts(author_id,body) VALUES($1,$2) RETURNING id,body,created_at",[u.id,body]);
 r.json({post:{...x.rows[0],author_id:u.id,name:u.name,code:u.code,likes:0,liked:false,media:null}});
}catch(e){console.error(e);r.status(500).json({error:"Não foi possível publicar."})}});

app.post("/api/feed/media",(req,res,next)=>{
 upload.single("file")(req,res,err=>{
   if(err)return res.status(err.code==="LIMIT_FILE_SIZE"?413:400).json({error:err.message||"Não foi possível receber a mídia."});
   next();
 });
},async(q,r)=>{try{
 const u=await auth(q,r);if(!u)return;
 const body=String(q.body?.body||"").trim();
 const duration=Number(q.body?.duration||0);
 if(body.length>1000)return r.status(400).json({error:"A publicação pode ter no máximo 1000 caracteres."});
 if(!q.file)return r.status(400).json({error:"Escolha uma foto ou vídeo."});
 if(q.file.size>20*1024*1024)return r.status(413).json({error:"A mídia precisa ter no máximo 20 MB."});
 const isVideo=q.file.mimetype.startsWith("video/");
 if(isVideo && (!Number.isFinite(duration)||duration<=0||duration>60.5))return r.status(400).json({error:"Os vídeos precisam ter até 1 minuto."});
 if(!body && !q.file)return r.status(400).json({error:"Adicione uma legenda ou mídia."});
 if(!rateLimit("feed-media:"+u.id,8,60*1000))return r.status(429).json({error:"Muitas publicações com mídia. Aguarde um pouco."});
 const kind=q.file.mimetype.startsWith("image/")?"image":"video";
 const x=await pool.query(`INSERT INTO social_posts(author_id,body,media_type,media_name,media_mime,media_size,media_duration,media_data)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,body,created_at`,[
   u.id,body||null,kind,String(q.file.originalname||"media").slice(0,180),q.file.mimetype,q.file.size,isVideo?duration:null,q.file.buffer
 ]);
 r.json({post:{...x.rows[0],author_id:u.id,name:u.name,code:u.code,likes:0,liked:false}});
}catch(e){console.error("feed-media-upload",e);r.status(500).json({error:"Não foi possível publicar a mídia."})}});

app.get("/api/feed/media/:id",async(q,r)=>{try{
 const id=Number(q.params.id);if(!Number.isSafeInteger(id)||id<1)return r.status(400).end();
 const x=await pool.query(`SELECT p.id,p.author_id,p.media_mime,p.media_name,p.media_size,p.media_data
   FROM social_posts p WHERE p.id=$1 AND p.media_data IS NOT NULL LIMIT 1`,[id]);
 const row=x.rows[0];if(!row)return r.status(404).end();
 const me=await auth(q,r);if(!me)return;
 const allowed=Number(row.author_id)===Number(me.id) || (await pool.query("SELECT 1 FROM friendships WHERE user_id=$1 AND friend_id=$2",[me.id,row.author_id])).rowCount;
 if(!allowed)return r.status(403).end();
 const mt=String(q.query?.mt||"");
 // feed media tokens are signed with the same media secret and viewer id
 const tokenOk=verifyMediaToken(mt,id,me.id);
 if(!tokenOk)return r.status(403).end();
 const buf=row.media_data,total=buf.length,mime=row.media_mime||"application/octet-stream";
 r.setHeader("Content-Type",mime);r.setHeader("Content-Disposition",`inline; filename*=UTF-8''${encodeURIComponent(row.media_name||"media")}`);
 r.setHeader("Accept-Ranges","bytes");r.setHeader("Cache-Control","private, max-age=3600");
 const range=String(q.headers.range||"");
 if(range){const m=range.match(/bytes=(\d*)-(\d*)/);if(m){let start=m[1]?Number(m[1]):Math.max(0,total-(Number(m[2]||0)+1));let end=m[2]?Number(m[2]):total-1;
   if(start<0||end<start||start>=total){r.status(416).setHeader("Content-Range",`bytes */${total}`).end();return}
   end=Math.min(end,total-1);r.status(206).setHeader("Content-Range",`bytes ${start}-${end}/${total}`);r.setHeader("Content-Length",end-start+1);return r.end(buf.subarray(start,end+1));}}
 r.setHeader("Content-Length",total);r.end(buf);
}catch(e){console.error("feed-media",e);r.status(500).end()}});

app.post("/api/feed/:id/like",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const id=Number(q.params.id);const exists=await pool.query("SELECT 1 FROM social_likes WHERE post_id=$1 AND user_id=$2",[id,u.id]);let liked;if(exists.rowCount){await pool.query("DELETE FROM social_likes WHERE post_id=$1 AND user_id=$2",[id,u.id]);liked=false}else{await pool.query("INSERT INTO social_likes(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,u.id]);liked=true}const c=await pool.query("SELECT COUNT(*)::int AS likes FROM social_likes WHERE post_id=$1",[id]);r.json({liked,likes:c.rows[0].likes})}catch(e){r.status(500).json({error:"Não foi possível reagir."})}});
app.get("/api/notifications",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const x=await pool.query("SELECT id,type,title,body,data,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[u.id]);const unread=x.rows.filter(n=>!n.read_at).length;r.json({notifications:x.rows,unread})}catch(e){r.status(500).json({error:"Erro ao carregar notificações."})}});
app.post("/api/notifications/read",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;await pool.query("UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL",[u.id]);r.json({ok:true})}catch(e){r.status(500).json({error:"Erro ao marcar notificações."})}});
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


async function getFriendForDM(me,code){
 const other=await getUserByCode(String(code||"").trim().toUpperCase());
 if(!other)return {error:"Usuário não encontrado.",status:404};
 if(Number(other.id)===Number(me.id))return {error:"Você não pode conversar consigo mesmo.",status:400};
 const f=await pool.query("SELECT 1 FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1) LIMIT 1",[me.id,other.id]);
 if(!f.rowCount)return {error:"Vocês precisam ser amigos para conversar.",status:403};
 return {other};
}
const mediaSecret=String(process.env.SESSION_SECRET||process.env.DATABASE_URL||crypto.randomBytes(32).toString("hex"));
function makeMediaToken(messageId,userId){const exp=Math.floor(Date.now()/1000)+60*30;const raw=`${messageId}.${userId}.${exp}`;const sig=crypto.createHmac("sha256",mediaSecret).update(raw).digest("base64url");return Buffer.from(`${raw}.${sig}`).toString("base64url");}
function verifyMediaToken(token,messageId,userId){try{const raw=Buffer.from(String(token||""),"base64url").toString();const parts=raw.split(".");if(parts.length!==4)return false;const [mid,uid,exp,sig]=parts;if(Number(mid)!==Number(messageId)||Number(uid)!==Number(userId)||Number(exp)<Math.floor(Date.now()/1000))return false;const expected=crypto.createHmac("sha256",mediaSecret).update(`${mid}.${uid}.${exp}`).digest("base64url");return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch(e){return false}}
function messagePublic(row,viewerId){return {id:row.id,sender_id:row.sender_id,receiver_id:row.receiver_id,body:row.body||"",created_at:row.created_at,read_at:row.read_at,media:row.media_id?{id:row.media_id,type:row.media_type,name:row.media_name,mime:row.media_mime,size:Number(row.media_size||0),duration:Number(row.media_duration||0),url:"/api/messages/media/"+row.media_id+"?mt="+encodeURIComponent(makeMediaToken(row.media_id,viewerId))}:null};}
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
  const {other,error,status}=await getFriendForDM(me,q.params.code);if(error)return r.status(status).json({error});
  const x=await pool.query(`SELECT id,sender_id,receiver_id,body,created_at,read_at,
    CASE WHEN media_data IS NOT NULL THEN id END AS media_id,media_type,media_name,media_mime,media_size
    FROM direct_messages WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)
    ORDER BY created_at ASC LIMIT 300`,[me.id,other.id]);
  await pool.query("UPDATE direct_messages SET read_at=NOW() WHERE receiver_id=$1 AND sender_id=$2 AND read_at IS NULL",[me.id,other.id]);
  r.json({friend:pub(other),messages:x.rows.map(row=>messagePublic(row,me.id))});
 }catch(e){console.error(e);r.status(500).json({error:"Não foi possível carregar as mensagens."})}
});
app.get("/api/messages/media/:id",async(q,r)=>{
 try{
  const id=Number(q.params.id);if(!Number.isSafeInteger(id)||id<1)return r.status(400).end();
  const x=await pool.query(`SELECT sender_id,receiver_id,media_mime,media_name,media_size,media_data FROM direct_messages WHERE id=$1 AND media_data IS NOT NULL LIMIT 1`,[id]);
  const row=x.rows[0];if(!row)return r.status(404).end();
  const mt=String(q.query?.mt||"");const viewerId=Number(row.sender_id);
  // Token is checked against either participant below. The viewer id is encoded in the signed token.
  const senderOk=verifyMediaToken(mt,id,Number(row.sender_id));const receiverOk=verifyMediaToken(mt,id,Number(row.receiver_id));
  if(!senderOk&&!receiverOk)return r.status(403).end();
  const buf=row.media_data;const total=buf.length;const mime=row.media_mime||"application/octet-stream";r.setHeader("Content-Type",mime);r.setHeader("Content-Disposition",`inline; filename*=UTF-8''${encodeURIComponent(row.media_name||"media")}`);r.setHeader("Accept-Ranges","bytes");r.setHeader("Cache-Control","private, max-age=3600");
  const range=String(q.headers.range||"");
  if(range){const m=range.match(/bytes=(\d*)-(\d*)/);if(m){let start=m[1]?Number(m[1]):Math.max(0,total-(Number(m[2]||0)+1));let end=m[2]?Number(m[2]):total-1;if(start<0||end<start||start>=total){r.status(416).setHeader("Content-Range",`bytes */${total}`).end();return}end=Math.min(end,total-1);r.status(206).setHeader("Content-Range",`bytes ${start}-${end}/${total}`);r.setHeader("Content-Length",end-start+1);return r.end(buf.subarray(start,end+1));}}
  r.setHeader("Content-Length",total);r.end(buf);
 }catch(e){console.error("message-media",e);r.status(500).end()}
});
app.post("/api/messages",async(q,r)=>{
 try{
  const me=await auth(q,r);if(!me)return;
  const code=String(q.body?.code||"").trim().toUpperCase(),body=String(q.body?.body||"").trim();
  if(!body)return r.status(400).json({error:"Mensagem vazia."});
  if(body.length>4000)return r.status(400).json({error:"Mensagem muito longa."});
  if(!rateLimit("dm:"+me.id,40,60*1000))return r.status(429).json({error:"Muitas mensagens em pouco tempo. Aguarde um instante."});
  const {other,error,status}=await getFriendForDM(me,code);if(error)return r.status(status).json({error});
  const x=await pool.query("INSERT INTO direct_messages(sender_id,receiver_id,body) VALUES($1,$2,$3) RETURNING id,sender_id,receiver_id,body,created_at,read_at",[me.id,other.id,body]);
  const message=messagePublic(x.rows[0],me.id);
  const receiverMessage=messagePublic(x.rows[0],other.id);
  notifyUser(other.code,"dm-new",{code:me.code,fromName:me.name,message:receiverMessage});
  await addNotification(other.id,"message","Nova mensagem",me.name+" enviou uma mensagem.",{code:me.code});
  r.json({message});
 }catch(e){console.error(e);r.status(500).json({error:"Não foi possível enviar a mensagem."})}
});
app.post("/api/messages/media",(req,res,next)=>{upload.single("file")(req,res,err=>{if(err){return res.status(err.code==="LIMIT_FILE_SIZE"?413:400).json({error:err.message||"Não foi possível receber o arquivo."})}next()})},async(q,r)=>{
 try{
  const me=await auth(q,r);if(!me)return;
  const code=String(q.body?.code||"").trim().toUpperCase(),caption=String(q.body?.body||"").trim();
  if(caption.length>4000)return r.status(400).json({error:"Legenda muito longa."});
  if(!q.file)return r.status(400).json({error:"Escolha uma foto ou vídeo."});
  if(q.file.size>20*1024*1024)return r.status(413).json({error:"Arquivo muito grande. O limite é 20 MB."});
  const duration=Number(q.body?.duration||0);
  if(q.file.mimetype.startsWith("video/") && (!Number.isFinite(duration)||duration<=0||duration>60.5))return r.status(400).json({error:"Os vídeos precisam ter até 1 minuto."});
  const {other,error,status}=await getFriendForDM(me,code);if(error)return r.status(status).json({error});
  if(!rateLimit("dm-media:"+me.id,12,60*1000))return r.status(429).json({error:"Muitos arquivos enviados. Aguarde um pouco."});
  const kind=q.file.mimetype.startsWith("image/")?"image":"video";
  const x=await pool.query(`INSERT INTO direct_messages(sender_id,receiver_id,body,media_type,media_name,media_mime,media_size,media_duration,media_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,sender_id,receiver_id,body,created_at,read_at`,[me.id,other.id,caption||null,kind,String(q.file.originalname||"media").slice(0,180),q.file.mimetype,q.file.size,q.file.mimetype.startsWith("video/")?duration:null,q.file.buffer]);
  const row=await pool.query("SELECT CASE WHEN media_data IS NOT NULL THEN id END AS media_id,media_type,media_name,media_mime,media_size,media_duration FROM direct_messages WHERE id=$1",[x.rows[0].id]);
  const message=messagePublic({...x.rows[0],...row.rows[0]},me.id);notifyUser(other.code,"dm-new",{code:me.code,fromName:me.name,message}); await addNotification(other.id,"message","Nova mensagem",me.name+" enviou uma mensagem.",{code:me.code});r.json({message});
 }catch(e){console.error("message-media-upload",e);r.status(500).json({error:"Não foi possível enviar o arquivo."})}
});
app.get("/api/friends",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const f=await pool.query(`SELECT u.name,u.email,u.code FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=$1 ORDER BY u.name`,[u.id]);const reqs=await pool.query(`SELECT u.name,u.email,u.code FROM friend_requests fr JOIN users u ON u.id=fr.sender_id WHERE fr.receiver_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC`,[u.id]);r.json({friends:f.rows.map(u2=>({...pub(u2),online:onlineByCode.has(u2.code)})),requests:reqs.rows.map(pub)})}catch(e){console.error(e);r.status(500).json({error:"Erro ao carregar amigos."})}});
app.post("/api/friends/request",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").trim().toUpperCase(),x=await getUserByCode(c);if(!x)return r.status(404).json({error:"Usuário não encontrado."});if(x.id===u.id)return r.status(400).json({error:"Você não pode adicionar a si mesmo."});const exists=await pool.query("SELECT 1 FROM friendships WHERE user_id=$1 AND friend_id=$2",[u.id,x.id]);if(exists.rowCount)return r.status(400).json({error:"Vocês já são amigos."});const reverse=await pool.query("SELECT 1 FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'",[x.id,u.id]);if(reverse.rowCount)return r.status(400).json({error:"Esse usuário já enviou uma solicitação para você."});await pool.query("INSERT INTO friend_requests(sender_id,receiver_id,status) VALUES($1,$2,'pending') ON CONFLICT(sender_id,receiver_id) DO UPDATE SET status='pending'",[u.id,x.id]);notifyUser(x.code,"friend-request",{name:u.name,code:u.code}); await addNotification(x.id,"friend","Novo convite de amizade",u.name+" quer ser seu amigo.",{code:u.code});r.json({message:"Solicitação enviada."})}catch(e){console.error(e);r.status(500).json({error:"Erro ao enviar solicitação."})}});
app.post("/api/friends/accept",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").toUpperCase(),x=await getUserByCode(c);if(!x)return r.status(404).json({error:"Solicitação não encontrada."});const a=await pool.query("SELECT id FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'",[x.id,u.id]);if(!a.rowCount)return r.status(404).json({error:"Solicitação não encontrada."});const client=await pool.connect();try{await client.query("BEGIN");await client.query("UPDATE friend_requests SET status='accepted' WHERE id=$1",[a.rows[0].id]);await client.query("INSERT INTO friendships(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,x.id]);await client.query("INSERT INTO friendships(user_id,friend_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[x.id,u.id]);await client.query("COMMIT")}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}notifyUser(x.code,"friend-accepted",{name:u.name,code:u.code}); await addNotification(x.id,"friend","Convite aceito",u.name+" aceitou seu convite.",{code:u.code});r.json({ok:true})}catch(e){console.error(e);r.status(500).json({error:"Erro ao aceitar solicitação."})}});
app.post("/api/friends/reject",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").trim().toUpperCase(),x=await getUserByCode(c);if(!x)return r.status(404).json({error:"Solicitação não encontrada."});const a=await pool.query("DELETE FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'",[x.id,u.id]);if(!a.rowCount)return r.status(404).json({error:"Solicitação não encontrada."});r.json({ok:true})}catch(e){console.error(e);r.status(500).json({error:"Erro ao recusar solicitação."})}});
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
 const meCode=s.data.user?.code;
 if(meCode){
   if(!onlineByCode.has(meCode))onlineByCode.set(meCode,new Set());
   onlineByCode.get(meCode).add(s.id);
 }
 s.on("client-ping",t=>s.emit("client-pong",t));
 s.on("join",({room})=>{const u=s.data.user;if(!u)return;s.data.room=String(room||"geral").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32)||"geral";s.data.name=u.name;s.data.code=u.code;const rm=s.data.room;if(!rooms.has(rm))rooms.set(rm,new Map());rooms.get(rm).set(s.id,{id:s.id,name:u.name,code:u.code});s.join(rm);s.emit("room-users",userList(rm));s.to(rm).emit("user-joined",{id:s.id,name:u.name,code:u.code});if(calls.has(rm)){const h=calls.get(rm);s.emit("call-host",h);s.emit("call-state",{active:true,host:h,ready:[...ready(rm)]})}else s.emit("call-state",{active:false,host:null,ready:[]});if(roomMusic.has(rm))s.emit("music-state",musicStateFor(rm));});
 s.on("chat",({room,text})=>{if(room!==s.data.room)return;const t=String(text||"").trim().slice(0,1000);if(t)io.to(room).emit("chat",{name:s.data.name,text:t,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})})});
 s.on("call-start",({room},ack)=>{if(room!==s.data.room){if(typeof ack==="function")ack({ok:false,error:"Sala inválida"});return;}if(!calls.has(room)){calls.set(room,s.id);ready(room).add(s.id);io.to(room).emit("call-host",s.id);io.to(room).emit("system",s.data.name+" criou uma call.");broadcast(room)}const host=calls.get(room);s.emit("call-host",host);s.emit("call-state",{active:true,host,ready:[...ready(room)]});if(typeof ack==="function")ack({ok:true,host,ready:[...ready(room)]});});
 s.on("call-ready",({room})=>{if(room!==s.data.room||!calls.has(room))return;ready(room).add(s.id);const h=calls.get(room);s.emit("call-host",h);s.emit("call-ready-users",[...ready(room)].filter(id=>id!==s.id&&valid(s,id)));if(h!==s.id)io.to(h).emit("call-participant-ready",{id:s.id,name:s.data.name})});
 s.on("call-ready-request",({room})=>{if(room===s.data.room&&calls.get(room)===s.id)s.emit("call-ready-users",[...ready(room)].filter(id=>id!==s.id&&valid(s,id)))});
 s.on("call-leave",({room})=>{if(room===s.data.room){cleanReady(room,s.id);s.to(room).emit("call-participant-left",{id:s.id})}});
 function leaveRoom(s,room,{keepSocketRoom}={}){
   const rm=rooms.get(room);if(!rm)return;
   const was=calls.get(room)===s.id;const musicWas=roomMusic.get(room)?.hostId===s.id;
   cleanReady(room,s.id);rm.delete(s.id);
   if(musicWas){roomMusic.delete(room);io.to(room).emit("music-stop")}
   if(was){
     const next=[...rm.values()][0];
     if(next){calls.set(room,next.id);io.to(room).emit("call-host",next.id);io.to(room).emit("call-state",{active:true,host:next.id,ready:[...ready(room)]})}
     else{calls.delete(room);callReady.delete(room);io.to(room).emit("call-ended")}
   }
   s.to(room).emit("user-left",{id:s.id,name:s.data.name});
   s.to(room).emit("call-participant-left",{id:s.id});
   if(!keepSocketRoom)s.leave(room);
   broadcast(room);
   if(!rm.size){rooms.delete(room);calls.delete(room);callReady.delete(room)}
 }
 s.on("leave-room",({room})=>{
   if(!room||room!==s.data.room)return;
   leaveRoom(s,room);
   s.data.room=null;
 });
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
 s.on("signal",({to,data})=>{const rm=s.data.room;if(!rm||!to||!valid(s,to)||!calls.has(rm))return;const target=io.sockets.sockets.get(to);if(!target||target.data?.room!==rm)return;io.to(to).emit("signal",{from:s.id,data})});
 s.on("call-invite",async({code,room},ack)=>{
   try{
     const me=s.data.user;
     const targetCode=String(code||"").trim().toUpperCase();
     const targetRoom=String(room||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,32);
     if(!me||!targetCode||!targetRoom){if(typeof ack==="function")ack({ok:false,error:"Convite inválido."});return;}
     if(!rateLimit("call-invite:"+me.id,20,60*1000)){if(typeof ack==="function")ack({ok:false,error:"Muitos convites. Aguarde um pouco."});return;}
     const target=await getUserByCode(targetCode);
     if(!target){if(typeof ack==="function")ack({ok:false,error:"Amigo não encontrado."});return;}
     const f=await pool.query("SELECT 1 FROM friendships WHERE user_id=$1 AND friend_id=$2",[me.id,target.id]);
     if(!f.rowCount){if(typeof ack==="function")ack({ok:false,error:"Vocês precisam ser amigos para chamar."});return;}
     const delivered=notifyUser(target.code,"call-invite",{room:targetRoom,fromCode:me.code,fromName:me.name});
     if(typeof ack==="function")ack(delivered?{ok:true}:{ok:false,error:target.name+" está offline agora."});
   }catch(e){console.error("call-invite",e);if(typeof ack==="function")ack({ok:false,error:"Não foi possível enviar o convite."})}
 });
 s.on("call-invite-decline",({toCode,room})=>{
   const me=s.data.user;if(!me)return;
   const c=String(toCode||"").trim().toUpperCase();if(!c)return;
   notifyUser(c,"call-invite-declined",{room:String(room||"").trim().toUpperCase(),byName:me.name});
 });
 s.on("disconnect",()=>{const meCode=s.data.user?.code;if(meCode){const set=onlineByCode.get(meCode);if(set){set.delete(s.id);if(!set.size)onlineByCode.delete(meCode);}}const room=s.data.room;if(!room)return;if(!rooms.get(room))return;leaveRoom(s,room,{keepSocketRoom:true})})
});
setInterval(async()=>{const now=Date.now();for(const [t,v] of sessions)if(v.expires<now)sessions.delete(t);for(const [k,v] of rateLimits)if(!v.length||now-v[v.length-1]>10*60*1000)rateLimits.delete(k);for(const [k,v] of musicTokens)if(v.expires<now)musicTokens.delete(k);try{await pool.query("DELETE FROM app_sessions WHERE expires_at<NOW()")}catch(e){}},30*60*1000);
initDb().then(()=>server.listen(process.env.PORT||3000,()=>console.log("Conversa Live v2.5.3 server ativo com PostgreSQL + mensagens diretas em tempo real + music bot otimizado + convites de call"))).catch(e=>{console.error("Falha ao iniciar banco:",e);process.exit(1)});
