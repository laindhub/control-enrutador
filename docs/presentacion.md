# Presentaciones PPTX · /presentacion

Visor/editor integrado al repositorio existente.

## Uso
- Abrir https://masduenos.laind.io/presentacion en Chrome o Edge.
- Elegir o arrastrar un PPTX, PPSX o PPTM (máximo 250 MB).
- Opcional: marcar Habilitar edición antes de abrir y luego guardar una copia del PPTX.
- Presionar Iniciar presentación. Ese clic sirve para solicitar pantalla completa y favorecer la reproducción automática con sonido.
- Navegar mediante flechas o espacio; Esc sale de la presentación.

## Arquitectura y privacidad
- GET /presentacion es independiente de la sesión comercial, aunque respeta el arranque normal de Node.js.
- El archivo se procesa en el navegador y no se sube al backend ni se almacena en MySQL.
- Motor externo pptx-vanilla-viewer versión 3.31.1, obtenido de https://esm.sh/ por el navegador. El código del motor se ejecuta en el cliente desde un proveedor CDN externo. Una red corporativa puede bloquearlo.
- Política CSP ampliada solo en /presentacion, no en las rutas de CRM, ventas y administración.
- Reproducción automática del motor y reintentos limitados para los medios visibles de cada diapositiva.

## Límites que se deben comprobar
- No se garantiza fidelidad idéntica a PowerPoint de escritorio con cualquier archivo, tipografía, animación o objeto especial.
- La reproducción con sonido está sujeta a las políticas de autoplay del navegador y de la empresa: JavaScript no puede ignorarlas.
- WMV/AVI y otros códecs antiguos pueden fallar. MP4 con H.264 y AAC es más compatible.
- Para validar el uso real hay que probar el PPTX laboral, sus fuentes y la diapositiva con video.
- La dependencia CDN podría sustituirse más adelante por un paquete autohospedado si la red de trabajo la bloquea.

## Pruebas
- node --test test/presentation.test.js
- node --check public/js/presentation.js
- GitHub Actions test-presentation.yml ejecuta análisis de sintaxis y una prueba real de carga con Chromium y un PPTX sintético.

No se necesita instalar nada en las computadoras: solo un navegador compatible.

## Reproducción de videos repetidos
- Si dos diapositivas consecutivas incluyen el mismo video, la primera se conserva como vista previa pausada y la segunda lo reproduce automáticamente.
- Hay un control opcional «Reproducción de videos» para indicar manualmente la diapositiva que debe reproducir el video cuando el PPTX utiliza referencias difíciles de identificar.
- Se mantiene el inicio de reproducción con gesto de presentación y el comportamiento del navegador.

## Loop continuo al presentar

Al iniciar la pantalla completa se activa temporalmente la opción nativa de PowerPoint `presentationProperties.loopContinuously`. El motor vuelve al primer slide al avanzar más allá del último (también con la rueda del mouse y la navegación del visor), sin mostrar una pantalla negra y sin cerrar la presentación. Al salir con Esc o al cambiar de archivo se restaura el valor original para no guardar involuntariamente este ajuste en el PPTX. El menú contextual de salida se desactiva durante la presentación.

## Presentación real «Nueva - Más dueños.pptx»

Inspección del archivo recibido el 2026-10-13:

- Tamaño: 34.796.967 bytes.
- SHA-256: `bdb35bfa366b7c2570a36a0d5b1172836765d50796a8e772345b5a5ccf6f25c7`.
- Diapositivas físicas PPTX: **40**.
- Video incluido: `ppt/media/media1.mp4` (3.346.526 bytes), referenciado solo desde `ppt/slides/slide21.xml`.
- La diapositiva física 21 contiene un solo video y una línea de tiempo `p:timing` con `nodeType="clickEffect"` y comando `playFrom(0.0)`; **la vista previa pausada y la reproducción son dos pasos de la misma diapositiva**, no dos diapositivas distintas.
- Se suprime la reproducción forzada cuando se llega a esa diapositiva; el primer avance con rueda hacia abajo o teclado dispara el video dentro de la misma diapositiva. Al dar otra vuelta en el loop se restablece el estado inicial.
- Detección limitada al SHA-256 exacto de la presentación original, para no alterar el comportamiento de otras presentaciones.

**Importante:** el PPTX binario completo no está incluido en el repositorio mediante esta documentación. Una vez incorporado por el canal de archivos correspondiente, debe conservarse exactamente y no sustituirse por una versión reexportada, porque la configuración de `p:timing` forma parte del comportamiento esperado.

