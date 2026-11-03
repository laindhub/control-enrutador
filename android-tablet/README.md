# Más Dueños · App unificada para celulares (1.0.5)

## 1.0.5 · Visitas cerradas del CRM

La respuesta visible «Esta visita está cerrada / Ya no admite pasos nuevos» termina la máscara de carga aunque no haya campos de formulario. Se muestra el aviso original del CRM y se conservan las acciones de regreso a Enrutar. Un aviso cerrado no dispara por sí solo una nueva confirmación de guardado ni reenvía la derivación. Se ignoran avisos ocultos en plantillas. Mismo DEX, paquete y certificado de 1.0.4; `versionCode 24`.

## 1.0.4 · Corrección de instalación

La 1.0.3 distribuida tenía `resources.arsc` comprimido: Android 11+ rechaza ese APK aunque su firma sea válida. Se conserva sin compresión, alineado a 4 bytes, y se comprueba con `python3 scripts/qa/verify-android-apk.py <apk>` además de apksigner. La CI ejecuta este control antes de publicar el artefacto. Mismo DEX y assets de 1.0.3, paquete y certificado; `versionCode 23`. No se debe recomprimir el contenido de `aapt2 link` al añadir el DEX: conservar los ZipInfo originales.

## 1.0.3 · Derivación sin interrumpir la carga del CRM

- La integración de derivaciones ya no inyecta navegación a los 500 ms, antes de terminar el documento de Next.js. Se instala al finalizar el documento original.
- En el formulario, ocultar el dock web no navega el marco principal para notificar pestañas: la selección nativa sigue siendo Salón. La confirmación de guardado utiliza un mensaje nativo con nonce de la visita y validación de origen, sin cambiar la URL del CRM.
- Una máscara nativa mantiene la animación hasta que aparece un control real del formulario (el encabezado no alcanza). A los 30 segundos ofrece reabrir mediante GET; nunca repite automáticamente un POST ni marca una derivación como guardada por un timeout.
- Mismo paquete, certificado e ícono rojo. `versionCode 22`, `versionName 1.0.3`.
- QA: `verify-assignment-return.cjs`, `verify-unified-navigation.cjs` y `verify-assignment-loading.cjs`. Las pruebas usan formularios sintéticos y una respuesta HTML transmitida por partes; no envían derivaciones reales.

## 1.0.2 · Ícono Android rojo

Ícono adaptativo con fondo rojo opaco `#D6271D` y el símbolo blanco original. Se declara también como `roundIcon` para que el launcher aplique su máscara sin convertir la transparencia del PNG en un ícono blanco. Mismo paquete y certificado; versionCode 21 para actualizar sobre 1.0.1 conservando datos.

## 1.0.1 · Carga privada y regreso a Enrutar

- Atendidas, la verificación de la persona y la recuperación del test usan una máscara nativa opaca con animación. El WebView sigue montado al tamaño completo, pero con opacidad cero y sin accesibilidad mientras trabaja; no aparece el proceso interno. El login original de Host se muestra solamente si es necesario.
- Tanto la lista como el test disponen de timeout y reintento. La generación del PDF se hace fuera del hilo de UI para mantener fluida la animación. Se conservan la sesión Host compartida y las comprobaciones de UUID y nombre.
- La derivación oficial se abre en la pestaña Salón, con la sesión Enrutador ya existente. Se quita la sección «CRM» de Enrutar y se oculta el dock web duplicado.
- El guardado del CRM sigue siendo manual. La app observa únicamente el resultado del envío de la visita elegida: confirmación JSON, 204, redirección del servidor o aviso de éxito posterior a un envío válido. Un GET, un error o abandonar el formulario nunca cuentan como guardado. Al confirmarse, actualiza el estado local y vuelve al tablero de esa charla.
- Si el CRM cambia su respuesta y no puede reconocerse el éxito, «Ya guardé · volver» permite confirmar explícitamente. «Enrutar» o Atrás permiten salir sin marcar la ficha como registrada.
- Prueba de los resultados: `node scripts/qa/verify-assignment-return.cjs` en Chromium con una página sintética. No se envían derivaciones reales durante las pruebas.
- `versionCode 20`, mismo paquete y certificado para actualizar conservando los datos.

