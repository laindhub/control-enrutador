import test from 'node:test';
import assert from 'node:assert/strict';
import {leadSyncError} from '../src/lead-sync-error.js';
test('sync diagnostics distinguish browser installation, system libraries and source stages',()=>{
 assert.match(leadSyncError(new Error("Executable doesn't exist at private-path"),'browser'),/npm run sync:browser/);
 assert.match(leadSyncError(new Error('error while loading shared libraries: private-path'),'browser'),/bibliotecas del sistema/);
 assert.match(leadSyncError(new Error('secret PIN 1234'),'login'),/acceder al sitio/);
 assert.ok(!leadSyncError(new Error('secret PIN 1234'),'login').includes('1234'));
 assert.match(leadSyncError(new Error('timeout'),'list'),/lista de visitas/);
 assert.match(leadSyncError(new Error('timeout'),'detail'),/ficha de visita/);
});
