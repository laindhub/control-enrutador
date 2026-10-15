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
- Atrás del control Android TV regresa al menú nativo; teclado Esc sale del
  modo presentación. El cursor permanece oculto durante la exposición.

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