## Acceso directo y presentación comercial predeterminada

El acceso **Presentaciones** está disponible desde la pantalla de ingreso,
la selección de operador, la vista de enrutadores y el panel de administración.
En `/presentacion` hay dos tarjetas: **Nueva - Más Dueños** y
**Subir otro PPTX**.

La presentación oficial se busca en el recurso estático
`public/presentaciones/mas-duenos-liniers.pptx`
(`/assets/presentaciones/mas-duenos-liniers.pptx`).
La tarjeta comprueba la existencia mediante HEAD y solo permite descargar
y abrir el archivo si este existe. Si falta, muestra
«Archivo pendiente de publicación»; la subida local funciona de igual modo.

Por ser público el repositorio, la carga del archivo PPTX de 34,8 MB implica
publicación sin restricción de acceso. La interfaz no debe anunciar el
archivo como disponible hasta que se haya incorporado el binario real.
Los PPTX locales no se suben al servidor.

## Archivo alojado en Hostinger (sin binario en Git)

El archivo original fue subido al administrador de archivos de Hostinger bajo
`masduenos/mas-duenos-liniers.pptx`. La ruta pública del visor no cambia:
`/assets/presentaciones/mas-duenos-liniers.pptx`. Node.js resuelve el archivo
en orden: ruta opcional `MAS_DUENOS_PRESENTATION_PATH`, archivo dentro de
`public/presentaciones`, raíz del proyecto desplegado y carpeta
`masduenos` del directorio home del usuario de ejecución de Node.

La ruta fija se publica mediante GET y HEAD sin requerir sesión. Antes de
servirla se verifican el tamaño exacto (34.796.967 bytes) y el SHA-256 original;
si el archivo está ausente o no coincide, devuelve 404 y la tarjeta no se habilita.
No se permite navegar por otras rutas del directorio de hosting. La validación
exitosa queda cacheada mientras no cambien los metadatos del archivo. Se
deshabilita el caché HTTP de esta respuesta.

**Importante:** publicar el código en GitHub no publica el binario: debe
persistir en el sistema de archivos del hosting. Si Hostinger despliega la web
en un directorio o usuario distinto y no encuentra el archivo, se puede indicar
su ruta absoluta con la variable opcional `MAS_DUENOS_PRESENTATION_PATH`.
Esto no afecta los PPTX abiertos manualmente, que siguen siendo locales.

En despliegues Hostinger recientes, el proyecto suele ejecutarse en
`/home/<usuario>/domains/<dominio>/hbuilds/current/nodejs`. El servidor
también deriva la carpeta `/home/<usuario>/masduenos` desde ese directorio
cuando la variable HOME del proceso no apunta al home de la cuenta.

## Respuestas 200/HTML de Hostinger

La ruta verificada del PPTX se registra antes del middleware de arranque de
MySQL y sesiones. La tarjeta valida MIME y tamaño declarado al comprobar
HEAD; en GET comprueba bytes, firma ZIP y SHA-256 antes de abrir la presentación.
Una respuesta HTML con HTTP 200 nunca anuncia «Lista para abrir» ni llega
al motor PPTX. La opción de subir otros archivos sigue independiente.

## Video Geraldine: reproducción única por visita (diapositiva 21)

La diapositiva física 21 incorpora el efecto `playFrom(0)`. El primer avance
inicia el video una sola vez y el segundo salta a la diapositiva 22 usando
`viewer.goToSlide` para evitar que el motor ejecute otra vez dicho efecto.
El visor conserva el registro de reproducción aunque refresque la misma
diapositiva y, al finalizar, mantiene el último fotograma. Contempla
teclado, rueda, clic y gesto táctil vertical. Al regresar a esa diapositiva
en una nueva vuelta, el estado se reinicia para permitir una sola reproducción.

## Caché persistente del PPTX oficial

La primera apertura del archivo oficial descarga y verifica el PPTX original
(34.796.967 bytes, SHA-256 fijado). Después almacena una copia de esa misma
versión en **Cache Storage** del navegador, sin service worker. En visitas
posteriores se comprueba primero la caché del dispositivo y, si está presente,
se abre desde allí sin solicitar HEAD ni GET del PPTX al servidor. El archivo
se vuelve a validar por firma y SHA-256 al cargarlo desde la caché. El nombre
de la caché incluye el SHA-256, para invalidar automáticamente una eventual
actualización del PowerPoint y poder eliminar las versiones viejas.

