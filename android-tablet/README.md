# Más Dueños · Enrutador Tablet (prototipo 0.4.0)

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
