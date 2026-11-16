# Crianza Compartida — Android + API

MVP instalable de chat entre dos adultos con modo neutral opcional por usuario.

## Reglas de neutralización

- Cada mensaje tiene un UUID generado en Android; el servidor reserva ese UUID antes de llamar a IA.
- Configuración fijada **al enviar**, no retroactiva. Alternar el modo afecta mensajes futuros.
- Si quien envía tiene modo neutral activo, ambos ven la misma edición.
- Si solo el destinatario lo tiene activo, el destinatario ve la edición y el remitente ve su original.
- Si ambos lo tienen activo, ambos ven la misma edición.
- Si ninguno lo tiene activo, ambos ven el original.
- Las ediciones son únicas, persistidas por UUID e inmutables. Un duplicado no llama de nuevo a la IA.
- Ante un error de IA, a quien le corresponde ver una edición se le muestra un error, **no el original**.
- El backend conserva el original de forma restringida porque el remitente sin modo neutral debe poder consultar su propio texto. Esto es una excepción necesaria a la idea de ocultar el original globalmente.
- Los mensajes anteriores a la activación conservan su visualización original.

## API

Requiere Python 3.11+; no hay dependencias externas. Iniciar:

\`\`\`bash
cd backend
GROQ_API_KEY=TU_CLAVE GROQ_MODEL=llama-3.3-70b-versatile python3 server.py
python3 -m unittest test_server.py
\`\`\`

Publicar tras HTTPS inverso (Nginx/Traefik); no exponer HTTP en producción.

Endpoints: /health, /api/auth/register, /api/auth/login, /api/families,
 /api/families/join, /api/families/current,
 /api/families/{id}/neutral, /api/families/{id}/messages.

Para vincular dos teléfonos: el primero crea el grupo, comparte el código
de invitación en privado, el segundo lo introduce en su cuenta.

El cliente Android solicita la URL HTTPS de la API. No se empaquetan secretos en el APK.

## Limitaciones intencionales de este primer MVP

- Aún no incluye calendario, perfiles de hijos, relevos ni notificaciones.
- Requiere desplegar este backend para intercambiar mensajes entre dispositivos.
- La IA solo responde si GROQ_API_KEY está configurada; no se falsifican ediciones.
- Polling de mensajes, no WebSockets.
- La base SQLite local y las sesiones sencillas son apropiadas para una prueba técnica; antes de utilizar datos reales de menores hacen falta despliegue, controles y auditoría de seguridad, rate limiting, recuperación de cuenta, revocación de permisos, política de retención, controles sobre mensajes con amenazas y revisión legal/privacidad.
- El proveedor IA procesa mensajes; requiere informar y obtener las autorizaciones apropiadas de ambos participantes.
- La API mantiene los originales para el caso de remitente no neutralizado y posibles obligaciones legales; no es un sistema de evidencia certificada.
- En fallo o caída tras reservar un UUID, el sistema prioriza **no invocar dos veces la IA**. Un mensaje puede quedar pendiente. No se garantiza exactamente una invocación al proveedor externo ante fallos distribuidos.
