import test from 'node:test';
import assert from 'node:assert/strict';
import {leadSyncError, browserStartupDiagnostic} from '../src/lead-sync-error.js';
test('startup diagnostics redact configured credentials and URLs and bound output',()=>{
 const result=browserStartupDiagnostic(new Error('account demo-user PIN secret-pin https://example.com/private '+ 'x'.repeat(7000)),{LEAD_SYNC_ACCOUNT_NAME:'demo-user',LEAD_SYNC_PIN:'secret-pin'});
 assert.ok(!result.includes('demo-user'));assert.ok(!result.includes('secret-pin'));
 assert.ok(!result.includes('example.com'));assert.equal(result.length,6000);
});
test('sync diagnostics distinguish browser installation, system libraries and source stages',()=>{
 assert.match(leadSyncError(new Error('spawn chromium EACCES'),'browser'),/por permisos/);
 assert.match(leadSyncError(new Error("Executable doesn't exist at private-path"),'browser'),/npm run sync:browser/);
 assert.match(leadSyncError(new Error('error while loading shared libraries: private-path'),'browser'),/bibliotecas del sistema/);
 assert.match(leadSyncError(new Error('secret PIN 1234'),'login'),/acceder al sitio/);
 assert.ok(!leadSyncError(new Error('secret PIN 1234'),'login').includes('1234'));
 assert.match(leadSyncError(new Error('timeout'),'list'),/lista de visitas/);
 assert.match(leadSyncError(new Error('timeout'),'detail'),/ficha de visita/);
});
