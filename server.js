const express=require("express"),http=require("http"),cors=require("cors"),crypto=require("crypto"),multer=require("multer"),{Server}=require("socket.io"),{Pool}=require("pg");
const app=express();
app.set("trust proxy",1);
const configuredOrigins=String(process.env.FRONTEND_URL||"").split(",").map(v=>v.trim()).filter(Boolean);
function allowOrigin(origin){
  if(!origin)return true;
  if(configuredOrigins.length===0||configuredOrigins.includes("*")||configuredOrigins.includes(origin))return true;
  if(origin==="https://freechat-ten.vercel.app")return true;
  if(/^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(origin))return true;
  if(/^https:\/\/[a-z0-9-]+(?:-[a-z0-9-]+)*\.netlify\.app$/i.test(origin))return true;
  if(/^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin))return true;
  return false;
}
const corsOptions={origin:(origin,cb)=>cb(null,allowOrigin(origin)),methods:["GET","POST","OPTIONS"],credentials:false};
app.use(cors(corsOptions));
app.use((req,res,next)=>{res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","DENY");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");res.setHeader("Permissions-Policy","camera=(self), microphone=(self), display-capture=(self)");res.setHeader("Cross-Origin-Opener-Policy","same-origin");res.setHeader("Cross-Origin-Resource-Policy","cross-origin");res.setHeader("Content-Security-Policy","default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; script-src 'self' https://cdn.socket.io; style-src 'self' 'unsafe-inline'; font-src 'self' data: https:; form-action 'self'");if(req.secure||req.headers["x-forwarded-proto"]==="https")res.setHeader("Strict-Transport-Security","max-age=31536000; includeSubDomains");next()});
app.use(express.json({limit:"32kb"}));

