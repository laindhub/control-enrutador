# Más Dueños Respaldo — fase online

## Alcance

Ruta prevista: `https://masduenos.laind.io/respaldo`.

Módulo aislado de Salón Más Dueños: recepción, pre-test, full-test (cinco capítulos), enrutación, confirmación de conversión (solo «se sentó» / «no se sentó»), administración de usuarios y CRM interno para consulta/carga MANUAL.

NO envía datos al CRM privado de la empresa. Ningún endpoint de esta implementación lo llama, ni se importa ninguna integración de leads del proyecto existente. Administración consulta un lead y, por fuera de esta app, lo introduce manualmente en el sistema empresarial; marca luego «cargado», «pendiente» o «no cargar».

## Base de datos

Requiere una base MySQL exclusiva, un usuario MySQL exclusivo y las variables siguientes en Hostinger:

- `RESPALDO_DB_HOST`
- `RESPALDO_DB_PORT` (opcional, predeterminado 3306)
- `RESPALDO_DB_USER`
- `RESPALDO_DB_PASSWORD`
- `RESPALDO_DB_NAME`
- `RESPALDO_DB_SSL` (opcional; `true` para un servidor que requiera TLS verificable)
- `RESPALDO_USERNAME` (usuario exclusivo del administrador, 3–160 caracteres)
- `RESPALDO_PASSWORD` (contraseña del administrador, entre 8 y 72 bytes)

Las credenciales administrativas provienen de las variables de Hostinger. Al reiniciar el proceso se actualiza la cuenta de administración; si cambian, se invalidan sus sesiones anteriores. El resto del personal utiliza cuentas de operador con PIN configuradas dentro del Respaldo.

Los nombres de tablas usan el prefijo `respaldo_` y se crean en esta base separada. No reutilizar `DB_NAME` ni el usuario principal. Las variables nunca deben subirse al repositorio.

Si faltan estas variables, **solo /respaldo/api** responde 503; las demás funciones existentes del sitio conservan su comportamiento. El Respaldo está integrado en la MISMA aplicación Node y el MISMO repositorio main, pero usa una base diferente. Una vez creadas las tablas, ingresá con RESPALDO_USERNAME / RESPALDO_PASSWORD y creá desde Administración una cuenta por cada operador con su puesto. Los PIN y la contraseña administrativa se guardan mediante bcrypt. Recomendación: usar PIN distintos de los del sistema de la empresa y no reutilizar el PIN de prueba compartido.


## Dos accesos, una misma aplicación

- **Personal del salón**: entra desde el botón «Entrar al sistema de respaldo» en la pantalla principal de `https://masduenos.laind.io/login`, que lleva a `/respaldo`. No existe formulario ni PIN: se elige el nombre en un listado igual al salón original, se obtiene una sesión operacional y se abre exclusivamente el puesto asignado.
- **Administración**: usa `RESPALDO_USERNAME` y `RESPALDO_PASSWORD` en el login principal. Entra a `/respaldo` con un panel propio (CRM, alta y edición del personal), sin pestañas operativas.
- **Permisos**: solamente la sesión administrativa tiene facultades para modificar personal, leer todas las fichas, exportar leads y marcar cargas manuales al CRM empresarial. El personal solo ve las visitas pertinentes a su puesto; el asesor solo puede indicar si se sentó.
- **Datos**: cada visita se registra en la base MySQL independiente; nunca se envían leads automáticamente al servidor original.

**Importante — acceso sin identificación comprobable:** elegir un nombre sin contraseña/PIN no autentica la identidad de esa persona. Como la URL es pública, terceros que la conozcan podrían seleccionar el nombre de un operador. Antes de almacenar datos personales reales hay que limitar el acceso operativo a una red corporativa/VPN o aplicar un control de acceso equivalente a nivel de infraestructura. El token de sesión protege contra modificaciones externas de otras páginas web, pero **no** sustituye una comprobación de identidad.

El CSS original extraído de Liniers está guardado en `public/respaldo/original.css`. Los componentes recreados usan las mismas variables y criterios visuales; los recursos WOFF2 de la instancia original no están incluidos.

## Rutas

- `/respaldo` — interfaz autónoma.
- `/respaldo/api/health` — comprueba solo la base del respaldo.
- `/respaldo/api/people` — listado de personas del salón, nunca Administración.
- `/respaldo/api/enter` — selección de nombre (sin PIN) y sesión operativa.
- `/respaldo/api/users` y `/api/users/:id` — gestión de personal, solo Administración.
- `/respaldo/api/me`, `/logout` — sesión y cierre.
- `/respaldo/api/visits` — consulta/ingreso de visitas.
- `/respaldo/api/visits/:id/pretest` — cuestionario inicial.
- `/respaldo/api/visits/:id/fulltest` — guardado por capítulos y finalización.
- `/respaldo/api/visits/:id/route` — charla y asignación.
- `/respaldo/api/visits/:id/conversion` — registro de si se sentó.
- `/respaldo/api/visits/:id/crm` — estado manual de carga empresarial, solo Administración.
- `/respaldo/api/export` — exportación JSON completa, solo Administración.

Los cambios se auditan en `respaldo_audit`. Las operaciones no transfieren datos al servidor original.

## Independencia del sistema existente

`src/server.js` monta el módulo antes de su middleware de sesiones y antes de su bloqueo por fallos de la base de datos principal. Este diseño permite usar el respaldo online si el CRM de la empresa está caído o el esquema principal de Salón Más Dueños no inicializa, siempre que la instancia Node siga ejecutándose y la nueva base MySQL esté disponible.

## Futuro modo Windows 11 (NO configurado ni desplegado)

La lógica de la interfaz/API está separada de `src/respaldo/storage.js`, que utiliza MySQL online. Para modo local deberá implementarse un adaptador SQLite con el mismo contrato, un instalador/arranque de servicio Windows, una ruta o IP local estable, backups locales y una cola de eventos idempotentes para sincronizar de local hacia nuestro servidor online. La conmutación Wi-Fi, DHCP/DNS, certificados y comportamiento del hotspot Windows sin Internet requieren pruebas físicas.

No se ha añadido ningún servicio local ni sincronización automática: esta fase es **solo online**.

## Antes de desplegar en producción

- Validar el recorrido completo con datos ficticios y roles reales.
- Completar los formularios condicionales y los catálogos de barrios/promotores contra las capturas y JS originales.
- Incorporar puntaje exacto e impresión del Test del Dueño; el cuestionario online actual guarda las respuestas, pero aún no presenta el PDF original.
- Comprobar de extremo a extremo los permisos y las transiciones con MySQL real.
- Completar las pruebas automatizadas de API y UI.
- Copiar/organizar las fuentes y el CSS original recuperado, en reemplazo del tema basado en tokens que contiene esta primera versión.
- Configurar respaldo de la base y cifrado/retención apropiados para los datos personales de los visitantes.

No mezclar los datos de la app original con los del Respaldo. No activar el deploy de esta rama sin validar estos pendientes.
