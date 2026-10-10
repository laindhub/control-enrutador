self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// No guardar datos de clientes ni páginas autenticadas en caché.
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mis ventas</title><body style="font:18px system-ui;padding:32px;background:#f4f6fa;color:#172031"><h1>Estás sin conexión</h1><p>Conectate a internet para consultar o guardar tus ventas.</p><button onclick="location.reload()">Volver a intentar</button></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
