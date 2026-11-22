// Service worker mínimo: só habilita instalação como PWA. Não faz cache de dados (dados sensíveis).
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',()=>{});