## Versión unificada actual

Una APK combina Salón (incluida su integración de leads, ventas y comisiones) con las charlas, sillas, fichas, captura del Full-test e impresión de Enrutador. El módulo histórico conserva el directorio `android-tablet` para no cambiar el identificador Android ni perder el almacenamiento cifrado de las instalaciones existentes.

- Navegación inferior única: **Salón · Enrutar · Yo**. No hay botón «Hoy».
- Enrutación tiene secciones Charlas y Sillas. El tablero permite alternar plano 4 × 3 y lista de personas.
- Las fichas se organizan en Datos → Hoja → Confirmar. Se conserva la vista previa obligatoria de la hoja y el registro manual final en el CRM.
- Salón usa su WebView y almacenamiento en `:salon`; Host mantiene `:host`; Enrutador conserva el proceso principal. Los perfiles no intercambian cookies, PINes ni tokens. El proceso Salón incorpora intacta la integración de ventas y los reintentos seguros del APK de referencia.
- Los controles originales de Salón se conservan en el DOM y la barra nativa los activa por su etiqueta real. No se adivinan rutas del perfil. El dock web se oculta únicamente cuando se identifica su contenedor inferior, sin ocultar formularios ni contenido.
- Los cambios de pestaña reutilizan pantallas abiertas. La barra respeta los márgenes del sistema y se oculta cuando aparece el teclado.
- Se actualiza sobre Enrutador 0.7.2: mismo `applicationId`, certificado, preferencias cifradas y clave Android Keystore. Conserva charlas, fichas, PDFs y sesiones de Enrutador/Host. La app Salón anterior tiene otro identificador Android: su sesión privada no se puede importar automáticamente; será necesario ingresar una vez en Salón dentro de la app unificada.
- Asesores siguen viniendo de `https://masduenos.laind.io/assets/tablet/directory.json`, con copia local válida para trabajar sin conexión.
- Distribución: `versionCode 19`, `versionName 1.0.0`; firmar con la misma clave de la serie Enrutador. Nunca incluir las claves en el repositorio.

Verificación del dock web en Chromium: `node scripts/qa/verify-unified-navigation.cjs` (requiere Playwright y su Chromium; opcionalmente `QA_CHROMIUM` apunta a un ejecutable existente). La prueba utiliza una página sintética, sin sesión ni datos del CRM.

## Historial del módulo Enrutador

Proyecto Android dedicado para Samsung Galaxy Tab A8; **no modifica** la app existente de Salón.

## Primer alcance implementado
- Perfil Host mediante WebView aislada en el proceso Android `:host`, con su propia sesión y cookies.
- Perfil Enrutador mediante WebView en el proceso principal. El PIN se escribe únicamente en el CRM original. Ninguna credencial se transfiere a LAIND.
- Captura asistida de una ficha seleccionada en Host (nombre, hora, teléfono si se muestra). **El usuario debe confirmar visualmente los datos y completar los campos propios**.
- Preparación de «Charla de», «Derivado a» y «Descripción» en la pantalla principal.
- Captura desde la sesión Host del botón original «Imprimir el Full-Test»: Android intercepta la ventana de impresión HTML del CRM y la representa en dos páginas PDF dentro del caché privado, sin importación manual. Después compone las dos páginas en una sola hoja A4 con bloque de referencia. Una copia, una cara.
- Impresión directa IPP por red local (tentativa; depende de soporte de PDF e IPP en Brother) o diálogo de impresión Android como respaldo.
- Solo después de iniciar el proceso de impresión se habilita el paso para abrir el CRM con el perfil Enrutador.