Si Cache Storage no está disponible o no tiene cuota (por ejemplo, navegación
privada), la descarga verificada sigue funcionando. El navegador puede limpiar
la copia por presión de almacenamiento o al borrar los datos del sitio.
La carga manual de otros PPTX no almacena archivos en esta caché.

## Presentación limpia sin barra flotante

Al iniciar la reproducción a pantalla completa, se oculta únicamente la
barra flotante del motor `pptxv-present-toolbar-wrap`, incluso si el mouse
se mueve hacia sus bordes. Los controles del editor, disponibles fuera de
pantalla completa, no se alteran. Se mantiene la navegación con teclado,
rueda, clic y gestos, además de la salida con Escape y el loop continuo.

## Preparación anticipada del motor (visitas posteriores)

El módulo `pptx-vanilla-viewer@3.31.1` comienza a importarse al abrir
`/presentacion`, no al hacer clic. Si la copia del PPTX oficial ya está
en Cache Storage, se valida localmente y se interpreta anticipadamente en
un contenedor fuera de pantalla con tamaño medible. Mientras tanto, el
usuario ve la pantalla normal de selección.

Al pulsar «Nueva - Más Dueños» se hace visible **el mismo visor ya cargado**
sin volver a ejecutar `viewer.loadFile()`. El motor solo se crea una vez
por página; no se persiste la estructura DOM entre cierres del navegador.
Si el archivo todavía no está en caché, falla la precarga, o está activado
el modo de edición, sigue disponible el flujo convencional. La precarga
nunca descarga PPTX faltantes, no reproduce videos, no solicita fullscreen
y no cambia las funcionalidades de Salón.

## Mantener encendida la pantalla durante la presentación

Al iniciar la presentación en pantalla completa se solicita `navigator.wakeLock.request('screen')` mediante la Screen Wake Lock API. Se libera al salir con Escape, cerrar la sesión o abandonar la página. Si la aplicación pasa a segundo plano, el bloqueo puede revocarse; al regresar a una pestaña visible y a la presentación activa se intenta adquirir nuevamente. Fuera del modo presentación no se solicita bloqueo. No afecta al archivo PPTX, la caché, el video de Geraldine ni los controles de edición.

Esta API exige un contexto seguro (HTTPS) y depende del navegador, el sistema operativo, las políticas de ahorro de energía y los permisos del dispositivo. Si no está soportada o se deniega, la presentación sigue funcionando, pero no es posible garantizar desde la web que la pantalla permanezca encendida.

## Prueba aislada del control remoto (rama feature)

El panel «Configurar control remoto (prueba)» detecta eventos DOM de teclado
(`keydown`), botones de mouse (`mousedown`) y desplazamiento (`wheel`).
Se puede comparar una pulsación y una doble pulsación en el historial y
asignar manualmente una señal observable al video introductorio.
La asignación (firma y ruta opcional del MP4) se guarda en `localStorage`
del navegador de la notebook. Solo se aplica **antes de iniciar el modo
presentación**; las 40 diapositivas, el loop y el video Geraldine siguen
controlados por el visor estándar.

El MP4 será una ruta del mismo dominio y **aún no está publicado**. El
video introductorio se mostrará en un reproductor separado, con botón de
cierre, sin modificar el PPTX. La prueba no requiere archivos secretos ni
un servidor de producción.

Limitaciones: los navegadores no diferencian la tecla `PageDown` de un control
USB de la misma tecla del teclado normal. Tampoco pueden capturar una pulsación
que el hardware no exponga como evento DOM; si no hay señal con una pulsación,
no se puede remapear únicamente mediante JavaScript. Los clics izquierdos
normales aparecen en diagnóstico, pero no pueden asignarse por seguridad.

## Señal física identificada en el K01 (13/10/2026)

La captura del detector en Windows/Edge muestra una secuencia `keydown Tab`
(`code=Tab`, `keyCode=9`) seguida de `keyup Tab` para cada pulsación.
No hay diferencia identificable respecto de la tecla Tab de la notebook.
En esta rama se permite detectar y asignar `key::Tab` **solo** con una
habilitación explícita del modo remoto en la pantalla de espera. La entrada
se captura una vez por `keydown`, sin considerar `keyup`. Se respeta
Shift+Tab como navegación, y no se intercepta Tab al editar campos o durante
la presentación comercial. La opción puede desactivarse en cualquier momento.

## Producción: introducción mediante botón K01 Tab

