import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { pool } from './db.js';
import { config } from './config.js';

const SCHEMA_VERSION = '6';
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
    { username: config.bootstrap.presenterAdminUsername, password: config.bootstrap.presenterAdminPassword || '', role: 'presenter_admin' },
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

  const users = configuredUsers.filter(({ username, password, role }) => username && (role === 'presenter_admin' || password));

  if (!config.bootstrap.demoUsername || !config.bootstrap.demoPassword) {
    await connection.query("UPDATE users SET active = FALSE WHERE role = 'demo'");
  }
  if (!config.alphaProductionEnabled || !config.bootstrap.advisorUsername || !config.bootstrap.advisorPassword) {
    await connection.query("UPDATE users SET active = FALSE WHERE role = 'advisor'");
  }

  const names = users.map(user => user.username.toLowerCase());
  if (new Set(names).size !== names.length) throw new Error('Los usuarios configurados deben tener nombres distintos.');
  for (const user of users) {
    const [existing] = await connection.execute('SELECT id, password_hash, role, active FROM users WHERE username = ? LIMIT 1', [
      user.username,
    ]);
    if (existing.length) {
      const current = existing[0];
      if (user.role === 'presenter_admin' && current.role !== 'presenter_admin') throw new Error('El usuario administrador de presentadores ya existe con otro rol.');
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
    role ENUM('router', 'admin', 'advisor', 'demo', 'presenter', 'presenter_admin') NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `DELETE FROM users WHERE CAST(role AS CHAR) = 'ai_demo'`,

  `ALTER TABLE users
    MODIFY role ENUM('router', 'admin', 'advisor', 'demo', 'presenter', 'presenter_admin') NOT NULL`,

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
  `CREATE TABLE IF NOT EXISTS presenter_admin_audit (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_id INT UNSIGNED NOT NULL,
    target_id INT UNSIGNED NOT NULL,
    action VARCHAR(50) NOT NULL,
    record_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_presenter_admin_audit (created_at),
    FOREIGN KEY (actor_id) REFERENCES users(id),
    FOREIGN KEY (target_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS presenter_commissions (
    effective_date DATE PRIMARY KEY, amount INT UNSIGNED NOT NULL,
    updated_by INT UNSIGNED NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `INSERT IGNORE INTO presenter_commissions (effective_date,amount) VALUES ('1970-01-01',32000)`,
  `CREATE TABLE IF NOT EXISTS presenter_sales (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
    announced_date DATE NOT NULL, client_name VARCHAR(255) NOT NULL,
    phone VARCHAR(40) NULL, advisor VARCHAR(255) NOT NULL DEFAULT '',
    presenter_label VARCHAR(255) NOT NULL DEFAULT '', quota INT UNSIGNED NULL,
    commission INT UNSIGNED NOT NULL, notes TEXT NOT NULL, raw_text TEXT NOT NULL,
    fingerprint CHAR(64) NULL, source_visit_id CHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, deleted_at DATETIME NULL,
    UNIQUE KEY uq_presenter_sale (user_id,fingerprint), KEY idx_presenter_date (user_id,announced_date),
    FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS presenter_lead_policies (
    month CHAR(7) PRIMARY KEY, policy_json JSON NOT NULL, updated_by INT UNSIGNED NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `INSERT IGNORE INTO presenter_lead_policies (month,policy_json) VALUES ('2026-10','{"unlock":650,"elite":780,"baseRate":1350,"eliteRate":1500}')`,
  `CREATE TABLE IF NOT EXISTS presenter_crm_links (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    crm_name VARCHAR(120) NOT NULL,
    crm_name_key VARCHAR(120) NOT NULL UNIQUE,
    pin_cipher VARCHAR(256) NOT NULL,
    status ENUM('pending','active','invalid','error') NOT NULL DEFAULT 'pending',
    last_attempt_at DATETIME NULL,
    last_success_at DATETIME NULL,
    last_error VARCHAR(255) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS presenter_lead_snapshots (
    user_id INT UNSIGNED NOT NULL, month CHAR(7) NOT NULL, quantity INT UNSIGNED NOT NULL,
    source_label VARCHAR(255) NOT NULL DEFAULT '', captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id,month), FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS presenter_lead_entries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,user_id INT UNSIGNED NOT NULL,
    entry_date DATE NOT NULL, quantity INT UNSIGNED NOT NULL, notes VARCHAR(1000) NOT NULL,
    request_id CHAR(36) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,deleted_at DATETIME NULL,
    UNIQUE KEY uq_lead_entry (user_id,request_id),KEY idx_lead_entry (user_id,entry_date),FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS presenter_lead_plans (
    user_id INT UNSIGNED NOT NULL,month CHAR(7) NOT NULL,plan_json JSON NOT NULL,
    PRIMARY KEY (user_id,month),FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS presenter_payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id INT UNSIGNED NOT NULL,
    folder_start DATE NOT NULL, paid_date DATE NOT NULL, amount INT UNSIGNED NOT NULL,
    notes TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, deleted_at DATETIME NULL,
    KEY idx_presenter_payment (user_id,folder_start), FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

];
