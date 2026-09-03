const express=require("express");
const http=require("http");
const cors=require("cors");
const {Server}=require("socket.io");
const app=express();
app.use(cors({origin:"*"}));
app.get("/",(_,res)=>res.send("Conversa Live signaling server OK"));
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*",methods:["GET","POST"]}});
const rooms=new Map();
const calls=new Map();

function roomUsers(room){
 const r=rooms.get(room); return r?[...r.values()].map(x=>({id:x.id,name:x.name,host:x.id===calls.get(room)})):[];
}
function broadcastUsers(room){io.to(room).emit("room-users",roomUsers(room));}
function validMember(socket,id){const room=socket.data.room;const r=rooms.get(room);return !!r&&r.has(id);}

io.on("connection",socket=>{
 socket.on("join",({room,name})=>{
  room=String(room||"geral").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32)||"geral";
  name=String(name||"Visitante").slice(0,24);
  socket.data.room=room;socket.data.name=name;
  if(!rooms.has(room))rooms.set(room,new Map());
  const r=rooms.get(room);
  r.set(socket.id,{id:socket.id,name});
  socket.join(room);
  socket.emit("room-users",roomUsers(room));
  socket.to(room).emit("user-joined",{id:socket.id,name});
  if(calls.has(room))socket.emit("call-host",calls.get(room));
 });
 socket.on("chat",({room,text})=>{
  if(room!==socket.data.room)return;
  const clean=String(text||"").trim().slice(0,1000);if(!clean)return;
  io.to(room).emit("chat",{name:socket.data.name,text:clean,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})});
 });
 socket.on("call-start",({room})=>{
  if(room!==socket.data.room)return;
  if(!calls.has(room)){calls.set(room,socket.id);io.to(room).emit("call-host",socket.id);io.to(room).emit("system",socket.data.name+" criou uma call.");broadcastUsers(room)}
 });
 socket.on("call-ready",({room})=>{if(room===socket.data.room)socket.to(room).emit("system",socket.data.name+" está na call.")});
 socket.on("host-mute",({to,name,room})=>{
  if(room!==socket.data.room||calls.get(room)!==socket.id||!validMember(socket,to))return;
  io.to(to).emit("participant-muted",{id:to,name});
  socket.to(room).emit("system",socket.data.name+" silenciou "+name+".");
 });
 socket.on("host-kick",({to,name,room})=>{
  if(room!==socket.data.room||calls.get(room)!==socket.id||!validMember(socket,to))return;
  io.to(to).emit("call-removed");
  io.to(to).emit("system","Você foi removido da chamada.");
  io.to(room).emit("system",socket.data.name+" removeu "+name+" da call.");
  io.sockets.sockets.get(to)?.leave(room);
  const r=rooms.get(room);if(r)r.delete(to);
  io.to(room).emit("user-left",{id:to,name});
  broadcastUsers(room);
 });
 socket.on("call-end",({room})=>{
  if(room!==socket.data.room||calls.get(room)!==socket.id)return;
  calls.delete(room);io.to(room).emit("call-ended");io.to(room).emit("system",socket.data.name+" encerrou a call.");broadcastUsers(room);
 });
 socket.on("signal",({to,data})=>{if(to)io.to(to).emit("signal",{from:socket.id,data})});
 socket.on("disconnect",()=>{
  const room=socket.data.room;if(!room)return;
  const r=rooms.get(room);if(!r)return;
  const wasHost=calls.get(room)===socket.id;
  r.delete(socket.id);
  if(wasHost){
    calls.delete(room);io.to(room).emit("call-ended");
    const next=[...r.values()][0];
    if(next){io.to(room).emit("call-host",next.id);calls.set(room,next.id)}
  }
  socket.to(room).emit("user-left",{id:socket.id,name:socket.data.name});
  broadcastUsers(room);
  if(!r.size){rooms.delete(room);calls.delete(room)}
 });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log("Conversa Live server na porta "+PORT));