## Límites / siguientes pasos
- Esta versión **no automatiza el envío de la derivación**. Abre el CRM en su sesión de Enrutador y la operación final se ejecuta manualmente. No existe aún un contrato de API ni selectores verificados para guardar una derivación de forma automática.
- La captura directa del reporte mediante WebView y ventanas emergentes está implementada, pero requiere validación en una sesión real de Host. La división en dos páginas se basa inicialmente en las dos mitades del HTML representado; debe validarse el encuadre y la legibilidad con un reporte real antes de usarla para archivar. Si el CRM modifica el método de impresión, la app mostrará un error antes de imprimir.
- «Impresión iniciada» no significa que la impresora haya producido físicamente el papel. La confirmación debe ser explícita.
- Se debe probar IPP en la red real de Más Dueños con la Brother DCP-L5650DN. Dirección inicial 192.168.2.33, editable. Si falla, Android PrintManager permite la impresión convencional.
- Nunca incluir PDFs reales, PII de clientes, PINes, cookies o claves en GitHub.

## Compilar
Java 17, Android SDK 35. Ejecutar `gradle :app:assembleRelease` desde `android-tablet/`.
La CI genera un APK **sin firma**, no instalable directamente. Firmarlo con una clave de distribución privada antes de instalar.

## Tablero multilead (0.3.0)

- Inicio con tablero de **varias personas al mismo tiempo**, tarjetas independientes, búsqueda por nombre, descripción, asesor, presentador o hora y filtros de estado.
- Vista responsive: una columna vertical / dos columnas en horizontal para Galaxy Tab A8.
- El tablero muestra **solo los leads seleccionados manualmente desde Atendidas de Host**. No presenta cifras falsas del CRM en tiempo real.
- Cada lead tiene un borrador persistente cifrado con **AES-GCM y Android Keystore**; los PDFs quedan en el almacenamiento privado de la app, sin backup del sistema.
- El PDF capturado se copia a un archivo independiente por visita. La impresión de una persona no sobreescribe el documento de otra.
- Flujo de estados separados: en preparación -> por imprimir -> enviado a impresión -> hoja verificada -> registrada por el usuario. La última etapa se confirma manualmente, **no es un registro automático en el CRM**.
- Los cambios a presentador/asesor/descripción invalidan la impresión anterior. Las personas marcadas como registradas quedan bloqueadas; pueden eliminarse desde la ficha con confirmación.
- Si falló IPP, no se declara impreso; el diálogo de Android sigue como alternativa.
- Los leads anteriores siguen accesibles mediante «Ver días anteriores». Se pueden quitar desde la ficha.

**A verificar en el salón:** captura del reporte HTML del CRM, legibilidad de PDF, conexión IPP, navegación entre varias fichas y confirmación manual de CRM. No ingreses PINes ni datos personales en issues o capturas públicas.

## Búsqueda rápida de Atendidas 0.4.0

- «Buscar en Atendidas» abre el buscador nativo de la app. La lista se lee cada ~4 segundos desde el CRM original de Host, usando la sesión autenticada del dispositivo. Si la sesión expira, se muestra el login original.
- El buscador cambia a la pestaña «Atendidas» y lee sus enlaces de visita. El sincronizador de servidor `/floor/visits` no garantiza pertenencia a esa pestaña; esta consulta es específica del rol Host.
- Una persona se incorpora al tablero sin generar ni importar PDFs. Antes de agregarla se verifica su ficha, nombre, teléfono y hora.
- El PDF se captura solo al tocar «Imprimir» en esa tarjeta, cargando directamente su `crmPath` y comparando el nombre antes de preparar el archivo.
- Host y Enrutador siguen en procesos separados; no se almacenan PINes en la base de datos propia.
- **Pendiente de validar en la tablet real:** selectores de Atendidas, acceso a la sesión, captura HTML y resultado de impresión. No se automatiza el guardado final de la derivación.

