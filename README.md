# Control Enrutador

Webapp interna para llevar el conteo de personas o grupos que se sientan con los asesores de Más Dueños, sucursal Liniers.

## Funciones incluidas

- Cuenta compartida de enrutadores con selección de la persona que está operando.
- Cuenta administrativa independiente.
- Contador diario por asesor, ordenado de menor a mayor.
- Asesores visibles solamente durante su horario programado.
- Confirmación antes de sumar y advertencia adicional si hubo otra carga en los últimos 3 minutos.
- Modo edición que habilita la corrección mediante el botón `−`.
- Registro de quién creó y quién corrigió cada atención.
- Sincronización entre celulares mediante Socket.IO long-polling, compatible con Hostinger Web/Cloud.
- Aviso de prioridad cuando la diferencia alcanza 3 atenciones.
- Gestión de asesores y enrutadores desde el panel de administración.
- Cronograma semanal con horarios habituales o personalizados.
- Panel con totales, promedios, actividad por hora, diferencias y correcciones.
- Filtros rápidos y rangos personalizados.
- Exportación `.xlsx` con resumen, detalle, enrutadores y correcciones.
- Retención automática de registros durante un año.
- Entorno alfa demo completamente aislado, con perfiles de administración, enrutadores y asesores.
- Seguimiento ficticio por Charla 1/2, potabilidad, recomendación, derivación y confirmación en tiempo real.

## Tecnología

- Node.js 20–24
- Express 5
- MySQL 8 / MariaDB
- EJS y JavaScript sin framework de frontend
- Socket.IO configurado exclusivamente con HTTP long-polling

## Variables de entorno

Copiar los nombres de `.env.example` en el panel de variables de entorno de Hostinger. No subir un archivo `.env` al repositorio.

| Variable | Uso |
|---|---|
| `NODE_ENV` | Usar `production` en Hostinger |
| `PORT` | Hostinger suele asignarla automáticamente; el valor local es `3000` |
| `APP_TIMEZONE` | `America/Argentina/Buenos_Aires` |
| `SESSION_SECRET` | Valor aleatorio de al menos 32 caracteres |
| `DB_HOST` | Host de MySQL, normalmente `localhost` en Hostinger |
| `DB_PORT` | `3306` |
| `DB_USER` | Usuario de la base de datos |
| `DB_PASSWORD` | Contraseña de la base de datos |
| `DB_NAME` | Nombre de la base de datos |
| `DB_SSL` | `false` para MySQL local de Hostinger |
| `ROUTER_USERNAME` | Usuario compartido inicial de enrutadores |
| `ROUTER_PASSWORD` | Contraseña inicial de enrutadores |
| `ADMIN_USERNAME` | Usuario administrativo inicial |
| `ADMIN_PASSWORD` | Contraseña administrativa inicial |
| `DEMO_USERNAME` | Usuario opcional de la demo alfa; si falta, la demo queda deshabilitada |
| `DEMO_PASSWORD` | Contraseña opcional de la demo alfa |
| `GROQ_API_KEY` | Clave de Groq para generar mensajes con Qwen; nunca debe subirse al repositorio |
| `GROQ_MODEL` | Modelo de Groq; valor inicial `qwen/qwen3.6-27b` |
| `ALPHA_PRODUCTION_ENABLED` | Mantener `false` mientras el circuito alfa sea solamente demo |
| `ADVISOR_USERNAME` | Usuario futuro de la cuenta compartida de asesores |
| `ADVISOR_PASSWORD` | Contraseña futura de asesores |

Las variables de las cuentas se leen al iniciar y las contraseñas se guardan como hashes bcrypt. Nunca se guardan en el repositorio. La cuenta demo solamente se habilita cuando existen tanto `DEMO_USERNAME` como `DEMO_PASSWORD`; desde ella se puede acceder a Enrutadores, Asesores, Administración y Seguimiento. Su información operativa es ficticia, vive separada de las tablas productivas y se restaura al reiniciar la instancia. Si `GROQ_API_KEY` está vacío, Seguimiento utiliza respuestas locales de muestra para que la presentación siga funcionando.

## Demo de seguimiento

El perfil **Seguimiento** combina tres superficies en una misma pantalla:

- bandeja de oportunidades;
- conversación móvil inspirada en WhatsApp;
- ficha del asesor con nivel de interés y notas automáticas.

Al registrar un lead, se programa un primer contacto desde la identidad del asesor. El mensaje muestra un edificio genérico de demostración, abre su ubicación en Google Maps y propone coordinar una visita. Cada mensaje enviado o recibido crea una nota dentro de la misma oportunidad. Cuando la conversación contiene señales concretas de visita o avance, el sistema recomienda la intervención personal del asesor.

