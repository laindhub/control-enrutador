export async function writeAudit(
  connection,
  { userId = null, operatorId = null, action, entityType, entityId = null, details = null },
) {
  await connection.execute(
    `INSERT INTO audit_logs
      (actor_user_id, operator_id, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, operatorId, action, entityType, entityId, details ? JSON.stringify(details) : null],
  );
}
