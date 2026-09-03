
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
const callMutes=new Map();
const callReady=new Map();

function roomUsers(room){
  const r=rooms.get(room);
  return r?[...r.values()].map(x=>({
    id:x.id,name:x.name,host:x.id===calls.get(room)
  })):[];
}
function broadcastUsers(room){io.to(room).emit("room-users",roomUsers(room));}
function validMember(socket,id){
  const room=socket.data.room,r=rooms.get(room);
  return !!r&&r.has(id);
}
function readySet(room){
  if(!callReady.has(room))callReady.set(room,new Set());
  return callReady.get(room);
}
function cleanupReady(room,id){
  const s=callReady.get(room);
  if(!s)return;
  s.delete(id);
  if(!s.size)callReady.delete(room);
}

io.on("connection",socket=>{
  socket.on("join",({room,name})=>{
    room=String(room||"geral").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,32)||"geral";
    name=String(name||"Visitante").slice(0,24);

    socket.data.room=room;
    socket.data.name=name;

    if(!rooms.has(room))rooms.set(room,new Map());
    const r=rooms.get(room);
    r.set(socket.id,{id:socket.id,name});

    socket.join(room);
    socket.emit("room-users",roomUsers(room));
    socket.to(room).emit("user-joined",{id:socket.id,name});

    if(calls.has(room)){
      const host=calls.get(room);
      socket.emit("call-host",host);
      socket.emit("call-state",{active:true,host,ready:[...readySet(room)]});
    }else{
      socket.emit("call-state",{active:false,host:null,ready:[]});
    }
  });

  socket.on("chat",({room,text})=>{
    if(room!==socket.data.room)return;
    const clean=String(text||"").trim().slice(0,1000);
    if(!clean)return;
    io.to(room).emit("chat",{
      name:socket.data.name,text:clean,
      time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
    });
  });

  socket.on("call-start",({room})=>{
    if(room!==socket.data.room)return;
    if(!calls.has(room)){
      calls.set(room,socket.id);
      readySet(room).add(socket.id);
      io.to(room).emit("call-host",socket.id);
      io.to(room).emit("system",socket.data.name+" criou uma call.");
      broadcastUsers(room);
    }
    // Sempre devolve o host atual ao solicitante. Isso é importante quando
    // alguém entra numa call existente antes de receber o evento call-host.
    socket.emit("call-host",calls.get(room));
    socket.emit("call-state",{active:true,host:calls.get(room),ready:[...readySet(room)]});
  });

  socket.on("call-ready",({room})=>{
    if(room!==socket.data.room||!calls.has(room))return;
    const set=readySet(room);
    set.add(socket.id);
    const host=calls.get(room);
    socket.emit("call-host",host);

    const others=[...set].filter(id=>id!==socket.id&&validMember(socket,id));
    socket.emit("call-ready-users",others);

    if(host&&host!==socket.id){
      io.to(host).emit("call-participant-ready",{
        id:socket.id,name:socket.data.name
      });
    }
  });

  socket.on("call-ready-request",({room})=>{
    if(room!==socket.data.room||calls.get(room)!==socket.id)return;
    const ids=[...readySet(room)].filter(id=>id!==socket.id&&validMember(socket,id));
    socket.emit("call-ready-users",ids);
  });

  socket.on("call-leave",({room})=>{
    if(room!==socket.data.room)return;
    cleanupReady(room,socket.id);
    socket.to(room).emit("call-participant-left",{id:socket.id});
  });

  socket.on("host-mute",({to,name,room,muted})=>{
    if(room!==socket.data.room||calls.get(room)!==socket.id||!validMember(socket,to))return;
    const key=room+":"+to;
    if(muted)callMutes.set(key,true);else callMutes.delete(key);
    io.to(to).emit("participant-muted",{id:to,name,muted});
    socket.to(room).emit("system",socket.data.name+(muted?" silenciou ":" liberou o microfone de ")+name+".");
  });

  socket.on("host-kick",({to,name,room})=>{
    if(room!==socket.data.room||calls.get(room)!==socket.id||!validMember(socket,to))return;
    cleanupReady(room,to);
    io.to(to).emit("call-removed");
    io.to(room).emit("system",socket.data.name+" removeu "+name+" da call.");
    // Remove apenas da call: a pessoa continua no chat.
    io.to(room).emit("call-participant-left",{id:to});
  });

  socket.on("call-end",({room})=>{
    if(room!==socket.data.room||calls.get(room)!==socket.id)return;
    calls.delete(room);
    callReady.delete(room);
    for(const k of callMutes.keys())if(k.startsWith(room+":"))callMutes.delete(k);
    io.to(room).emit("call-ended");
    io.to(room).emit("call-state",{active:false,host:null,ready:[]});
    io.to(room).emit("system",socket.data.name+" encerrou a call.");
    broadcastUsers(room);
  });

  socket.on("signal",({to,data})=>{
    if(!to||roomOf(to)!==socket.data.room)return;
    const ready=callReady.get(socket.data.room);
    if(!ready?.has(socket.id)||!ready.has(to))return;
    io.to(to).emit("signal",{from:socket.id,data});
  });

  function roomOf(id){
    const s=io.sockets.sockets.get(id);
    return s?.data?.room;
  }

  socket.on("disconnect",()=>{
    const room=socket.data.room;
    if(!room)return;
    const r=rooms.get(room);
    if(!r)return;

    const wasHost=calls.get(room)===socket.id;
    cleanupReady(room,socket.id);
    r.delete(socket.id);

    if(wasHost){
      calls.delete(room);
      const next=[...r.values()][0];
      if(next){
        calls.set(room,next.id);
        // O novo criador só fica pronto se já estiver na call.
        // Como o servidor não conhece a interface local, mantemos o estado
        // pronto apenas se o participante já estava marcado como ready.
        const nextWasReady=callReady.get(room)?.has(next.id);
        if(nextWasReady) readySet(room).add(next.id);
        io.to(room).emit("call-host",next.id);
        io.to(room).emit("call-state",{active:true,host:next.id,ready:[...readySet(room)]});
      }else{
        callReady.delete(room);
        io.to(room).emit("call-ended");
        io.to(room).emit("call-state",{active:false,host:null,ready:[]});
      }
    }

    socket.to(room).emit("user-left",{id:socket.id,name:socket.data.name});
    socket.to(room).emit("call-participant-left",{id:socket.id});
    broadcastUsers(room);

    if(!r.size){
      rooms.delete(room);calls.delete(room);callReady.delete(room);
      for(const k of callMutes.keys())if(k.startsWith(room+":"))callMutes.delete(k);
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log("Conversa Live server na porta "+PORT));