const server=http.createServer(app);
server.keepAliveTimeout=120000;
server.headersTimeout=125000;
const io=new Server(server,{path:"/socket.io",addTrailingSlash:false,cors:{origin:(origin,cb)=>cb(null,allowOrigin(origin)),methods:["GET","POST"],credentials:false},transports:["polling","websocket"],allowEIO3:true,connectTimeout:10000});
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});
pool.on("error",e=>console.error("PostgreSQL pool error:",e?.message||e));
let dbReady=false;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024},fileFilter:(req,file,cb)=>{const mime=/^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime|ogg))$/i.test(file.mimetype);const name=String(file.originalname||"").normalize("NFKC");const ext=(name.match(/\.([A-Za-z0-9]{1,8})$/)||[])[1]?.toLowerCase();const allowed=(file.mimetype.startsWith("image/")?{jpeg:"image/jpeg",jpg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"}:{mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime",ogg:"video/ogg",oga:"video/ogg"});const ok=!!ext&&mime&&allowed[ext]===file.mimetype.toLowerCase()&&!/\.(php|phtml|js|html|svg|exe|bat|cmd|sh)(\.|$)/i.test(name);cb(ok?null:new Error("Arquivo não permitido. Use uma imagem JPG/PNG/WEBP/GIF ou vídeo MP4/WebM/MOV/OGG."),ok)}});
const sessions=new Map(),rooms=new Map(),calls=new Map(),callReady=new Map(),pendingSignals=new Map(),rateLimits=new Map(),roomMusic=new Map(),musicTokens=new Map();
function validFileSignature(file){try{const b=file?.buffer;if(!b||!b.length)return false;const mime=String(file.mimetype||"").toLowerCase();if(mime==="image/jpeg")return b[0]===0xff&&b[1]===0xd8&&b[2]===0xff;if(mime==="image/png")return b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));if(mime==="image/gif")return b.subarray(0,6).toString()==="GIF87a"||b.subarray(0,6).toString()==="GIF89a";if(mime==="image/webp")return b.subarray(0,4).toString()==="RIFF"&&b.subarray(8,12).toString()==="WEBP";if(mime==="video/ogg")return b.subarray(0,4).toString()==="OggS";if(mime==="video/webm")return b.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));if(mime==="video/mp4"||mime==="video/quicktime")return b.length>12&&b.subarray(4,8).toString()==="ftyp";return false}catch(e){return false}}
function safeFilename(name){return String(name||"media").normalize("NFKC").replace(/[^A-Za-z0-9._ -]/g,"_").replace(/\.{2,}/g,".").slice(0,120)||"media";}

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
 await pool.query("ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
 await pool.query("ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()");
 await pool.query("ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT");
 await pool.query("ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS ip_hash TEXT");
 await pool.query("CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions(user_id,created_at DESC)");
 await pool.query("CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions(expires_at)");
 await pool.query(`CREATE TABLE IF NOT EXISTS security_events(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,event_type VARCHAR(48) NOT NULL,ip_hash TEXT,user_agent TEXT,meta JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query("CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id,created_at DESC)");
 await pool.query(`CREATE TABLE IF NOT EXISTS blocked_users(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,blocked_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,blocked_id))`);
 await pool.query(`CREATE TABLE IF NOT EXISTS reports(id BIGSERIAL PRIMARY KEY,reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,target_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason VARCHAR(64) NOT NULL,details VARCHAR(1000),status VARCHAR(16) NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS user_privacy(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,message_policy VARCHAR(16) NOT NULL DEFAULT 'friends',call_policy VARCHAR(16) NOT NULL DEFAULT 'friends',friend_policy VARCHAR(16) NOT NULL DEFAULT 'everyone')`);
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
const SCRYPT_N=16384, SCRYPT_R=8, SCRYPT_P=1, SCRYPT_KEYLEN=64;
function legacyHash(password,salt){return crypto.createHash("sha256").update(String(salt)+String(password)).digest("hex");}
function hashPassword(password){return new Promise((resolve,reject)=>{const salt=crypto.randomBytes(16);crypto.scrypt(String(password),salt, SCRYPT_KEYLEN,{N:SCRYPT_N,r:SCRYPT_R,p:SCRYPT_P,maxmem:32*1024*1024},(err,derived)=>{if(err)return reject(err);resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derived.toString("base64url")}`)})})}
function verifyPassword(password,stored,legacySalt=""){
  const value=String(stored||"");
  if(value.startsWith("scrypt$")){
    const parts=value.split("$"); if(parts.length!==6)return Promise.resolve(false);
    const [,n,r,pp,saltB64,hashB64]=parts;
    const N=Number(n),R=Number(r),P=Number(pp); if(!N||!R||!P)return Promise.resolve(false);
    return new Promise(resolve=>crypto.scrypt(String(password),Buffer.from(saltB64,"base64url"),Buffer.from(hashB64,"base64url").length,{N,r:R,p:P,maxmem:64*1024*1024},(err,derived)=>{if(err)return resolve(false);const expected=Buffer.from(hashB64,"base64url");resolve(expected.length===derived.length&&crypto.timingSafeEqual(expected,derived));}));
  }
  try{const h=legacyHash(password,legacySalt);const expected=Buffer.from(h,"hex"),actual=Buffer.from(String(stored),"hex");return Promise.resolve(expected.length===actual.length&&crypto.timingSafeEqual(expected,actual));}catch(e){return Promise.resolve(false)}
}
function sessionHash(t){return crypto.createHash("sha256").update(String(t)).digest("hex");}
const failedLogins=new Map();
function loginAllowed(key){const now=Date.now(),x=failedLogins.get(key)||[];const fresh=x.filter(t=>now-t<15*60*1000);failedLogins.set(key,fresh);return fresh.length<8;}
function noteFailedLogin(key){const now=Date.now(),x=failedLogins.get(key)||[];x.push(now);failedLogins.set(key,x.filter(t=>now-t<15*60*1000));}
function clearFailedLogin(key){failedLogins.delete(key);}
async function securityEvent(userId,type,meta={}){try{await pool.query("INSERT INTO security_events(user_id,event_type,ip_hash,user_agent,meta) VALUES($1,$2,$3,$4,$5)",[userId||null,type,meta.ip?crypto.createHash("sha256").update(String(process.env.SESSION_SECRET||"freechat")+String(meta.ip)).digest("hex"):null,String(meta.ua||"").slice(0,300),JSON.stringify(meta.data||{})])}catch(e){console.error("security-event",e)}}
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
async function token(u,meta={}){
  const t=crypto.randomBytes(32).toString("base64url");
  const expires=Date.now()+SESSION_TTL_MS;
  sessions.set(t,{userId:u.id,email:u.email,expires});
  await pool.query("INSERT INTO app_sessions(token,user_id,email,expires_at,user_agent,ip_hash) VALUES($1,$2,$3,to_timestamp($4/1000.0),$5,$6)",[sessionHash(t),u.id,u.email,expires,String(meta.ua||"").slice(0,300),meta.ip?crypto.createHash("sha256").update(String(process.env.SESSION_SECRET||"freechat")+String(meta.ip)).digest("hex"):null]);
  return t;
}
async function getSession(t){
  if(!t)return null;
  const mem=sessions.get(t);
  if(mem&&mem.expires>Date.now())return mem;
  if(mem)sessions.delete(t);
  const x=await pool.query("SELECT user_id,email,EXTRACT(EPOCH FROM expires_at)*1000 AS expires_ms FROM app_sessions WHERE token=$1 LIMIT 1",[sessionHash(t)]);
  const row=x.rows[0];
  if(!row)return null;
  const expires=Number(row.expires_ms);
  if(!Number.isFinite(expires)||expires<Date.now()){
    await pool.query("DELETE FROM app_sessions WHERE token=$1",[sessionHash(t)]);
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
  if(req.method!=="GET" && !rateLimit("user-api:"+sess.userId+":"+req.path,60,60*1000)){res.status(429).json({error:"Muitas ações em pouco tempo. Aguarde um momento."});return null;}
  const u=await getUserByEmail(sess.email);
  if(!u){
    sessions.delete(t);
    await pool.query("DELETE FROM app_sessions WHERE token=$1",[sessionHash(t)]);
    res.status(401).json({error:"Sessão inválida."});
    return null;
  }
  sess.expires=Date.now()+SESSION_TTL_MS;
  await pool.query("UPDATE app_sessions SET expires_at=to_timestamp($2/1000.0),email=$3,last_seen_at=NOW() WHERE token=$1",[sessionHash(t),sess.expires,u.email]);
  return u;
}

app.get("/",(_,r)=>r.send("Conversa Live server OK — v3.1.0 PostgreSQL + música"));
app.get("/health",async(_,r)=>{
  if(!dbReady)return r.status(503).json({ok:false,database:false,version:"3.1.0",service:"conversa-live-server"});
  try{await pool.query("SELECT 1");r.json({ok:true,database:true,version:"3.1.0",service:"conversa-live-server"})}
  catch(e){dbReady=false;r.status(503).json({ok:false,database:false,version:"3.1.0",service:"conversa-live-server"})}
});

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
 if(!validFileSignature(q.file))return r.status(400).json({error:"O conteúdo do arquivo não corresponde ao formato informado."});
 const isVideo=q.file.mimetype.startsWith("video/");
 if(isVideo && (!Number.isFinite(duration)||duration<=0||duration>60.5))return r.status(400).json({error:"Os vídeos precisam ter até 1 minuto."});
 if(!body && !q.file)return r.status(400).json({error:"Adicione uma legenda ou mídia."});
 if(!rateLimit("feed-media:"+u.id,8,60*1000))return r.status(429).json({error:"Muitas publicações com mídia. Aguarde um pouco."});
 const kind=q.file.mimetype.startsWith("image/")?"image":"video";
 const x=await pool.query(`INSERT INTO social_posts(author_id,body,media_type,media_name,media_mime,media_size,media_duration,media_data)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,body,created_at`,[
   u.id,body||null,kind,safeFilename(q.file.originalname||"media"),q.file.mimetype,q.file.size,isVideo?duration:null,q.file.buffer
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
    if(password.length<10||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return r.status(400).json({error:"A senha precisa ter pelo menos 10 caracteres e incluir letras e números."});
    if(await getUserByEmail(email))return r.status(409).json({error:"Este e-mail já possui uma conta."});
    let c;do c=code();while(await getUserByCode(c));
    const salt=crypto.randomBytes(16).toString("hex"),h=await hashPassword(password);
    const x=await pool.query("INSERT INTO users(name,email,code,salt,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,code",[name,email,c,salt,h]);
    const u=x.rows[0];
    await securityEvent(u.id,"ACCOUNT_CREATED",{ip:requestIp(q),ua:q.headers["user-agent"]});
    r.json({user:pub(u),token:await token(u,{ip:requestIp(q),ua:q.headers["user-agent"]}),message:"Conta criada com sucesso."});
  }catch(e){
    console.error(e);
    r.status(500).json({error:e.message||"Não foi possível criar a conta."});
  }
});
app.post("/api/login",guard,async(q,r)=>{
  try{
    const email=cleanEmail(q.body?.email),p=String(q.body?.password||""),ip=requestIp(q),key=ip+":"+email;
    if(!loginAllowed(key))return r.status(429).json({error:"Muitas tentativas de login. Aguarde 15 minutos."});
    const u=await getUserByEmail(email);
    if(!u){noteFailedLogin(key);await securityEvent(null,"LOGIN_FAILED",{ip,ua:q.headers["user-agent"],data:{email}});return r.status(401).json({error:"E-mail ou senha incorretos."});}
    const ok=await verifyPassword(p,u.password_hash,u.salt);
    if(!ok){noteFailedLogin(key);await securityEvent(u.id,"LOGIN_FAILED",{ip,ua:q.headers["user-agent"]});return r.status(401).json({error:"E-mail ou senha incorretos."});}
    clearFailedLogin(key);
    if(!String(u.password_hash).startsWith("scrypt$")){const upgraded=await hashPassword(p);await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2",[upgraded,u.id]);}
    const t=await token(u,{ip,ua:q.headers["user-agent"]});
    await securityEvent(u.id,"LOGIN_SUCCESS",{ip,ua:q.headers["user-agent"]});
    r.json({user:pub(u),token:t,message:"Login realizado com sucesso."});
  }catch(e){console.error(e);r.status(500).json({error:"Erro ao entrar."});}
});

app.post("/api/logout",async(q,r)=>{try{const raw=String(q.headers.authorization||"");const t=raw.startsWith("Bearer ")?raw.slice(7).trim():"";if(t){const sess=await getSession(t);if(sess)await securityEvent(sess.userId,"LOGOUT",{ip:requestIp(q),ua:q.headers["user-agent"]});sessions.delete(t);await pool.query("DELETE FROM app_sessions WHERE token=$1",[sessionHash(t)]);}r.json({ok:true})}catch(e){r.json({ok:true})}});

app.get("/api/security/sessions",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const raw=String(q.headers.authorization||"");const current=raw.startsWith("Bearer ")?sessionHash(raw.slice(7).trim()):"";const x=await pool.query("SELECT token,created_at,last_seen_at,user_agent,expires_at FROM app_sessions WHERE user_id=$1 AND expires_at>NOW() ORDER BY last_seen_at DESC",[u.id]);r.json({sessions:x.rows.map(v=>({id:crypto.createHash("sha256").update(v.token).digest("hex").slice(0,12),current:v.token===current,created_at:v.created_at,last_seen_at:v.last_seen_at,expires_at:v.expires_at,user_agent:v.user_agent||"Navegador"}))})}catch(e){r.status(500).json({error:"Não foi possível carregar as sessões."})}});
app.post("/api/security/revoke",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const id=String(q.body?.id||"");if(!/^[a-f0-9]{12}$/.test(id))return r.status(400).json({error:"Sessão inválida."});const x=await pool.query("SELECT token FROM app_sessions WHERE user_id=$1 AND expires_at>NOW()",[u.id]);const hit=x.rows.find(v=>crypto.createHash("sha256").update(v.token).digest("hex").slice(0,12)===id);if(!hit)return r.status(404).json({error:"Sessão não encontrada."});await pool.query("DELETE FROM app_sessions WHERE token=$1",[hit.token]);await securityEvent(u.id,"SESSION_REVOKED",{ip:requestIp(q),ua:q.headers["user-agent"]});r.json({ok:true})}catch(e){r.status(500).json({error:"Não foi possível revogar a sessão."})}});
app.post("/api/security/revoke-all",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const raw=String(q.headers.authorization||"");const current=raw.startsWith("Bearer ")?sessionHash(raw.slice(7).trim()):"";await pool.query("DELETE FROM app_sessions WHERE user_id=$1 AND token<>$2",[u.id,current]);await securityEvent(u.id,"ALL_OTHER_SESSIONS_REVOKED",{ip:requestIp(q),ua:q.headers["user-agent"]});r.json({ok:true})}catch(e){r.status(500).json({error:"Não foi possível encerrar as outras sessões."})}});
app.post("/api/security/password",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const current=String(q.body?.currentPassword||""),next=String(q.body?.newPassword||"");if(next.length<10)return r.status(400).json({error:"A nova senha precisa ter pelo menos 10 caracteres."});if(!/[A-Za-z]/.test(next)||!/[0-9]/.test(next))return r.status(400).json({error:"Use letras e números na nova senha."});if(!(await verifyPassword(current,u.password_hash,u.salt)))return r.status(401).json({error:"Senha atual incorreta."});const h=await hashPassword(next);await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2",[h,u.id]);const raw=String(q.headers.authorization||"");const currentToken=raw.startsWith("Bearer ")?sessionHash(raw.slice(7).trim()):"";await pool.query("DELETE FROM app_sessions WHERE user_id=$1 AND token<>$2",[u.id,currentToken]);await securityEvent(u.id,"PASSWORD_CHANGED",{ip:requestIp(q),ua:q.headers["user-agent"]});r.json({ok:true,message:"Senha alterada. As outras sessões foram encerradas."})}catch(e){console.error(e);r.status(500).json({error:"Não foi possível alterar a senha."})}});
app.get("/api/security/events",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const x=await pool.query("SELECT event_type,created_at,meta FROM security_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30",[u.id]);r.json({events:x.rows})}catch(e){r.status(500).json({error:"Não foi possível carregar o histórico de segurança."})}});




