# Más Dueños TV — firma permanente de actualizaciones

## Por qué fue necesario

Hasta la versión 1.6.9, GitHub Actions ejecutaba `assembleDebug`.
El runner generaba una nueva clave de depuración en cada ejecución.
Por eso Android rechazaba las actualizaciones instaladas sobre APK anteriores.

## Configuración inicial (una sola vez)

1. Descargá el ZIP de respaldo entregado en la conversación de ChatGPT
   (`MasDuenosTV_Respaldo_Firma_Permanente.zip`).
2. Extraé `CONFIGURAR-GITHUB-Y-RESPALDAR.txt`, que contiene el valor
   secreto de firma. **No subas este archivo ni el .p12 a GitHub.**
3. Abrí https://github.com/laindhub/control-enrutador/settings/secrets/actions
   (Settings → Secrets and variables → Actions).
4. Creá **dos repository secrets** desde **New repository secret**:
   - `TV_SIGNING_SECRET`: copiá el valor del archivo de configuración privado.
   - `TV_SIGNING_KEYSTORE_B64`: copiá TODO el contenido de
     `KEYSTORE-BASE64.txt` incluido en el ZIP de respaldo.
5. Abrí **Actions → Build Android TV APK → Run workflow** en main.

El workflow recupera la misma clave privada desde los dos secretos,
compila la versión release y verifica que la firma coincida siempre
con `certificate.sha256`. La clave privada nunca se guarda en Git.


## Reglas obligatorias

- **Jamás** usar `assembleDebug` para las APK de distribución.
- **Jamás** regenerar el `.p12` al publicar una actualización.
- Guardar el ZIP privado de respaldo en dos ubicaciones seguras.
- No subir la contraseña a issues, commits, README ni mensajes públicos.
- Aumentar `versionCode` en cada actualización, mantener
  `applicationId 'io.laind.masduenos.tv'`.
- El primer salto desde 1.6.9 o anterior requiere desinstalación porque
  la clave privada debug anterior no está disponible. Los siguientes no.
- Si falla el descifrado, faltan secrets o la firma cambió,
  la publicación debe fallar: nunca entregar una APK con firma diferente.

## Comprobación

La huella esperada está fijada en `certificate.sha256`. La verificación
usa `apksigner verify --print-certs` sobre el APK final, no la firma
que declara Gradle. Así se detecta cualquier cambio accidental de clave.
