// URL pública do servidor Render (não coloque segredos aqui).
window.CONVERSA_VERSION = "1.6.18";
window.SIGNALING_URL = "https://conversa-live-server.onrender.com";

// TURN próprio (recomendado). O TURN público embutido no app.js usa
// credenciais de DEMONSTRAÇÃO da Open Relay Project — elas são compartilhadas
// publicamente por qualquer projeto que copie o tutorial deles, então ficam
// sobrecarregadas/instáveis. É exatamente isso que causa "entra na sala mas
// não ouve ninguém e não consegue compartilhar tela": a sinalização (Socket.IO)
// funciona, mas a mídia (que depende de um TURN de verdade quando alguém está
// atrás de NAT simétrico — comum em 4G/5G, muitos roteadores residenciais e
// redes corporativas) não consegue passar.
//
// Para resolver de vez, crie sua própria conta TURN gratuita e cole as
// credenciais aqui (o app.js já lê window.TURN_SERVERS automaticamente):
//   1. Metered.ca / Open Relay: https://www.metered.ca/tools/openrelay (free tier)
//   2. Cloudflare Calls TURN: https://speed.cloudflare.com/turn-creds
//   3. ExpressTURN: https://www.expressturn.com (free tier, 1GB/mês)
//
// Exemplo (descomente e preencha com suas credenciais reais):
// window.TURN_SERVERS = [
//   { urls: "turn:SEU-HOST-AQUI:80", username: "SEU-USUARIO", credential: "SUA-SENHA" },
//   { urls: "turn:SEU-HOST-AQUI:443?transport=tcp", username: "SEU-USUARIO", credential: "SUA-SENHA" }
// ];