async function getFriendForDM(me,code){
 const other=await getUserByCode(String(code||"").trim().toUpperCase());
 if(!other)return {error:"Usuário não encontrado.",status:404};
 if(Number(other.id)===Number(me.id))return {error:"Você não pode conversar consigo mesmo.",status:400};
 const privacy=await privacyFor(other.id);
 if(!(await canContact(other.id,me.id,privacy.message_policy)))return {error:"Este usuário não permite mensagens de você.",status:403};
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
  const mt=String(q.query?.mt||"");
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
  const x=await pool.query(`INSERT INTO direct_messages(sender_id,receiver_id,body,media_type,media_name,media_mime,media_size,media_duration,media_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,sender_id,receiver_id,body,created_at,read_at`,[me.id,other.id,caption||null,kind,safeFilename(q.file.originalname||"media"),q.file.mimetype,q.file.size,q.file.mimetype.startsWith("video/")?duration:null,q.file.buffer]);
  const row=await pool.query("SELECT CASE WHEN media_data IS NOT NULL THEN id END AS media_id,media_type,media_name,media_mime,media_size,media_duration FROM direct_messages WHERE id=$1",[x.rows[0].id]);
  const message=messagePublic({...x.rows[0],...row.rows[0]},me.id);notifyUser(other.code,"dm-new",{code:me.code,fromName:me.name,message}); await addNotification(other.id,"message","Nova mensagem",me.name+" enviou uma mensagem.",{code:me.code});r.json({message});
 }catch(e){console.error("message-media-upload",e);r.status(500).json({error:"Não foi possível enviar o arquivo."})}
});
async function privacyFor(userId){const x=await pool.query("SELECT message_policy,call_policy,friend_policy FROM user_privacy WHERE user_id=$1",[userId]);if(x.rowCount)return x.rows[0];await pool.query("INSERT INTO user_privacy(user_id) VALUES($1) ON CONFLICT DO NOTHING",[userId]);return {message_policy:"friends",call_policy:"friends",friend_policy:"everyone"}}
async function areFriends(a,b){return (await pool.query("SELECT 1 FROM friendships WHERE (user_id=$1 AND friend_id=$2) LIMIT 1",[a,b])).rowCount>0}
async function isBlocked(a,b){return (await pool.query("SELECT 1 FROM blocked_users WHERE (user_id=$1 AND blocked_id=$2) OR (user_id=$2 AND blocked_id=$1) LIMIT 1",[a,b])).rowCount>0}
async function canContact(targetId,meId,policy){if(await isBlocked(targetId,meId))return false;if(policy==="everyone")return true;if(policy==="nobody")return false;return areFriends(targetId,meId)}
app.get("/api/security/privacy",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;r.json(await privacyFor(u.id))}catch(e){r.status(500).json({error:"Não foi possível carregar a privacidade."})}});
app.patch("/api/security/privacy",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const allowed=["everyone","friends","nobody"];const m=String(q.body?.message_policy||"friends"),c=String(q.body?.call_policy||"friends"),f=String(q.body?.friend_policy||"everyone");if(!allowed.includes(m)||!allowed.includes(c)||!allowed.includes(f))return r.status(400).json({error:"Configuração de privacidade inválida."});await pool.query("INSERT INTO user_privacy(user_id,message_policy,call_policy,friend_policy) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET message_policy=EXCLUDED.message_policy,call_policy=EXCLUDED.call_policy,friend_policy=EXCLUDED.friend_policy",[u.id,m,c,f]);await securityEvent(u.id,"PRIVACY_UPDATED",{ip:requestIp(q),ua:q.headers["user-agent"]});r.json({message_policy:m,call_policy:c,friend_policy:f})}catch(e){r.status(500).json({error:"Não foi possível salvar a privacidade."})}});

