import { syncLeadsOnce, stopLeadSync } from '../src/lead-sync.js';
import { pool } from '../src/db.js';
try { console.log(await syncLeadsOnce()); }
catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await stopLeadSync(); await pool.end(); }
