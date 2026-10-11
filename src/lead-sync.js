import { pool } from './db.js';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { leadSyncError } from './lead-sync-error.js';
import { argentinaDate, normalizeDetail, visitId } from './lead-sync-data.js';

const ORIGIN = 'https://liniers.xn--somosmasdueos-skb.com';
let browser;
let page;
let running = false;
let timer;
let authPaused = false;
function positiveEnv(name, fallback, minimum = 1, maximum = 10000) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name}: valor inválido.`);
  return value;
}
function settings() {
  const name = process.env.LEAD_SYNC_ACCOUNT_NAME;
  const pin = process.env.LEAD_SYNC_PIN;
  if (!name || !/^\d{4}$/.test(pin || '')) throw new Error('Configurá LEAD_SYNC_ACCOUNT_NAME y LEAD_SYNC_PIN (4 dígitos).');
  return { name, pin, interval: positiveEnv('LEAD_SYNC_INTERVAL_MINUTES', 15, 5, 1440), batch: positiveEnv('LEAD_SYNC_DETAIL_BATCH', 30, 1, 100), refresh: positiveEnv('LEAD_SYNC_DETAIL_REFRESH_MINUTES', 60, 15, 1440) };
}
async function initializeTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS external_lead_visits (
    source_visit_id CHAR(36) PRIMARY KEY, source_date DATE NOT NULL,
    list_text TEXT NOT NULL, name VARCHAR(255) NULL, phone VARCHAR(40) NULL,
    advisor VARCHAR(255) NULL, promoter VARCHAR(255) NULL, detail_json JSON NULL,
    detail_synced_at DATETIME NULL, first_seen_at DATETIME NOT NULL,
    last_seen_at DATETIME NOT NULL, KEY idx_external_phone(phone), KEY idx_external_date(source_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS lead_sync_state (
    id TINYINT PRIMARY KEY, last_attempt_at DATETIME NULL, last_success_at DATETIME NULL,
    last_error VARCHAR(255) NULL, visits_seen INT NOT NULL DEFAULT 0,
    details_updated INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query('INSERT IGNORE INTO lead_sync_state (id) VALUES (1)');
}
async function openPage() {
  if (page && !page.isClosed()) return;
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= '0';
  const { chromium } = await import('playwright');
  const launchOptions = { headless: true, ...(process.env.LEAD_SYNC_CHROMIUM_PATH ? { executablePath: process.env.LEAD_SYNC_CHROMIUM_PATH } : {}) };
  try { browser = await chromium.launch(launchOptions); }
  catch (error) {
    if (process.env.LEAD_SYNC_WORKER !== 'true' || process.env.LEAD_SYNC_CHROMIUM_PATH || !/executable doesn't exist/i.test(String(error.message))) throw error;
    const require = createRequire(import.meta.url);
    const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
    const installed = spawnSync(process.execPath, [cli, 'install', 'chromium', '--only-shell'], {env:process.env,stdio:'ignore',timeout:90000});
    if (installed.status !== 0) throw error;
    browser = await chromium.launch(launchOptions);
  }
  const context = await browser.newContext({ timezoneId: 'America/Argentina/Buenos_Aires' });
  await context.route('**/*', route => ['image','media','font'].includes(route.request().resourceType()) ? route.abort() : route.continue());
  page = await context.newPage();
  page.setDefaultTimeout(20000);
}
async function ensureLogin(options) {
  await page.goto(`${ORIGIN}/floor/visits`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const today = page.getByRole('heading', { name: 'Hoy', exact: true });
  const identity = page.getByRole('heading', { name: '¿Quién sos?', exact: true });
  await today.or(identity).waitFor({ state: 'visible' });
  if (await today.isVisible()) return;
  await page.getByRole('textbox', { name: 'Buscá tu nombre' }).fill(options.name);
  await page.getByRole('button', { name: `${options.name} Liniers`, exact: true }).click();
  for (const digit of options.pin) await page.getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  try {
    await page.waitForURL(url => url.pathname === '/floor' || url.pathname === '/floor/visits', { timeout: 20000 });
  } catch {
    authPaused = true;
    const error = new Error('Acceso no confirmado. Se suspendieron los intentos de PIN hasta reiniciar.');
    error.code = 'LEAD_AUTH_PAUSED';
    throw error;
  }
  if (new URL(page.url()).pathname !== '/floor/visits') await page.goto(`${ORIGIN}/floor/visits`, { waitUntil: 'domcontentloaded' });
  await today.waitFor({ state: 'visible' });
}
async function readList() {
  await page.locator('main ul a[href*="/floor/visits/"]').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const result = await page.locator('main').evaluate(main => ({
    text: main.innerText,
    links: [...main.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), text: a.innerText }))
  }));
  if (!/personas/.test(result.text)) throw new Error('No se reconoció la lista de visitas; no se guardaron datos.');
  const seen = new Map();
  for (const link of result.links) {
    const id = visitId(link.href);
    if (id) seen.set(id, { id, text: link.text });
  }
  const count = Number(result.text.match(/(\d+)\s+personas/)?.[1]);
  if (!Number.isFinite(count) || count !== seen.size) throw new Error('La lista está incompleta o cambió durante la lectura; se reintentará en el siguiente ciclo.');
  return [...seen.values()];
}
async function readDetail(id) {
  await page.goto(`${ORIGIN}/floor/visits/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('region', { name: 'lo que pasó' }).waitFor({ state: 'visible' });
  return normalizeDetail(await page.locator('main').evaluate(main => ({
    name: main.querySelector('h1')?.innerText || '',
    summary: main.querySelector('h1 + p')?.innerText || '',
    fields: [...main.querySelectorAll('dt')].map(dt => ({ label: dt.innerText, value: dt.nextElementSibling?.tagName === 'DD' ? dt.nextElementSibling.innerText : '' })),
    timeline: main.querySelector('[aria-label="lo que pasó"]')?.innerText || main.querySelector('section')?.innerText || main.innerText
  })));
}
export async function syncLeadsOnce() {
  if (running || authPaused) return { skipped: true, authenticationPaused: authPaused };
  running = true;
  let connection;
  let locked = false;
  let stage = 'config';
  try {
    const options = settings();
    stage = 'database';
    await initializeTables();
    connection = await pool.getConnection();
    const [lock] = await connection.query("SELECT GET_LOCK('external_leads_sync', 0) AS acquired");
    locked = Number(lock[0].acquired) === 1;
    if (!locked) return { skipped: true };
    await connection.query('UPDATE lead_sync_state SET last_attempt_at = UTC_TIMESTAMP() WHERE id = 1');
    stage = 'browser';
    await openPage();
    stage = 'login';
    await ensureLogin(options);
    const date = argentinaDate();
    stage = 'list';
    const visits = await readList();
    if (date !== argentinaDate()) throw new Error('Cambio de día durante la lectura.');
    stage = 'database';
    await connection.beginTransaction();
    try {
      for (const visit of visits) await connection.execute(`INSERT INTO external_lead_visits
        (source_visit_id, source_date, list_text, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE list_text = VALUES(list_text), last_seen_at = UTC_TIMESTAMP()`, [visit.id, date, visit.text]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    const [pending] = await connection.execute(`SELECT source_visit_id FROM external_lead_visits
      WHERE (detail_synced_at IS NULL OR (source_date = ? AND detail_synced_at < UTC_TIMESTAMP() - INTERVAL ? MINUTE))
      ORDER BY EXISTS (SELECT 1 FROM presenter_sales ps WHERE ps.source_visit_id=external_lead_visits.source_visit_id AND ps.deleted_at IS NULL) DESC, detail_synced_at, first_seen_at LIMIT ?`, [date, options.refresh, options.batch]);
    let updated = 0;
    for (const row of pending) {
      stage = 'detail';
      const detail = await readDetail(row.source_visit_id);
      stage = 'database';
      await connection.execute(`UPDATE external_lead_visits SET name = ?, phone = ?, advisor = ?, promoter = ?, detail_json = ?, detail_synced_at = UTC_TIMESTAMP() WHERE source_visit_id = ?`, [detail.name, detail.phone, detail.advisor, detail.promoter, JSON.stringify(detail), row.source_visit_id]);
      updated++;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    await connection.execute('UPDATE lead_sync_state SET last_success_at = UTC_TIMESTAMP(), last_error = NULL, visits_seen = ?, details_updated = ? WHERE id = 1', [visits.length, updated]);
    const [counts] = await connection.query('SELECT COUNT(*) AS remaining FROM external_lead_visits WHERE detail_synced_at IS NULL');
    return { visits: visits.length, details: updated, remaining: Number(counts[0].remaining) };
  } catch (error) {
    // No imprimir errores del navegador: podrían incluir valores introducidos o datos de clientes.
    const message = leadSyncError(error, stage);
    if (locked) await connection.execute('UPDATE lead_sync_state SET last_error = ? WHERE id = 1', [message]).catch(() => {});
    await browser?.close().catch(() => {});
    browser = undefined; page = undefined;
    throw Object.assign(new Error(message), { authenticationPaused: authPaused });
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('external_leads_sync')").catch(() => {});
    connection?.release();
    running = false;
  }
}
export function startLeadSync() {
  if (process.env.LEAD_SYNC_ENABLED !== 'true' || timer) return;
  const options = settings();
  const run = () => syncLeadsOnce().then(result => console.log('Sincronización de leads:', result)).catch(error => console.error(error.message));
  run();
  timer = setInterval(run, options.interval * 60000);
  timer.unref();
}
export async function stopLeadSync() {
  clearInterval(timer); timer = undefined;
  await browser?.close(); browser = undefined; page = undefined;
}
