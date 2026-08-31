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

Las cuatro variables de las cuentas se leen durante el primer inicio y las contraseñas se guardan como hashes bcrypt. Nunca se guardan en el repositorio.

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
