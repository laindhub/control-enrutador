# Más Dueños · Salón para Android

Aplicación Android (8.0 o posterior) que abre el salón original de Liniers y el panel de ventas propio. La web para iPhone sigue funcionando como hasta ahora.

## Uso

1. Instalá el APK de prueba `masduenos-salon-1.0.0.apk`. Android pedirá habilitar la instalación desde el navegador o el gestor de archivos que estés usando.
2. Iniciá sesión en el salón con tu cuenta habitual.
3. Tocá **Yo** en la navegación original: se abre el panel de ventas de `masduenos.laind.io/presentador`. Iniciá sesión con tu cuenta de presentador la primera vez.
4. **Salón** vuelve a la misma vista del salón. **Mis ventas** permite entrar al panel aunque cambie la navegación del sitio original. Ambos conservan su sesión y navegación mientras la app permanece abierta; las cookies persisten al cerrarla, según la vigencia que determine cada servidor.
5. El botón de Android vuelve dentro de la página; desde ventas sin historial vuelve al salón. **↻** actualiza la vista actual.

Las cuentas de ambos servicios son independientes: no hay inicio de sesión único ni se comparten contraseñas. Cerrar sesión se hace dentro de cada sitio. La app necesita conexión; no guarda ventas offline. Ante fallos temporales al cargar una página, reintenta progresivamente al volver la red o al regresar a la app. No reenvía formularios automáticamente.

El instalador está en `public/assets/android/masduenos-salon-1.0.0.apk` dentro del repositorio. Después del despliegue web también queda disponible en `https://masduenos.laind.io/assets/assets/android/masduenos-salon-1.0.0.apk` (el primer `/assets` es la ruta estática del servidor y el segundo, la carpeta de recursos existente).

## Integración

Dos WebViews HTTPS conservan el sitio externo y el panel propio por separado. Un script local modifica solamente la acción del control de navegación **Yo** dentro de `/floor`. No cambia el flujo de recepción, pre-test, enrutamiento ni los datos del sitio externo. Funciona también con navegación SPA y botones recreados después del login.

No se utiliza `addJavascriptInterface`, proxy, lectura de credenciales, modificación de cookies entre dominios ni eliminación de restricciones del servidor. Enlaces externos iniciados por el usuario se abren en el navegador o la aplicación correspondiente. No se permiten HTTP, acceso a archivos locales ni contenido mixto.

Si Sistemas cambia el texto o estructura del control **Yo**, el botón nativo **Mis ventas** sigue disponible; puede ser necesario actualizar el pequeño script. La integración final del salón requiere comprobar en un dispositivo real con una cuenta autorizada; no se incluyen credenciales en el APK.

## Compilar

Proyecto Java sin bibliotecas externas, compatible con Android Studio y Android SDK 35.

Compilación sin Gradle, con Java 17 y las herramientas oficiales:

```sh
sdkmanager 'platforms;android-35' 'build-tools;35.0.0'
ANDROID_SDK_ROOT=/ruta/al/sdk bash android/build-apk.sh
```

El resultado queda en `android/dist/masduenos-salon-1.0.0.apk`. El script firma un APK de **prueba** y mantiene la clave fuera del repositorio en `~/.android/masduenos-salon-debug.keystore`. Conservá esa clave para firmar futuras actualizaciones; no está incluida en GitHub. Para distribución definitiva, crear y custodiar una clave de producción, incrementar `versionCode` y usar una compilación release.

También se puede abrir `android/` en Android Studio, sincronizar Gradle 8.11.1 con el plugin 8.9.2 y ejecutar `:app:assembleDebug`.

## Panel web

La recuperación automática del panel está en `public/js/presenter.js`: reintenta las lecturas ante fallos temporales, respeta `Retry-After`, mantiene los datos visibles y elimina el aviso cuando vuelve a conectar. Las altas, pagos, ediciones y eliminaciones se envían una sola vez. Este cambio requiere desplegar el código web en Hostinger; instalar el APK no actualiza el servidor.
