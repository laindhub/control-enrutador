import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10_000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: 'Z',
  dateStrings: true,
  decimalNumbers: true,
  charset: 'utf8mb4',
});

const RETRYABLE_TRANSACTION_CODES = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

export async function withTransaction(callback, { retries = 1 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let connection;
    let transactionStarted = false;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      lastError = error;
      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error('No se pudo revertir la transacción:', rollbackError);
        }
      }
      if (attempt < retries && RETRYABLE_TRANSACTION_CODES.has(error?.code)) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        continue;
      }
      throw error;
    } finally {
      connection?.release();
    }
  }

  throw lastError;
}
