// Public diagnostics use an allowlist: never return arbitrary driver messages,
// SQL statements, credentials or environment values.
const safeConfigMessages = new Map([
  ['Configurá PRESENTER_ADMIN_USERNAME y PRESENTER_ADMIN_PASSWORD juntos.', 'CONFIG_PRESENTER_ADMIN_PAIR'],
  ['PRESENTER_ADMIN_PASSWORD debe contener entre 12 y 72 caracteres.', 'CONFIG_PRESENTER_ADMIN_PASSWORD'],
  ['Los usuarios configurados deben tener nombres distintos.', 'CONFIG_USERNAME_CONFLICT'],
  ['El usuario administrador de presentadores ya existe con otro rol.', 'CONFIG_PRESENTER_ADMIN_CONFLICT'],
]);
const configPrefixes = {
  'Faltan variables de entorno obligatorias:': 'CONFIG_MISSING',
  SESSION_SECRET: 'CONFIG_SESSION_SECRET',
  ROUTER_PASSWORD: 'CONFIG_ROUTER_PASSWORD',
  ADMIN_PASSWORD: 'CONFIG_ADMIN_PASSWORD',
};
const mysqlMessages = {
  ER_ACCESS_DENIED_ERROR: 'MySQL rechazó el usuario o la contraseña configurados.',
  ER_BAD_DB_ERROR: 'La base indicada en DB_NAME no existe o no es accesible.',
  ECONNREFUSED: 'No se pudo conectar con MySQL en DB_HOST/DB_PORT.',
  ENOTFOUND: 'No se pudo resolver el host configurado en DB_HOST.',
  ETIMEDOUT: 'La conexión con MySQL agotó el tiempo de espera.',
  ER_CANT_CREATE_TABLE: 'No se pudo crear una tabla durante la migración. Revisá el detalle en los logs del despliegue.',
  ER_TABLEACCESS_DENIED_ERROR: 'El usuario MySQL no tiene permisos para la migración de tablas.',
};
export function publicStartupError(error) {
  const message = String(error?.message || 'Error desconocido');
  if (safeConfigMessages.has(message)) return {code:safeConfigMessages.get(message),message};
  for (const [prefix,code] of Object.entries(configPrefixes)) {
    if (message.startsWith(prefix)) return {code,message};
  }
  return {
    code:String(error?.code || 'STARTUP_FAILED'),
    message:mysqlMessages[error?.code] || 'Falló la inicialización. Revisá los logs del despliegue para conocer la causa.',
  };
}