La pantalla es un simulador interno: no se conecta con WhatsApp ni envía mensajes a números reales.

## Despliegue en Hostinger

1. En hPanel, abrir **Bases de datos → MySQL** y crear una base, un usuario y una contraseña.
2. Ir a **Sitios web → Añadir sitio web → Deploy Web App**.
3. Elegir **Import Git Repository** y seleccionar `laindhub/control-enrutador`.
4. Seleccionar **Express.js** y Node.js `24.x`.
5. No se requiere comando de compilación. El inicio es `npm start` y el archivo de entrada es `src/server.js`.
6. Cargar todas las variables de la tabla anterior en **Environment Variables**.
7. Asociar el sitio con `masduenos.laind.io` y habilitar SSL.
8. Desplegar. En el primer inicio, la app crea automáticamente las tablas y las dos cuentas de acceso definidas por variables de entorno.
9. Abrir `https://masduenos.laind.io/health`; debe responder con `{"ok":true,"service":"control-enrutador"}`.
10. Ingresar primero como administrador, cargar los asesores y enrutadores en **Personal**, y luego definir la semana activa en **Horarios**.

Guías oficiales utilizadas:

- [Desplegar una aplicación Node.js en Hostinger](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Conectar MySQL con una aplicación Node.js](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)
- [Compatibilidad de WebSockets en Hostinger](https://www.hostinger.com/support/which-web-standards-and-connectivity-features-are-supported-at-hostinger/)

## Desarrollo local

```bash
npm install
cp .env.example .env
npm run dev
```

Se necesita una base MySQL local creada previamente. Las tablas se crean en el primer inicio.

## Verificación

```bash
npm test
npm run check
npm audit --omit=dev
```

## Operación semanal

Cada domingo, el supervisor abre **Horarios**, selecciona la nueva semana, puede copiar la anterior y adapta las celdas según la imagen enviada por WhatsApp. `LIBRE` y `ACADEMIA` se representan como **No trabaja**.

Los cambios de personal y de horarios quedan registrados en la auditoría. Las atenciones corregidas no se borran físicamente: se marcan como anuladas y permanecen disponibles para el supervisor y el Excel.

## Sincronización de leads externos (opcional)

El worker lee exclusivamente la lista visible de `/floor/visits` y sus fichas.
No crea ni modifica movimientos en el sistema externo. Este sitio usa acciones
Next.js para el acceso; el conector utiliza Playwright y Chromium, sin fijar
identificadores internos de acciones que cambian en cada despliegue.

### Preparación en el alojamiento

1. Verificar que el entorno permita ejecutar Chromium y sus bibliotecas del sistema.
   El soporte de Node.js por sí solo no garantiza esta capacidad. En un entorno
   compatible, instalarlo con `npx playwright install chromium`. Si ya está instalado,
   configurar `LEAD_SYNC_CHROMIUM_PATH` con su ruta. No desactivar su sandbox.
2. Configurar `LEAD_SYNC_ACCOUNT_NAME` con el nombre completo de la cuenta y
   `LEAD_SYNC_PIN` con su PIN existente, exclusivamente en variables de entorno.
3. Ejecutar `npm run sync:leads` antes de habilitar la ejecución periódica.
4. Comprobar `lead_sync_state` y `external_lead_visits` en MySQL. Solo después de
   verificar una ejecución real exitosa, activar `LEAD_SYNC_ENABLED=true` y reiniciar.

El worker arranca junto al servidor una vez lista la base. Corre cada 15 minutos
(ajustable con `LEAD_SYNC_INTERVAL_MINUTES`, mínimo 5) y usa un bloqueo MySQL para
impedir ejecuciones simultáneas. Un cron puede ejecutar `npm run sync:leads` como
alternativa; no es necesario usar ambos mecanismos.

La sesión externa permanece en memoria: no se exporta la sesión del usuario ni se
crean archivos de cookies. Si caduca, el worker vuelve a entrar con sus variables.
Un intento de PIN que no confirma el acceso suspende la autenticación hasta
reiniciar, para evitar intentos repetidos y bloqueos. No se imprimen PIN, cookies,
nombres, teléfonos ni errores completos del navegador.

Cada visita conserva su ID original, fecha, resumen, teléfono normalizado,
asesor, promotor y ficha completa con preguntas y recorrido. Las fichas se leen
por lotes de 30 (`LEAD_SYNC_DETAIL_BATCH`) con un segundo entre lecturas y se
refrescan después de 60 minutos (`LEAD_SYNC_DETAIL_REFRESH_MINUTES`). Al haber
muchas visitas, completar todas las fichas requiere varios ciclos. La lista debe
coincidir con la cantidad de personas que muestra el sitio; de lo contrario se
rechaza ese ciclo para no guardar una lectura incompleta. Cambios en el diseño o
paginación del sitio requieren revisar el conector.

`lead_sync_state` conserva último intento, última ejecución exitosa, error general
y cantidades leídas. Los registros externos no se borran por desaparecer de la
lista diaria y no se consideran ventas: la venta viene del anuncio pegado. Estas
tablas contienen datos personales; no exponerlas mediante una API pública.

El worker periódico toma el día actual. El panel de presentadores vincula las
ventas a las visitas que ya se hayan sincronizado y conservado. La búsqueda
histórica directamente en el sitio externo sigue pendiente de integrar.

## Panel de presentadores

La misma pantalla de login envía las cuentas `presenter` y `presenter_admin`
a `/presentador`. Cada cuenta accede solamente a sus ventas y transferencias.
La cuenta inicial con administración se crea al arrancar con estas variables:

- `PRESENTER_ADMIN_USERNAME`: usuario exclusivo para este panel.
- `PRESENTER_ADMIN_PASSWORD`: contraseña opcional; puede quedar vacía.

El usuario es opcional para mantener compatible el acceso anterior. Si se
configura el usuario y se deja vacía u omite la contraseña, se ingresa solo con
el usuario. Las cuentas nuevas también aceptan contraseña corta o vacía. No reutilizar `ADMIN_USERNAME`: el acceso
administrativo del enrutador conserva su función. Las contraseñas iniciales se
sincronizan desde el entorno y se guardan con bcrypt. Desde Administración de
presentadores se crean o desactivan las otras cuentas y se define una comisión
común con fecha de vigencia. El valor inicial es ARS 32.000; las ventas guardadas
conservan su comisión al cambiar tarifas o editar sus datos.

Una nueva venta requiere seleccionar la fecha del anuncio y admite pegar texto
para extracción con `GROQ_API_KEY` y `GROQ_MODEL` ya existentes. La función de
extracción es independiente de Seguimiento, no usa sus prompts ni genera mensajes
para clientes. El resultado siempre se revisa antes de guardar. Si Groq falla o
no tiene clave, se pueden completar los datos manualmente. El teléfono permite
buscar coincidencias en las fichas que el sincronizador haya guardado; no es
necesario que exista una ficha para registrar una venta.

Las carpetas van de jueves a miércoles. El jueves/viernes de pago esperado son
14/15 días después del jueves inicial: carpeta 1–7 de octubre → pago 15/16 de
octubre. Las transferencias se asignan a una carpeta y pueden ser parciales. El
resumen mensual cuenta ventas por fecha de anuncio y dinero recibido por fecha
de transferencia; el saldo total compara todas las carpetas. Eliminaciones son
lógicas y quedan fuera de los cálculos. Los datos se guardan en MySQL, no solo en
el dispositivo. Los respaldos físicos dependen del servicio MySQL del alojamiento.

El panel tiene manifiesto y service worker para instalarse como PWA en Android.
No almacena datos de clientes ni sesiones en caché; necesita conexión para leer
o guardar. Un mismo anuncio en una misma fecha no se puede cargar dos veces.
Las tablas de ventas y pagos no forman parte de la retención anual de atenciones.

### Sesiones persistentes

Las sesiones permanecen en `user_sessions` de MySQL y la cookie se renueva con
cada petición (400 días, límite de los navegadores modernos). Un redeploy no las
borra. Mantener el mismo `SESSION_SECRET`, base MySQL y dominio. Salir destruye
la sesión; desactivar una cuenta revoca su acceso. Borrar cookies o datos del
navegador, o superar el plazo sin abrir la app, requiere volver a ingresar.

### Chromium y aislamiento del sincronizador

La instalación normal de la web no descarga ni ejecuta Chromium. `npm run
sync:browser` queda como un comando explícito para preparar el servidor del
sincronizador. `npm run sync:leads` permite ejecutarlo por separado, con las
mismas variables MySQL, usuario y PIN del origen.

El proceso web solo inicia el sincronizador si `LEAD_SYNC_IN_WEB=true` además
de `LEAD_SYNC_ENABLED=true`. Mantener `LEAD_SYNC_IN_WEB` omitida o en false en
Hostinger hasta verificar que el alojamiento soporta Chromium y sus bibliotecas.
Los fallos de sincronización no deben afectar el despliegue ni los recursos de
la aplicación de ventas.