## Navegación y estabilidad (0.5.0)
- La navegación se adapta a la pantalla: barra inferior en teléfonos y dock lateral en tablets con smallest width de 600dp o más. Atendidas, Tablero y Enrutador accesibles entre sí.
- Se corrigió la inicialización repetida de WebView en el proceso :host, que podía generar cierres al abrir Atendidas por segunda vez. La configuración ahora sucede una sola vez en TabletApplication.
- Se evitan accesos a rutas nulas durante carga/redirect del CRM y se suspenden sondeos del buscador cuando la pantalla no está activa.
- Desde la ficha ya preparada se abre directamente /floor/visits/<uuid>/assignment usando la sesión exclusiva de Enrutador, y tras login se reabre la asignación elegida.
- **El llenado automático de controles y el envío final NO están implementados en esta versión**; el formulario original sigue siendo la vía oficial de confirmación. Debe verificarse el control React y su resultado real antes de automatizar una operación irreversible.

## Sesión Host reutilizable (0.5.1)

Corrección confirmada en código de la repetición de login al imprimir:
- Antes: `HostLookupActivity` y `HostActivity` creaban instancias independientes de `new WebView(this)`. Compartían cookies, pero **no** la sesión de pestaña, el estado React ni el DOM.
- Ahora: ambas pantallas reutilizan una sola instancia de WebView en el proceso `:host`, que se desprende/adjunta a sus contenedores al navegar. La aplicación no copia ni guarda PIN, cookies o tokens.
- Si la ficha seleccionada sigue abierta en ese WebView, la impresión usa el UUID actual sin volver a cargar la web ni repetir el login.
- Si Android mata el proceso Host, se pierde el WebView en memoria; entonces el CRM puede pedir inicio de sesión legítimamente.
- La validación real de la Brother y del reporte final sigue pendiente de una prueba en la Galaxy Tab A8.

## Vista de escritorio obligatoria de Host (0.5.2)
- El CRM de Full-test/Host oculta el flujo de escritorio en el diseño móvil. Por eso la misma sesión de Camila podía mostrar «Hola, Camila» sin dar acceso al Full-test, aun cuando el navegador seguía autenticado.
- El WebView compartido de Host ahora usa User-Agent Chrome Windows, wide viewport y layout de 1280 píxeles con evento resize para componentes React. Esto se aplica a la búsqueda Atendidas y a la captura/impresión de un lead.
- La interfaz nativa de Salón sigue responsive. No se cambia el perfil Enrutador ni se fuerzan 1280 px para toda la aplicación.
- Se eliminó la afirmación incorrecta de que un redirect transitorio a /floor/login demuestra expiración de sesión.
- El comportamiento depende del sitio CRM original y se debe verificar con una visita real en Android. No se guardan PINes ni se transfieren credenciales.

## Corrección urgente de impresión 0.5.3
La foto del 28 de octubre confirmó que la versión anterior producía dos bandas diminutas. Causa: una captura WebView a ancho móvil se cortaba exactamente por la mitad y después se componía sobre A4. **Eso NO reproduce la extensión de Edge**.

En esta versión:
- El popup del Full-test se maqueta al ancho real de una página Carta (816 CSS px), con las tipografías de impresión del CRM.
- En vez de cortar por la mitad de una imagen larga, la app mide las secciones del HTML y pagina en un encabezado real; prioriza «Capacidad de Pago» cuando está disponible, como en el Full-test de dos páginas.
- Ambas páginas se dibujan completas con la misma escala y se rechazan los reportes demasiado largos o incompletos antes de imprimir. No se omiten campos silenciosamente.
- La composición 2-up copia la geometría A4 vertical de Impresión Más Dueños 2.3.1: página original 1 abajo y 2 arriba, rotación visual equivalente a 90 grados antihorarios, 1 copia en total. Se reserva una banda compacta para charla, asesor y descripción.
- **Se muestra una vista previa A4 antes de enviar a la impresora**, para no gastar papel si el sitio cambia sus estilos.
- Esto pasó compilación y pruebas de código; hay que aprobar visualmente el PDF renderizado en la Tab A8 antes de usarlo para archivo. La APK no tiene acceso al depurador CDP de Edge y por ello necesita su propia ruta de representación.

