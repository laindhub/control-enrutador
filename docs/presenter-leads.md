# Entrevistas, comisiones y metas

La pestaña Leads conserva la actividad del salón y añade un panel privado por cuenta y mes. El Android lee únicamente el total mensual visible de Derivaciones, su mes y la cuenta visible en el encabezado. Se envían al iframe con origen y ventana verificados; no se leen credenciales. La lectura no depende del importador de fichas con Chromium. La primera palabra del nombre del salón debe coincidir con el usuario propio para evitar mezclar cuentas. Una lectura ausente se muestra como «Sin lectura», no como un cero confirmado.

Octubre de 2026: desbloqueo a 650, $1.350 por entrevista; élite a 780, $1.500 por entrevista. Todas las entrevistas del mes toman el valor del nivel alcanzado. Antes del desbloqueo, el acumulado es potencial y la comisión desbloqueada es cero. Los importes calculados no equivalen a pagos recibidos. No se gestiona el bono Walk-In.

Gestión permite guardar un esquema por mes. Se utiliza el último esquema con mes menor o igual al consultado; un cambio recalcula el mes correspondiente y los posteriores hasta el siguiente esquema, sin modificar comisiones de ventas ya guardadas.

Las cargas externas suman únicamente entrevistas que faltan en el salón, con fecha y referencia obligatorias. Ejemplo: total real 173, total visible 136, carga externa 37. Si luego se incorporan esas mismas entrevistas al salón, se debe eliminar la carga externa para no duplicarlas. No se importan automáticamente los números de una captura como si fueran confirmados. Los reintentos del mismo formulario usan un UUID único para evitar duplicar una carga.

Cada cuenta configura una meta personal y dos días de franco habituales. Se cuentan los días restantes del mes, incluido hoy si se trabaja. Si no se configuran francos, se muestra una estimación de 5/7 de los días calendario restantes, redondeada hacia arriba. La cantidad requerida por día se redondea hacia arriba; en meses finalizados sin días disponibles no se divide por cero. Se pueden consultar meses anteriores.

Las tablas se crean mediante la migración automática de esquema, versión 6. No hay variables de entorno nuevas. Todos los endpoints requieren sesión de presentador y las escrituras requieren CSRF. Cada cuenta ve y elimina únicamente sus propias cargas, planes y lecturas. Solo presenter_admin cambia los esquemas.