app.get("/api/security/blocked",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const x=await pool.query("SELECT u.name,u.code FROM blocked_users b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=$1 ORDER BY b.created_at DESC",[u.id]);r.json({blocked:x.rows})}catch(e){r.status(500).json({error:"Não foi possível carregar bloqueios."})}});
app.post("/api/security/block",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const target=await getUserByCode(q.body?.code);if(!target||Number(target.id)===Number(u.id))return r.status(400).json({error:"Usuário inválido."});await pool.query("INSERT INTO blocked_users(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[u.id,target.id]);await securityEvent(u.id,"USER_BLOCKED",{ip:requestIp(q),ua:q.headers["user-agent"],data:{target:target.code}});r.json({ok:true})}catch(e){r.status(500).json({error:"Não foi possível bloquear."})}});
app.post("/api/security/unblock",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;await pool.query("DELETE FROM blocked_users WHERE user_id=$1 AND blocked_id=(SELECT id FROM users WHERE code=$2)",[u.id,String(q.body?.code||"").trim().toUpperCase()]);r.json({ok:true})}catch(e){r.status(500).json({error:"Não foi possível desbloquear."})}});
app.post("/api/security/report",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const target=await getUserByCode(q.body?.code);const reason=String(q.body?.reason||"").trim().slice(0,64),details=String(q.body?.details||"").trim().slice(0,1000);if(!target||Number(target.id)===Number(u.id)||!reason)return r.status(400).json({error:"Denúncia inválida."});await pool.query("INSERT INTO reports(reporter_id,target_id,reason,details) VALUES($1,$2,$3,$4)",[u.id,target.id,reason,details||null]);await securityEvent(u.id,"REPORT_CREATED",{ip:requestIp(q),ua:q.headers["user-agent"],data:{target:target.code,reason}});r.json({ok:true,message:"Denúncia registrada."})}catch(e){r.status(500).json({error:"Não foi possível registrar a denúncia."})}});

