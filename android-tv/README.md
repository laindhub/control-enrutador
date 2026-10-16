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

## Versión 1.6.5 · Geraldine nativa y reconexión del teclado

La diapositiva 21 contiene un video H.264/AAC de 40,61 s en el PPTX
original, relacionado desde `ppt/slides/_rels/slide21.xml.rels`.
El lector JavaScript puede dejar su superficie negra en ciertos Android TV.

Al pulsar PageDown en la diapositiva 21, `GeraldinePlayer` extrae
solo el MP4 vinculado a esa diapositiva desde la copia íntegra de PPTX
y lo decodifica con `TextureView + MediaPlayer` en la posición vertical
original del video. Se almacena una copia privada identificada por el
SHA-256 del PPTX; no descarga nada ni modifica el PPTX. Al finalizar,
la diapositiva permanece visible y otro PageDown continúa normalmente.
Al cambiar de diapositiva o salir se libera el reproductor.

Los cambios de configuración por conectar/desconectar un teclado o
control USB/Bluetooth no recrean la Activity: se preservan el WebView,
las diapositivas, las descargas y la posición actual. Se mantiene el
modo inmersivo y se recoloca la superficie de video si cambia el tamaño.

## Versión 1.6.6 · Geraldine sin cuadro negro de espera

La versión 1.5.0 mostraba correctamente los fotogramas de Geraldine,
pero la transición al decodificador nativo introducida en 1.6.5
dejaba a la vista un cuadro negro antes de pulsar PageDown.

Ahora `GeraldinePlayer` extrae el MP4 durante la preparación del
PowerPoint y obtiene **el primer fotograma real del archivo** mediante
`MediaMetadataRetriever`. Al llegar a la diapositiva 21, muestra esa
imagen de espera exactamente encima del video original. Al recibir
PageDown, inicia el MP4 con un `TextureView` inicialmente transparente;
solo muestra esa superficie al recibir `MEDIA_INFO_VIDEO_RENDERING_START`.
La imagen permanece por detrás hasta entonces, sin negro intermedio.

Al abandonar la diapositiva o regresar al menú se libera el reproductor
y desaparece la vista previa. No se modifica el PPTX ni se generan
imágenes mediante IA. Se conserva la solución de 1.6.5 para no reiniciar
la presentación al reconectar el mando o teclado.

## Versión 1.6.7 · transiciones suaves de diapositivas y Geraldine

Al avanzar o retroceder con el control remoto, el visor aplica una máscara
degradada liviana sobre el elemento de presentación activo (incluido fullscreen).
Oculta el repintado progresivo por cuadrantes del motor PPTX y revela la nueva
diapositiva con un fade de 185 ms. La máscara se limpia tras cada transición
y no altera el contenido, los controles ni los archivos descargados. Los
cambios de diapositiva siguen siendo inmediatos y todas las teclas conservan
su función, incluso cuando se presionan rápidamente.

El primer fotograma precargado de Geraldine continúa visible mientras
arranca el decodificador. El TextureView entra con un degradé de 185 ms
y, al finalizar el clip, se desvanece brevemente hacia el fotograma de espera.
Salir o avanzar durante la reproducción cancela estas animaciones
sin dejar superficies colgadas.

## Versión 1.6.8 · navegación directa y fundido exclusivo de introducción

Se elimina completamente el degradé de la versión 1.6.7 en los cambios
entre diapositivas. PageDown, PageUp y las flechas vuelven a mostrar
inmediatamente la siguiente diapositiva, sin máscaras ni demoras
artificiales. El visor conserva el modo totalmente limpio.

Optimización real del renderizado: la observación de controles se
agrupa a un solo barrido por fotograma, ignorando cambios ordinarios de
estilo de las diapositivas; y las inspecciones de video se ejecutan solo
en las diapositivas que tienen multimedia, con timers cancelables.
Esto reduce el trabajo redundante mientras Chromium actualiza el PPTX.

El fundido de 190 ms se aplica solamente al video de introducción nativo
al aparecer su primer fotograma y al cerrarse/terminar. La
reproducción de Geraldine, el manejo del teclado y las descargas
permanecen intactos. 

## Versión 1.6.9 · inicio automático de la presentación

