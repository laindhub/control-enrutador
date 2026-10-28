# Más Dueños · Enrutador Tablet (prototipo 0.1.0)

Proyecto Android dedicado para Samsung Galaxy Tab A8; **no modifica** la app existente de Salón.

## Primer alcance implementado
- Perfil Host mediante WebView aislada en el proceso Android `:host`, con su propia sesión y cookies.
- Perfil Enrutador mediante WebView en el proceso principal. El PIN se escribe únicamente en el CRM original. Ninguna credencial se transfiere a LAIND.
- Captura asistida de una ficha seleccionada en Host (nombre, hora, teléfono si se muestra). **El usuario debe confirmar visualmente los datos y completar los campos propios**.
- Preparación de «Charla de», «Derivado a» y «Descripción» en la pantalla principal.
- Importación manual del PDF original descargado del CRM; composición local de dos páginas en una hoja A4, con bloque de referencia de la derivación. Una copia, una cara.
- Impresión directa IPP por red local (tentativa; depende de soporte de PDF e IPP en Brother) o diálogo de impresión Android como respaldo.
- Solo después de iniciar el proceso de impresión se habilita el paso para abrir el CRM con el perfil Enrutador.

## Límites / siguientes pasos
- Esta versión **no automatiza el envío de la derivación**. Abre el CRM en su sesión de Enrutador y la operación final se ejecuta manualmente. No existe aún un contrato de API ni selectores verificados para guardar una derivación de forma automática.
- La primera versión requiere importar el PDF del CRM desde Archivos; captura directa del PDF generado por el botón original es una etapa posterior, a validar dentro del WebView.
- «Impresión iniciada» no significa que la impresora haya producido físicamente el papel. La confirmación debe ser explícita.
- Se debe probar IPP en la red real de Más Dueños con la Brother DCP-L5650DN. Dirección inicial 192.168.2.33, editable. Si falla, Android PrintManager permite la impresión convencional.
- Nunca incluir PDFs reales, PII de clientes, PINes, cookies o claves en GitHub.

## Compilar
Java 17, Android SDK 35. Ejecutar `gradle :app:assembleRelease` desde `android-tablet/`.
La CI genera un APK **sin firma**, no instalable directamente. Firmarlo con una clave de distribución privada antes de instalar.