## 0.5.4 · Impresión corregida contra referencia de la extensión Edge

Se compararon `Full-test-archivo.PDF` (salida Android) y `asi es como deberia ser.pdf` (extensión): la salida Android capturaba el reporte como una imagen angosta centrada, con mucho espacio en blanco y páginas mal distribuidas.

Ahora HostReportCapture NO utiliza WebView.capturePicture. Extrae el contenido del propio reporte HTML creado por el CRM (`.report-container`, `.section-title`, `.info-item` y `.conclusion-message`), sin copiar credenciales, y NativeFullTestPdf lo compone en páginas **Carta 612×792**, con texto y líneas vectoriales, tipografía y secciones originales, ajuste de líneas, y paginación entre secciones. Si faltan secciones o excede dos páginas, se rechaza antes de imprimir. PdfComposer sigue imponiendo ambas páginas, rotadas y en orden, en una hoja A4 con los tres datos de archivo.

La composición y la paginación son una implementación nativa equivalente, no los bytes exactos de Chromium. Verificar una hoja física de un cliente de prueba antes de utilizarla como archivo oficial. No enviar reportes de clientes al repositorio ni a un servidor externo.

## Impresión 0.5.6 — orientación de anotaciones y legibilidad
- La hoja original del Full-test conserva su geometría de dos páginas por A4, sin reducir el contenido.
- Las referencias auxiliares se rotan **+90°**, en sentido opuesto al de la composición del test (-90°), para leerlas desde el lado de archivo.
- Presentador, asesor y descripción aparecen en tarjetas vectoriales discretas, con nombres en negrita, etiqueta, ícono de presentación/persona/nota y una franja roja.
- El bloque permanece en la misma zona en blanco. Si las referencias no caben, la app informa el error en vez de superponerlas al test.
- La compilación CI produce un APK **sin firma**. El artefacto instalable debe firmarse aparte con el mismo certificado de la serie 0.5.x y validar la estructura, versión y certificado.

## Ajuste visual 0.5.7

- Sin título «Referencias de salón».
- Las referencias se rotan -90°, como el Full-test original, evitando el texto invertido.
- Se ubican en una franja reservada a la derecha de la segunda página, fuera del cuestionario y del veredicto.
- No se desplazan ni achican las páginas originales: se conserva la composición de Edge.
- Antes de añadir los campos se comprueba que la zona reservada del PDF original esté realmente vacía. Si tiene contenido, se cancela la composición para no taparlo.
- Iconos vectoriales y referencias destacadas en negrita.

## 0.5.8 · Atendidas con lista completa

- Solucionado el espacio vacío debajo de los primeros tres leads: el WebView de Host estaba oculto, pero su `FrameLayout` seguía ocupando el 50% del espacio disponible debido al reparto del `layout_weight`.
- Ahora **el contenedor completo** queda `GONE` cuando se muestra el buscador, y la lista ocupa toda la altura libre. El modo «Ver CRM / Ingresar» muestra el navegador en lugar de la lista.
- Se conservan los 226 registros que reporte el CRM y el filtro por nombre se aplica a todos ellos, no solo a los visibles.
- El sondeo periódico compara los resultados antes de recrear cientos de tarjetas, evitando saltos de scroll y trabajo innecesario en Android.

## Charlas y sillas (0.6.0)

- El tablero del día se organiza en charlas con hora editable. Cada una muestra exactamente 12 sillas dispuestas en 4 columnas por 3 filas y admite crear varias charlas en el mismo día.
- Tocar una silla libre abre Atendidas en una ventana de selección; se conserva la sesión Host existente. Una vez elegido y verificado el UUID, el lead queda en esa silla y se abre su ficha.
- Tocar una silla ocupada abre las acciones **Abrir derivación / Mover a otra silla / Liberar silla · Se retiró**. Liberar requiere confirmación y **no borra la ficha ni registra nada en el CRM**.
- El UUID es único dentro del día: impide registrar el mismo lead en dos sillas accidentalmente. Existe traslado explícito.
- Los leads históricos sin charla/silla sobreviven a la actualización y se pueden ubicar desde «Personas sin silla».
- Charlas y asignaciones quedan cifradas localmente; no se envían las ubicaciones de sillas al CRM.
- La impresión y derivación oficial siguen funcionando desde la ficha, con sus confirmaciones actuales. La automatización de guardado oficial no se activa en esta versión.

