import { syncLeadsOnce, stopLeadSync } from '../src/lead-sync.js';
import { pool } from '../src/db.js';
try {
 const result = await syncLeadsOnce();
 if (process.send) process.send({ ...result, success: !result.skipped });
 else console.log(result);
} catch (error) {
 if (process.send) process.send({success:false,authenticationPaused:Boolean(error.authenticationPaused),
  error: error.message, browserDiagnostic:error.browserDiagnostic});
 console.error(error.message); process.exitCode = 1;
} finally {
 await stopLeadSync(); await pool.end();
 if (process.connected) process.disconnect();
}
