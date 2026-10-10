export function leadSyncError(error, stage) {
 const message=String(error?.message||'');
 if(error?.code==='LEAD_AUTH_PAUSED')return 'Acceso no confirmado. Se suspendieron los intentos de PIN hasta reiniciar.';
 if(error?.code==='ERR_MODULE_NOT_FOUND')return 'Falta instalar Playwright en el despliegue.';
 if(stage==='browser'){
  if(/executable doesn't exist|executable.*not found|ENOENT/i.test(message))return 'Chromium no está instalado. Ejecutá npm run sync:browser en el build y redesplegá.';
  if(/shared libraries|cannot open shared object|missing dependencies|Host system is missing/i.test(message))return 'Chromium está instalado, pero faltan bibliotecas del sistema en Hostinger. Revisá los logs o usá un servidor compatible con Playwright.';
  return 'Chromium no pudo arrancar en el servidor. Revisá LEAD_SYNC_CHROMIUM_PATH y la compatibilidad del alojamiento.';
 }
 if(stage==='login')return 'No se pudo acceder al sitio de origen. Revisá el usuario configurado, la conexión y si cambió la pantalla de acceso.';
 if(stage==='list')return 'No se pudo leer la lista de visitas. La página no cargó completa o cambió su estructura.';
 if(stage==='detail')return 'No se pudo leer una ficha de visita. La página no cargó completa o cambió su estructura.';
 if(stage==='database')return 'No se pudo preparar o guardar la sincronización en MySQL. Revisá conexión y permisos de tablas.';
 return 'No se pudo sincronizar. Revisá la configuración del sincronizador.';
}