## 0.6.1 · Experiencia de enrutación
- Selector de Atendidas como hoja inferior nativa de ancho completo, con esquinas redondeadas y controles compactos.
- Busca sobre toda la lista, pero dibuja hasta 32 resultados simultáneos para evitar ralentizaciones con 200+ personas.
- Verificación de nombre, teléfono y hora dentro del mismo selector; sin segunda alerta Android.
- Toque de silla ocupada abre la ficha; pulsación larga ofrece mover o liberar.
- Errores, acciones y confirmaciones usan componentes visuales propios. El diálogo de impresión Android queda solo como alternativa explícita a la Brother directa.
- No cambia los permisos del CRM ni el registro oficial de derivaciones.

## Charlas agrupadas por presentador (0.7.0)

- La segunda pestaña de navegación se llama **Charlas**, no Atendidas.
- Charlas presenta un directorio de presentadores responsables, en bloques de **cuatro tarjetas (2 × 2)**. Si hay más de cuatro presentadores, continúan en bloques adicionales desplazables.
- Al tocar un presentador aparecen **todas las charlas de ese presentador creadas hoy**. Cada charla abre su distribución de 12 sillas, conservando los UUID, el estado y los PDFs por lead.
- «Iniciar charla» solicita primero quién la da; se puede elegir una sugerencia o escribir el nombre real del presentador.
- El campo «Charla de» de cada lead asignado a una silla se carga automáticamente desde la charla. No puede sobrescribirse individualmente mientras tenga charla asignada.
- Las charlas creadas con versiones anteriores siguen guardadas; aparecen bajo **Sin asignar** hasta seleccionar quién las da. No se inventa un presentador histórico.
- Para evitar inconsistencias, una charla con test ya impreso o derivación cerrada no permite cambiar de presentador sin resolver antes el documento ya emitido.
- El rol Host y el buscador real de Atendidas siguen disponibles al tocar una silla libre. No se cambia la autenticación ni la fuente de datos del CRM.

## 0.7.2 · Asesores actualizables desde el servidor

- La lista de asesores se mantiene en `public/tablet/directory.json` y se sirve por HTTPS en `https://masduenos.laind.io/assets/tablet/directory.json`, incluso si la base de datos principal está fuera de servicio. El servidor exige revalidación de recursos sin versión; la app solicita esta lista sin caché HTTP.
- Al abrir una ficha se consulta la lista. «Actualizar asesores» permite volver a consultarla sin reiniciar ni instalar otra versión.
- La respuesta válida queda guardada en la tablet. Ante falta de conexión, una respuesta inválida o un error del servidor se conserva la última lista; la primera instalación incluye este mismo JSON como respaldo inicial. Se puede seguir escribiendo un nombre manualmente.
- Para agregar, quitar o corregir nombres, editar `advisors` en ese archivo y desplegar el servidor. **No hace falta volver a compilar o instalar el APK** en dispositivos con 0.7.2 o posterior. `version: 1` identifica el formato, no cambia con cada edición de nombres.
- `aliases` permite corregir nombres anteriores en borradores sin hoja emitida, por ejemplo `Rocio Urrea` → `Rocio Ureña`. Cada destino debe existir en `advisors`; no se cambian fichas ya enviadas a impresión, confirmadas o registradas.
- El APK 0.7.2 usa versionCode 18 y debe firmarse con el certificado original de la app, conservando datos al actualizar desde 0.7.1. Las claves privadas permanecen fuera del repositorio.
