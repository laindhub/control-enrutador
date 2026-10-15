# Más Dueños · Android TV (app independiente)

Proyecto nativo separado de `android/` (Salón). APK de Android TV / Google TV,
Android 8.0 o superior (API 26). Paquete: `io.laind.masduenos.tv`.

## Funcionamiento

En el primer inicio, la app consulta
`https://masduenos.laind.io/tv/manifest.json` y descarga en almacenamiento
**privado de Android** los archivos `mas-duenos-liniers.pptx` e
`introduccion.mp4`. El manifiesto contiene el SHA-256 y tamaño reales de
ambos archivos en Hostinger. Los datos se verifican completos antes de
sustituir una copia anterior. La descarga parcial no se presenta como lista,
y si falla una actualización se conserva la última versión íntegra.

**Cómo actualizar:** reemplazar en Hostinger los archivos con los mismos nombres
en la carpeta `masduenos/`. La próxima vez que arranque la app o selecciones
«Buscar actualizaciones», detectará el cambio y descargará solamente el
archivo modificado. No hace falta reinstalar el APK.

La app muestra el progreso en megabytes de ambos recursos. El PPTX es
obligatorio para abrir la presentación; si la introducción todavía no existe
se puede presentar igualmente. Los datos se descargan una sola vez por
versión, no en cada apertura. El visor se carga desde HTML/JS incluido en
el APK, mientras el motor PPTX fijado a la versión `3.31.1` se importa
desde `esm.sh` (requiere internet cuando aún no esté en la caché WebView).

## Control remoto y teclado

- Pantalla inicial: D-pad para seleccionar «Abrir presentación» /
  «Buscar actualizaciones» y OK/Enter para activar.
- Al abrir, OK/Enter sobre «Iniciar presentación» empieza el pase.
- Diapositivas: izquierda/arriba/PageUp retroceden; derecha/abajo/PageDown
  avanzan. Al final continúa desde la primera.
- Diapositiva 1: OK/Enter o Tab abre `introduccion.mp4`.
- Video introductorio: OK/Enter o Tab lo detienen; izquierda/arriba/PageUp
  retroceden 5 segundos; derecha/abajo/PageDown avanzan 5 segundos.
- En la diapositiva de Geraldine, la primera pulsación de avance reproduce
  el video desde su fotograma de espera. La siguiente pulsación avanza a
  la diapositiva posterior. El video no se reproduce al entrar ni se reinicia
  al actualizarse el visor.
- Atrás del control Android TV regresa al menú nativo; teclado Esc sale del
  modo presentación. Ni el cursor ni la barra de herramientas flotante
  aparecen durante la exposición.

Los archivos multimedia se sirven al WebView directamente desde el
almacenamiento privado, con soporte de solicitudes HTTP Range para MP4.
No se necesita un mouse ni acceder al sistema de archivos del TV.

## Compilación e instalación

En GitHub Actions, ejecutá «Build Android TV APK» desde la rama publicada
y descargá el artefacto `masduenos-android-tv-apk`. Contiene un APK
**debug firmado e instalable** para pruebas por sideload. Activá «Instalar
apps desconocidas» en el Android TV, transferí el APK e instalalo.

Un APK debug generado en otro runner puede tener una firma distinta y
no actualizarse sobre el anterior. Para distribuciones sucesivas reales
es necesario configurar una clave privada de firma estable; no debe
publicarse el keystore en GitHub.

Requisitos de compilación: Java 17, SDK Android 35, Gradle 8.12:

```sh
cd android-tv
gradle :app:assembleDebug
```

## Separación y seguridad

Los endpoints `/tv/*` leen **dos rutas fijas**, no aceptan nombres
arbitrarios. El PPTX de escritorio conserva su SHA-256 fijo; la app de TV
consulta un manifiesto dinámico específico para ella. El código no toca
clientes, ventas ni datos del Salón y no requiere iniciar sesión.


## Corrección de pantalla de carga de Android TV 1.2.0

La versión 1.1.0 podía quedar detenida en «Preparando presentación»:
`tv.js` importaba `presentation-media.js` y `presentation-timing.js`,
pero el interceptor de recursos del WebView solo entregaba tres archivos
(`index.html`, `tv.js` y `tv.css`). Los dos módulos daban HTTP 404
silenciosamente e impedían que el JavaScript iniciara.

En 1.2.0 las rutas de ambos módulos están habilitadas expresamente y
comprobadas con una prueba de regresión que compara los imports de la web
contra el servidor interno de Android. Si en el futuro vuelve a fallar
algún componente, la app muestra un mensaje de error y «Reintentar» en
lugar de un spinner interminable. Cada fase de lectura/renderizado del
PPTX tiene una espera máxima y registra el fallo en Logcat (`MasDuenosTV`).

Esta modificación **no cambia los archivos descargados** de Hostinger,
la caché, la navegación con control remoto ni la presentación web. Para
pasar de APK debug 1.1.0 a 1.2.0 podría ser necesario desinstalar si
las firmas de ambas compilaciones difieren. Al desinstalar se borran las
copias locales y se tendrán que descargar nuevamente.

## Versión 1.4.0 · inicio automático y Geraldine

Al iniciar la aplicación se verifican y actualizan primero **ambos** archivos.
Cuando el proceso termina y hay un PPTX válido, se abre automáticamente
la pantalla `Preparando presentación`, sin pasar por el botón «Abrir
presentación». El usuario pulsa OK para iniciar la exposición. Atrás
vuelve al menú y **no** vuelve a abrir el visor por su cuenta. El
botón «Buscar actualizaciones» también regresa al visor cuando concluye.

El reproductor identifica la animación de Geraldine por SHA-256 cuando
se trata del PPTX original y, para versiones actualizadas con la misma
disposición comercial de 40 diapositivas, detecta la presencia de video
en la diapositiva 21. Se detiene el autoplay del visor hasta la primera
orden de avance en esa diapositiva, y el siguiente avance continúa a
la diapositiva posterior. Los controles HTML de video y los controles
flotantes del visor se suprimen también si aparecen al cambiar de
diapositiva o al actualizar estilos.

## Versión 1.6.0: video introductorio visible

En algunos televisores y teléfonos el `VideoView` anterior reproducía el
sonido de `introduccion.mp4` pero su imagen permanecía negra. El video
ahora utiliza `TextureView` y `MediaPlayer` con un `Surface` vinculado a
la jerarquía visual nativa de Android. Este diseño evita los problemas de
composición de `SurfaceView` por debajo de `WebView` y mantiene la
relación de aspecto con bandas negras cuando corresponde.

Tab / OK siguen iniciando o deteniendo el video, y PageUp / PageDown o
las flechas conservan los saltos de cinco segundos. El MP4 sigue
leyéndose directamente del archivo local verificado; no se vuelve a bajar.
El registro de Android incluye el tamaño detectado del video y el evento
`MEDIA_INFO_VIDEO_RENDERING_START` para ayudar a diagnosticar equipos con
códecs incompatibles.
