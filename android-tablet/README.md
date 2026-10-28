# Más Dueños · Enrutador Tablet (prototipo 0.5.2)

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
