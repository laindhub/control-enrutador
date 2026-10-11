# Más Dueños · Salón Android 1.2.4 (fuente preparada)

Android 8.0 o posterior. Esta versión conserva el salón completo y su barra **Puestos / Hoy / Yo**. No hay una barra nativa superior ni se reemplaza **Yo** por otra pantalla.

## Uso

1. Cuando esté disponible el instalador `masduenos-salon-1.2.4.apk` **firmado con la misma clave del 1.2.0**, instalalo sobre la versión anterior. Mantiene el mismo paquete y usa `versionCode=11`.
2. Entrá al salón con tu cuenta habitual.
3. **Yo** abre la página original `/floor/activity`, con sus pasos, derivaciones y conversiones. **Leads / Ventas** ahora permanece en una barra compacta de 44 px justo debajo del encabezado de Salón. El panel de métricas aparece antes del historial **«lo que hice»**, incluso cuando crecen las derivaciones.
4. **Mis ventas y comisiones** aparece antes del historial original, con Ventas, Carpetas, Pagos y Gestión según el rol. Registrar y editar ventas, vincular visitas y registrar pagos utiliza las mismas APIs y permisos del panel web.
5. Si todavía no conectaste tu cuenta propia, tocá **Conectar mis ventas**. El login se abre temporalmente a pantalla completa; al terminar vuelve automáticamente a la actividad original y carga la sección de ventas. El botón Atrás permite cancelar y volver al salón.

Las cuentas de ambos servicios siguen siendo independientes. La app no conoce ni comparte contraseñas. Las cookies persisten según la vigencia de cada servidor. iPhone continúa usando la web.

## Integración

El script local `salon-navigation.js` añade una sección únicamente en `/floor/activity`. Conserva los elementos originales y sus manejadores de navegación. Observa los cambios de una SPA, inserta una sola sección y la quita al salir de actividad.

La sección contiene un iframe de **nuestro** `/presentador/integrado`. Ese endpoint autoriza como antecesor únicamente el origen exacto del salón y el propio dominio; el resto del sitio conserva sus restricciones de marcos. El modo integrado oculta el encabezado y la barra inferior del panel propio, y convierte Ventas/Carpetas/Pagos en pestañas dentro de la sección. La altura se ajusta con `postMessage`, validando origen y ventana emisora.

Al conectar explícitamente la cuenta (`/presentador?salon=1`), su cookie pasa a `SameSite=None; Secure` para funcionar dentro del salón. Las sesiones web ordinarias conservan su política actual. Android permite cookies de terceros en la vista del salón para este iframe. Se mantienen la autenticación, la separación por cuenta y la comprobación CSRF de todas las modificaciones.

No se usa proxy del salón, un puente nativo de JavaScript, extracción de contraseñas ni eliminación de sus cabeceras. La app necesita internet y no guarda operaciones offline. Los fallos de carga se reintentan sin reenviar formularios.

## Compilar

Java 17 y Android SDK 35, sin bibliotecas externas de Android:

```sh
sdkmanager 'platforms;android-35' 'build-tools;35.0.0'
ANDROID_SDK_ROOT=/ruta/al/sdk MASDUENOS_DEBUG_KEYSTORE=/ruta/privada/clave.keystore bash android/build-apk.sh
```

Resultado: `android/dist/masduenos-salon-1.2.4.apk`. La clave de firma de prueba se conserva fuera del repositorio; debe reutilizarse para actualizar instalaciones anteriores. No subirla a GitHub. También se puede abrir `android/` en Android Studio (Gradle 8.11.1 / plugin 8.9.2).

El instalador público de `public/assets/android/masduenos-salon-1.2.0.apk` continúa siendo la versión original. La APK 1.2.2 fue reconstruida y firmada con el keystore original fuera del repositorio; se entrega como archivo adjunto y no se publica la clave. El nuevo navegador de pestañas se posiciona con la altura medida del encabezado y conserva un espaciador en el flujo para no cubrir los datos del CRM.

La sesión se prepara antes de cargar el iframe y mantiene `SameSite=None` también después del login y las peticiones de datos. Las ventas no esperan a la importación de fichas.

Los diálogos ocupan el viewport del salón, por encima de su encabezado y navegación. Al cerrar se restaura la sección sin recargarla. Atrás cierra primero el diálogo.

Transiciones de apertura y cierre de diálogos; se elimina el destello táctil azul en el salón y en ventas, conservando foco de teclado y selección en campos de texto.

## Ícono de inicio (1.2.3)

El ícono de Android reproduce el favicon del Seguimiento de Asesores: isotipo blanco sobre fondo negro, con el mismo trazado original de `public/assets/mas-duenos-isotipo.svg` y `public/assets/favicon.png`. Se centra a mayor escala para el lanzador. La clave de firma permanece fuera del repositorio; instalar la 1.2.3 sobre la 1.2.2 conserva la aplicación y las sesiones.

## Favicon exacto (1.2.4)

El ícono Android usa el archivo PNG **idéntico** a `public/assets/favicon.png` del sitio `/demo`, ubicado como `android/app/src/main/res/drawable/app_icon.png` y referenciado desde el manifest como `@drawable/app_icon`. Se quitó el vector recreado y su fondo añadido. El instalador de 1.2.4 debe compilarse y firmarse con la clave original antes de distribuirse; cambiar el recurso GitHub no actualiza el ícono en dispositivos ya instalados.