app.get("/api/friends",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const f=await pool.query(`SELECT u.name,u.email,u.code FROM friendships f JOIN users u ON u.id=f.friend_id WHERE f.user_id=$1 ORDER BY u.name`,[u.id]);const reqs=await pool.query(`SELECT u.name,u.email,u.code FROM friend_requests fr JOIN users u ON u.id=fr.sender_id WHERE fr.receiver_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC`,[u.id]);r.json({friends:f.rows.map(u2=>({...pub(u2),online:onlineByCode.has(u2.code)})),requests:reqs.rows.map(pub)})}catch(e){console.error(e);r.status(500).json({error:"Erro ao carregar amigos."})}});
app.post("/api/friends/request",async(q,r)=>{try{const u=await auth(q,r);if(!u)return;const c=String(q.body?.code||"").trim().toUpperCase(),x=await getUserByCode(c);if(!x)return r.status(404).json({error:"Usuário não encontrado."});if(x.id===u.id)return r.status(400).json({error:"Você não pode adicionar a si mesmo."});const privacy=await privacyFor(x.id);if(privacy.friend_policy==="nobody")return r.status(403).json({error:"Este usuário não aceita solicitações de amizade."});if(privacy.friend_policy==="friends"){const fof=await pool.query("SELECT 1 FROM friendships a JOIN friendships b ON a.friend_id=b.friend_id WHERE a.user_id=$1 AND b.user_id=$2 LIMIT 1",[u.id,x.id]);if(!fof.rowCount)return r.status(403).json({error:"Este usuário aceita apenas amigos de amigos."});}const exists=await pool.query("SELECT 1 FROM friendships WHERE user_id=$1 AND friend_id=$2",[u.id,x.id]);if(exists.rowCount)return r.status(400).json({error:"Vocês já são amigos."});const reverse=await pool.query("SELECT 1 FROM friend_requests WHERE sender_id=$1 AND receiver_id=$2 AND status='pending'",[x.id,u.id]);if(reverse.rowCount)return r.status(400).json({error:"Esse usuário já enviou uma solicitação para você."});await pool.query("INSERT INTO friend_requests(sender_id,receiver_id,status) VALUES($1,$2,'pending') ON CONFLICT(sender_id,receiver_id) DO UPDATE SET status='pending'",[u.id,x.id]);notifyUser(x.code,"friend-request",{name:u.name,code:u.code}); await addNotification(x.id,"friend","Novo convite de amizade",u.name+" quer ser seu amigo.",{code:u.code});r.json({message:"Solicitação enviada."})}catch(e){console.error(e);r.status(500).json({error:"Erro ao enviar solicitação."})}});
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
 await pool.query("UPDATE app_sessions SET expires_at=to_timestamp($2/1000.0),last_seen_at=NOW() WHERE token=$1",[sessionHash(t),sess.expires]);
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
 s.on("call-ready",({room})=>{
   if(room!==s.data.room||!calls.has(room))return;
   ready(room).add(s.id);
   const h=calls.get(room);
   s.emit("call-host",h);
   s.emit("call-ready-users",[...ready(room)].filter(id=>id!==s.id&&valid(s,id)));
   // Flush any signaling messages that arrived a fraction before this socket
   // was marked ready (common during fast reconnects).
   const queued=pendingSignals.get(s.id)||[];
   pendingSignals.delete(s.id);
   for(const q of queued){
     if(q?.room===room&&valid(s,q.from))io.to(s.id).emit("signal",{from:q.from,data:q.data});
   }
   for(const id of ready(room)){if(id!==s.id)io.to(id).emit("call-participant-ready",{id:s.id,name:s.data.name});}
 });
 s.on("call-ready-request",({room})=>{if(room===s.data.room&&calls.get(room)===s.id)s.emit("call-ready-users",[...ready(room)].filter(id=>id!==s.id&&valid(s,id)))});
 s.on("call-leave",({room})=>{if(room===s.data.room){cleanReady(room,s.id);pendingSignals.delete(s.id);s.to(room).emit("call-participant-left",{id:s.id})}});
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
 // Recusa silenciosa deixava o usuário sem saber por que o botão não fez nada.
 function denyMusicControl(s){s.emit("music-command-error","Só o criador da call pode controlar a música.");return false;}
 s.on("music-play",({room,track})=>{if(!musicParticipant(s,room)){s.emit("music-command-error","Entre em uma call ativa para usar o bot de música.");return;}const clean=cleanMusicTrack(track);if(!clean)return;let st=roomMusic.get(room);if(st){if(st.queue.length>=50){s.emit("music-command-error","A fila está cheia (máximo 50).");return;}st.queue.push(clean);io.to(room).emit("music-state",musicStateFor(room));io.to(room).emit("system",s.data.name+" adicionou 🎵 "+clean.title+" à fila.");return;}st={track:clean,queue:[],hostId:s.id,startedAt:Date.now(),position:0,paused:false,volume:.7};roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));io.to(room).emit("system",s.data.name+" colocou 🎵 "+clean.title+" para tocar.");});
 s.on("music-next",({room})=>{if(!musicController(s,room))return denyMusicControl(s);const st=roomMusic.get(room);if(!st)return;const n=st.queue.shift();if(n){st.track=n;st.startedAt=Date.now();st.position=0;st.paused=false;roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));}else{roomMusic.delete(room);io.to(room).emit("music-stop");io.to(room).emit("system","🎵 A fila terminou.");}});
 s.on("music-pause",({room})=>{if(!musicController(s,room))return denyMusicControl(s);const st=roomMusic.get(room);if(!st||st.paused)return;st.position=musicStateFor(room).position;st.paused=true;roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));});
 s.on("music-resume",({room})=>{if(!musicController(s,room))return denyMusicControl(s);const st=roomMusic.get(room);if(!st?.paused)return;st.startedAt=Date.now();st.paused=false;roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));});
 s.on("music-volume",({room,volume})=>{if(!musicController(s,room))return denyMusicControl(s);const st=roomMusic.get(room);if(!st)return;st.volume=Math.max(0,Math.min(1,Number(volume)||0));roomMusic.set(room,st);io.to(room).emit("music-state",musicStateFor(room));});
 s.on("music-queue",({room})=>{if(room!==s.data.room)return;const q=roomMusic.get(room)?.queue||[];s.emit("system",q.length?"🎵 Fila ("+q.length+"):\n"+q.slice(0,15).map((x,i)=>(i+1)+". "+x.title+" — "+x.artist).join("\n"):"🎵 A fila está vazia.");});
 s.on("music-stop",({room})=>{if(!musicController(s,room))return denyMusicControl(s);roomMusic.delete(room);io.to(room).emit("music-stop");io.to(room).emit("system",s.data.name+" parou a música e limpou a fila.");});
 s.on("signal",({to,data})=>{
   const rm=s.data.room;
   if(!rm||!to||!data||!valid(s,to)||!calls.has(rm))return;
   const target=io.sockets.sockets.get(to);
   if(!target||target.data?.room!==rm)return;
   if(!ready(rm).has(to)){
     const q=pendingSignals.get(to)||[];
     q.push({room:rm,from:s.id,data});
     if(q.length>100)q.shift();
     pendingSignals.set(to,q);
     return;
   }
   io.to(to).emit("signal",{from:s.id,data});
 });
 s.on("call-invite",async({code,room},ack)=>{
   try{
     const me=s.data.user;
     const targetCode=String(code||"").trim().toUpperCase();
     const targetRoom=String(room||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,32);
     if(!me||!targetCode||!targetRoom){if(typeof ack==="function")ack({ok:false,error:"Convite inválido."});return;}
     if(!rateLimit("call-invite:"+me.id,20,60*1000)){if(typeof ack==="function")ack({ok:false,error:"Muitos convites. Aguarde um pouco."});return;}
     const target=await getUserByCode(targetCode);
     if(!target){if(typeof ack==="function")ack({ok:false,error:"Amigo não encontrado."});return;}
     const privacy=await privacyFor(target.id);
     if(!(await canContact(target.id,me.id,privacy.call_policy))){if(typeof ack==="function")ack({ok:false,error:"Este usuário não permite chamadas de você."});return;}
     const delivered=notifyUser(target.code,"call-invite",{room:targetRoom,fromCode:me.code,fromName:me.name});
     if(typeof ack==="function")ack(delivered?{ok:true}:{ok:false,error:target.name+" está offline agora."});
   }catch(e){console.error("call-invite",e);if(typeof ack==="function")ack({ok:false,error:"Não foi possível enviar o convite."})}
 });
 s.on("call-invite-decline",({toCode,room})=>{
   const me=s.data.user;if(!me)return;
   const c=String(toCode||"").trim().toUpperCase();if(!c)return;
   notifyUser(c,"call-invite-declined",{room:String(room||"").trim().toUpperCase(),byName:me.name});
 });
 s.on("disconnect",()=>{
   pendingSignals.delete(s.id);
   for(const [target,q] of pendingSignals){const filtered=q.filter(x=>x.from!==s.id);if(filtered.length)pendingSignals.set(target,filtered);else pendingSignals.delete(target);}
const meCode=s.data.user?.code;if(meCode){const set=onlineByCode.get(meCode);if(set){set.delete(s.id);if(!set.size)onlineByCode.delete(meCode);}}const room=s.data.room;if(!room)return;if(!rooms.get(room))return;leaveRoom(s,room,{keepSocketRoom:true})})
});
setInterval(async()=>{const now=Date.now();for(const [t,v] of sessions)if(v.expires<now)sessions.delete(t);for(const [k,v] of rateLimits)if(!v.length||now-v[v.length-1]>10*60*1000)rateLimits.delete(k);for(const [k,v] of musicTokens)if(v.expires<now)musicTokens.delete(k);try{await pool.query("DELETE FROM app_sessions WHERE expires_at<NOW()")}catch(e){}},30*60*1000);
const PORT=Number(process.env.PORT)||3000;
server.listen(PORT,"0.0.0.0",()=>{
  console.log("Conversa Live v3.1.0 server ativo na porta "+PORT);
  initDbWithRetry();
});
async function initDbWithRetry(){
  for(;;){
    try{
      await initDb();
      dbReady=true;
      console.log("PostgreSQL conectado e banco pronto.");
      return;
    }catch(e){
      dbReady=false;
      console.error("Falha ao iniciar banco; nova tentativa em 5s:",e?.message||e);
      await new Promise(r=>setTimeout(r,5000));
    }
  }
}
