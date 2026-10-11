# Más Dueños · Salón Android 1.1

Android 8.0 o posterior. Esta versión conserva el salón completo y su barra **Puestos / Hoy / Yo**. No hay una barra nativa superior ni se reemplaza **Yo** por otra pantalla.

## Uso

1. Instalá `masduenos-salon-1.1.0.apk` sobre la versión anterior. Se mantiene el mismo paquete y firma, con `versionCode=2`.
2. Entrá al salón con tu cuenta habitual.
3. **Yo** abre la página original `/floor/activity`, con sus pasos, derivaciones, conversiones y actividad.
4. Debajo aparece **Mis ventas y comisiones**, con Ventas, Carpetas, Pagos y Gestión según el rol. Registrar y editar ventas, vincular visitas y registrar pagos utiliza las mismas APIs y permisos del panel web.
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

Resultado: `android/dist/masduenos-salon-1.1.0.apk`. La clave de firma de prueba se conserva fuera del repositorio; debe reutilizarse para actualizar instalaciones anteriores. No subirla a GitHub. También se puede abrir `android/` en Android Studio (Gradle 8.11.1 / plugin 8.9.2).

Instalador publicado en `public/assets/android/masduenos-salon-1.1.0.apk`. Los cambios web de esta versión deben desplegarse junto con el APK.