Luego de sincronizar y verificar el PPTX y el MP4, la aplicación
sigue automáticamente con la preparación del PowerPoint. En cuanto
están disponibles todas las diapositivas y la lógica de Geraldine,
entra directamente en la presentación. **No existe más la pantalla
"Todo listo" ni el botón "Iniciar presentación".** No se necesita OK,
Enter ni ratón después de encender/abrir la app.

Se conserva el modo inmersivo nativo de Android TV, de modo que una
restricción de la Fullscreen API de WebView no bloquea el inicio
automático. La pantalla "Preparando presentación" permanece hasta
los primeros fotogramas de renderizado. Escape vuelve al menú nativo
de archivos/actualizaciones sin pasar por la pantalla eliminada.
El resto de los controles, vídeos, cache y navegación se conserva.

## Versión 1.6.10 · firma persistente para actualizaciones sin reinstalar

Desde esta versión, las APK destinadas a instalarse en Android TV son
compilaciones **release** firmadas con la misma clave privada, sin usar
la firma debug efímera de GitHub Actions. La clave privada se almacena exclusivamente como secreto de GitHub Actions. El workflow verifica siempre
la huella SHA-256 del certificado; si el secreto falta o la huella cambia,
NO publica una APK incompatible. Ver `android-tv/signing/README.md`.

**Importante:** la primera vez que se pasa de una APK antigua con firma
debug a 1.6.10 hará falta desinstalarla una vez. En todas las versiones
posteriores firmadas con esta misma clave, la actualización será en el
mismo paquete `io.laind.masduenos.tv` sin borrar archivos locales,
siempre que se incremente `versionCode`.


## 1.6.11: APK completo, con medios incorporados (sin descarga inicial)

La variante **masduenos-android-tv-offline-complete-apk** incluye los **dos
archivos originales**: `mas-duenos-liniers.pptx` y `introduccion.mp4`.
No se agregan videos ni documentos grandes al repositorio GitHub.

El workflow `.github/workflows/build-android-tv-bundled.yml` descarga desde
Hostinger exactamente `/tv/media/presentation.pptx` y
`/tv/media/introduccion.mp4` durante la compilación y comprueba sus tamaños,
contenidos y SHA-256 contra `/tv/manifest.json`. Si falta algún archivo o
falla una verificación, NO publica el APK.

Al iniciar por primera vez, `TvAssetStore` copia ambos archivos desde
`assets/bundle/` a su almacenamiento privado y comprueba su SHA-256 antes
de utilizarlos. La copia se realiza una sola vez. Conserva copias previas
válidas, y lanza la presentación en cuanto ambos archivos locales están
verificados, aunque Hostinger no esté disponible. En segundo plano se
mantiene la comprobación de actualizaciones del servidor. El archivo
PowerPoint y la introducción no se modifican ni se convierten.

La APK tiene varios cientos de megabytes y la instalación/copia inicial
necesita espacio libre adicional en Android TV. El motor remoto de PPTX
`esm.sh` todavía podría requerir conexión cuando no esté guardado en la
caché del WebView; la variante incluye **los medios**, no un motor PPTX
completamente desconectado.

El APK ordinario sigue funcionando sin ninguna modificación de flujo: si
no existe `assets/bundle/manifest.json`, usa exclusivamente la descarga
existente. Ambas variantes conservan el package id y la misma firma
permanente, para permitir actualizaciones sin reinstalación.

## 1.6.12 · Sin requisito de firma permanente

Se retiró el requisito de los secretos de firma de GitHub. Los workflows
habitual y completo vuelven a generar APKs instalables con
`gradle :app:assembleDebug`, sin certificado PIN ni secretos externos.
La edición completa conserva `io.laind.masduenos.tv` y trae el
PowerPoint y video de introducción originales ya dentro del APK.

**Importante:** los runners de GitHub crean una firma debug distinta en
distintas ejecuciones. Es posible que Android no permita actualizar un
APK anterior encima del instalado; si da conflicto de firmas hay que
desinstalar la versión previa, lo que borra su caché local (los medios
están dentro del nuevo APK). La app no garantiza actualizaciones
incrementales entre APKs con diferente firma.
