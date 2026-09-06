import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { pool } from './db.js';
import { config } from './config.js';

const SCHEMA_VERSION = '2';
const META_TABLE_STATEMENT = `CREATE TABLE IF NOT EXISTS system_meta (
  meta_key VARCHAR(100) PRIMARY KEY,
  meta_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export async function initializeDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.query(META_TABLE_STATEMENT);
    const [versionRows] = await connection.execute(
      "SELECT meta_value FROM system_meta WHERE meta_key = 'schema_version' LIMIT 1",
    );
    if (versionRows[0]?.meta_value !== SCHEMA_VERSION) {
      for (const statement of schemaStatements) await connection.query(statement);
      await connection.query(
        "INSERT IGNORE INTO app_locks (lock_name) VALUES ('attention_create'), ('retention_cleanup')",
      );
      await setMeta(connection, 'schema_version', SCHEMA_VERSION);
    }
    await seedUsers(connection);
  } finally {
    connection.release();
  }
}

async function seedUsers(connection) {
  const configuredUsers = [
    {
      username: config.bootstrap.routerUsername,
      password: config.bootstrap.routerPassword,
      role: 'router',
    },
    {
      username: config.bootstrap.adminUsername,
      password: config.bootstrap.adminPassword,
      role: 'admin',
    },
    {
      username: config.alphaProductionEnabled ? config.bootstrap.advisorUsername : null,
      password: config.alphaProductionEnabled ? config.bootstrap.advisorPassword : null,
      role: 'advisor',
    },
    {
      username: config.bootstrap.demoUsername,
      password: config.bootstrap.demoPassword,
      role: 'demo',
    },
  ];
  const fingerprint = createHmac('sha256', config.sessionSecret)
    .update(JSON.stringify({ alphaProductionEnabled: config.alphaProductionEnabled, configuredUsers }))
    .digest('hex');
  const [fingerprintRows] = await connection.execute(
    "SELECT meta_value FROM system_meta WHERE meta_key = 'credential_fingerprint' LIMIT 1",
  );
  if (fingerprintRows[0]?.meta_value === fingerprint) return;

  const users = configuredUsers.filter(({ username, password }) => username && password);

  if (!config.bootstrap.demoUsername || !config.bootstrap.demoPassword) {
    await connection.query("UPDATE users SET active = FALSE WHERE role = 'demo'");
  }
  if (!config.alphaProductionEnabled || !config.bootstrap.advisorUsername || !config.bootstrap.advisorPassword) {
    await connection.query("UPDATE users SET active = FALSE WHERE role = 'advisor'");
  }

  for (const user of users) {
    const [existing] = await connection.execute('SELECT id, password_hash, role, active FROM users WHERE username = ? LIMIT 1', [
      user.username,
    ]);
    if (existing.length) {
      const current = existing[0];
      const passwordMatches = await bcrypt.compare(user.password, current.password_hash);
      if (passwordMatches && current.role === user.role && Boolean(current.active)) continue;
      const hash = passwordMatches ? current.password_hash : await bcrypt.hash(user.password, 12);
      await connection.execute(
        'UPDATE users SET password_hash = ?, role = ?, active = TRUE WHERE id = ?',
        [hash, user.role, current.id],
      );
      continue;
    }
    const hash = await bcrypt.hash(user.password, 12);
    await connection.execute(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [user.username, hash, user.role],
    );
  }

  await setMeta(connection, 'credential_fingerprint', fingerprint);
}

async function setMeta(connection, key, value) {
  await connection.execute(
    `INSERT INTO system_meta (meta_key, meta_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
    [key, value],
  );
}

export async function cleanupExpiredRecords() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SELECT lock_name FROM app_locks WHERE lock_name = 'retention_cleanup' FOR UPDATE");
    await connection.query('DELETE FROM audit_logs WHERE created_at < UTC_TIMESTAMP() - INTERVAL 1 YEAR');
    await connection.query('DELETE FROM attentions WHERE created_at < UTC_TIMESTAMP() - INTERVAL 1 YEAR');
    await connection.query('DELETE FROM advisor_schedules WHERE work_date < CURDATE() - INTERVAL 1 YEAR');
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS user_sessions (
    session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
    expires INT UNSIGNED NOT NULL,
    data MEDIUMTEXT COLLATE utf8mb4_bin,
    PRIMARY KEY (session_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,

  META_TABLE_STATEMENT,

  `CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('router', 'admin', 'advisor', 'demo') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `ALTER TABLE users
    MODIFY role ENUM('router', 'admin', 'advisor', 'demo') NOT NULL`,

  `CREATE TABLE IF NOT EXISTS operators (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS advisors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL UNIQUE,
    team VARCHAR(80) NOT NULL DEFAULT 'Ventas',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS advisor_schedules (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    advisor_id INT UNSIGNED NOT NULL,
    work_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_advisor_work_date (advisor_id, work_date),
    KEY idx_schedule_date_time (work_date, start_time, end_time),
    CONSTRAINT fk_schedule_advisor FOREIGN KEY (advisor_id) REFERENCES advisors(id),
    CONSTRAINT fk_schedule_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS attentions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    advisor_id INT UNSIGNED NOT NULL,
    operator_id INT UNSIGNED NOT NULL,
    created_by_user_id INT UNSIGNED NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    voided_at TIMESTAMP(3) NULL,
    voided_by_operator_id INT UNSIGNED NULL,
    voided_by_user_id INT UNSIGNED NULL,
    KEY idx_attention_created (created_at),
    KEY idx_attention_advisor_created (advisor_id, created_at, voided_at),
    KEY idx_attention_operator_created (operator_id, created_at),
    CONSTRAINT fk_attention_advisor FOREIGN KEY (advisor_id) REFERENCES advisors(id),
    CONSTRAINT fk_attention_operator FOREIGN KEY (operator_id) REFERENCES operators(id),
    CONSTRAINT fk_attention_user FOREIGN KEY (created_by_user_id) REFERENCES users(id),
    CONSTRAINT fk_void_operator FOREIGN KEY (voided_by_operator_id) REFERENCES operators(id) ON DELETE SET NULL,
    CONSTRAINT fk_void_user FOREIGN KEY (voided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT UNSIGNED NULL,
    operator_id INT UNSIGNED NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id BIGINT UNSIGNED NULL,
    details JSON NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_audit_created (created_at),
    KEY idx_audit_action (action, created_at),
    CONSTRAINT fk_audit_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_operator FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS app_locks (
    lock_name VARCHAR(80) PRIMARY KEY
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];