El botón detectado en la notebook envía `Tab` (`keydown`, código 9). Por defecto, una pulsación activa `/assets/presentaciones/introduccion.mp4`, servido desde `masduenos/introduccion.mp4`, junto al PPTX oficial. El video es independiente de la presentación comercial. No es necesario subirlo a GitHub.

Tab únicamente reproduce el MP4 si el visor ya está iniciado **en pantalla completa sobre la diapositiva 1**. Fuera del modo de presentación (pantalla de selección y edición) Tab no lanza el video ni solicita fullscreen. El reproductor se incrusta dentro del fullscreen existente, sin controles visibles y con `cursor:none` incluso al mover el mouse. El clic y la rueda no pueden avanzar accidentalmente el PPTX mientras corre el video. Al finalizar vuelve a la primera diapositiva manteniendo fullscreen; Escape continúa permitiendo salir de la presentación. El video no puede iniciarse desde otras diapositivas.

La configuración de Tab está habilitada por defecto, pero puede desactivarse en los ajustes de control remoto de la misma página. No intercepta la tecla mientras se editan campos de texto ni cambia la reproducción de Geraldine. Si el video aún no está cargado, se muestra un aviso y el PPTX funciona igual.

## Caché persistente del MP4 introductorio

Al hacer clic en «Nueva - Más Dueños» se inicia inmediatamente y en
segundo plano la descarga de `/assets/presentaciones/introduccion.mp4`.
Se comprueba el tipo MIME, la longitud total y la firma MP4 `ftyp`
antes de guardar la copia completa en Cache Storage del navegador.
No se espera al botón Tab/K01 ni se retrasa la preparación del PPTX.

Las siguientes aperturas reutilizan esa copia local. Se realiza una
comprobación HEAD de metadatos (ETag, fecha de modificación, tamaño) y
se renueva la copia si Hostinger publica una versión distinta. Si Hostinger
está temporalmente inaccesible, la copia válida existente sigue disponible.

Al reproducir la introducción se utiliza una URL `blob:` de la copia
cargada. El objeto se libera al finalizar el video. Si Tab se presiona
antes de completarse la primera descarga, se permite el streaming normal
para no bloquear la reproducción. Si no se ha subido aún el archivo, no
se cachea ningún 404. Si falta espacio de almacenamiento, la introducción
puede reproducirse desde la red sin interrumpir las 40 diapositivas.
La caché del video es independiente de la caché PPTX y de los MP4
incrustados como el de Geraldine.

## Indicador de descarga para el video introductorio

La barra compacta de la cabecera aparece al abrir «Nueva - Más Dueños».
Muestra el porcentaje y los megabytes recibidos (de `content-length`
cuando está disponible). Se actualiza con los fragmentos reales del flujo
`ReadableStream` del MP4, no mediante un temporizador simulado. Una vez
recibidos todos los bytes indica «Guardando…» y solo confirma «Video
guardado y listo» después de que Cache Storage acepte el archivo completo.

Al entrar nuevamente muestra «Video disponible en caché» después de
validar los datos locales y consultar los metadatos de Hostinger. Un 404,
un error o la falta de cuota se muestran como estados diferentes. El
indicador no aparece sobre las diapositivas a pantalla completa.

## Tab vuelve a cerrar el video introductorio

Mientras se reproduce `introduccion.mp4`, una segunda pulsación del botón
K01 (señal `Tab`) lo detiene y vuelve directamente a la diapositiva 1
**sin salir de pantalla completa**. Otra pulsación de Tab puede reiniciarlo.
La repetición de tecla al dejarla presionada no cierra el video; solo
se toma un `keydown` nuevo. Escape sigue cerrando la presentación completa.
Los videos incrustados, como el de Geraldine, conservan su comportamiento.

## Control de reproducción de la introducción con K01 y flechas

Mientras `introduccion.mp4` está reproduciéndose a pantalla completa,
la captura del receptor K01 confirma `PageUp` para retroceder 5 segundos
y `PageDown` para adelantar 5 segundos. El teclado también puede utilizar
`←` o `↑` para retroceder y `→` o `↓` para adelantar. Los saltos se limitan al intervalo `0..duration`, sin
cambiar la diapositiva que está detrás del video. Se ignora la repetición
automática por mantener una flecha presionada, para evitar saltos
acumulados involuntarios. La tecla Tab continúa abriendo/cerrando
la introducción. Fuera de ella, las flechas recuperan la navegación
normal del PPTX y el video de Geraldine no se modifica.
