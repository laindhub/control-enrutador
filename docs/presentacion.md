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
