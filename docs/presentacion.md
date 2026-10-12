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
