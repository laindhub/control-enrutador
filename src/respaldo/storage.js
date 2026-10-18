import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

const env = process.env;
const required = ['RESPALDO_DB_HOST','RESPALDO_DB_USER','RESPALDO_DB_PASSWORD','RESPALDO_DB_NAME'];
export const configured = required.every(name => Boolean(env[name]));
export const db = configured ? mysql.createPool({
  host: env.RESPALDO_DB_HOST, port: Number(env.RESPALDO_DB_PORT || 3306),
  user: env.RESPALDO_DB_USER, password: env.RESPALDO_DB_PASSWORD,
  database: env.RESPALDO_DB_NAME, charset: 'utf8mb4', timezone: 'Z',
  dateStrings: true, waitForConnections: true, connectionLimit: 6,
  ssl: env.RESPALDO_DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
}) : null;
let startup;

export async function ready() {
  if (!configured) {
    const error = Error('Configuración independiente de Respaldo pendiente.');
    error.status = 503;
    throw error;
  }
  if (!startup) startup = initialize().catch(error => { startup = null; throw error; });
  return startup;
}

async function initialize() {
  await db.query(`CREATE TABLE IF NOT EXISTS respaldo_users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    role ENUM('admin','recepcion','pretest','fulltest','enrutador','asesor') NOT NULL,
    pin_hash VARCHAR(200) NOT NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_respaldo_user_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS respaldo_sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    INDEX ix_respaldo_sessions_exp (expires_at),
    FOREIGN KEY (user_id) REFERENCES respaldo_users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS respaldo_visits (
    id CHAR(36) NOT NULL PRIMARY KEY,
    visitor_name VARCHAR(200) NOT NULL,
    phone VARCHAR(50) NOT NULL DEFAULT '',
    source VARCHAR(120) NOT NULL DEFAULT '',
    promoter VARCHAR(160) NOT NULL DEFAULT '',
    continues TINYINT(1) NOT NULL,
    exit_reason VARCHAR(180) NOT NULL DEFAULT '',
    created_by INT UNSIGNED NOT NULL,
    phase ENUM('recepcion','pretest','fulltest','enrutacion','asesor','cerrada') NOT NULL DEFAULT 'recepcion',
    pretest_json JSON NULL,
    fulltest_json JSON NULL,
    routing_json JSON NULL,
    assigned_advisor_id INT UNSIGNED NULL,
    seated TINYINT(1) NULL,
    conversion_by INT UNSIGNED NULL,
    conversion_at DATETIME NULL,
    crm_status ENUM('pendiente','cargado','no_cargar') NOT NULL DEFAULT 'pendiente',
    crm_note TEXT NULL,
    crm_updated_by INT UNSIGNED NULL,
    crm_updated_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX ix_respaldo_visits_date (created_at),
    INDEX ix_respaldo_visits_phase (phase),
    INDEX ix_respaldo_visits_advisor (assigned_advisor_id),
    INDEX ix_respaldo_visits_crm (crm_status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS respaldo_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    visit_id CHAR(36) NULL,
    actor_id INT UNSIGNED NOT NULL,
    action VARCHAR(64) NOT NULL,
    details JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_respaldo_audit_visit (visit_id),
    INDEX ix_respaldo_audit_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM respaldo_users');
  if (Number(total) === 0) {
    const name = String(env.RESPALDO_ADMIN_NAME || '').trim();
    const pin = String(env.RESPALDO_ADMIN_PIN || '');
    if (!name || pin.length < 6) {
      const error = Error('Configurá RESPALDO_ADMIN_NAME y un RESPALDO_ADMIN_PIN de al menos 6 caracteres.');
      error.status = 503;
      throw error;
    }
    await db.execute('INSERT INTO respaldo_users (name,role,pin_hash) VALUES (?, ?, ?)',
      [name, 'admin', await bcrypt.hash(pin, 12)]);
  }
}

export function newVisitId() { return randomUUID(); }
export async function audit(actorId, action, visitId = null, details = null) {
  await db.execute('INSERT INTO respaldo_audit (actor_id,action,visit_id,details) VALUES (?,?,?,?)',
    [actorId, action, visitId, details ? JSON.stringify(details) : null]);
}
export function json(value) { return JSON.stringify(value ?? {}); }
export function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}
