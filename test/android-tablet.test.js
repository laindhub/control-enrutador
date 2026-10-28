import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../android-tablet/'+p,import.meta.url),'utf8');
test('tablet APK is independent from Salon with isolated Host WebView process',()=>{
 const manifest=src('app/src/main/AndroidManifest.xml');
 assert.match(manifest,/io\.laind\.masduenos\.tablet/);
 assert.match(manifest,/<activity android:name="\.HostActivity" android:exported="false" android:process=":host"/);
 assert.match(manifest,/android:allowBackup="false"/);
});
test('PDF is local-only, one A4 sheet, never sent to our website',()=>{
 const java=src('app/src/main/java/io/laind/masduenos/tablet/PdfComposer.java');
 assert.match(java,/PageInfo\.Builder\(595,842,1\)/);
 assert.match(java,/PdfRenderer/);
 assert.match(java,/Charla de:/);
 assert.match(java,/Derivado a:/);
 assert.match(java,/Descripción:/);
 assert.ok(!java.includes('http://masduenos.laind.io'));
});
test('confirmation is not an automatic CRM POST and requires printing first',()=>{
 const java=src('app/src/main/java/io/laind/masduenos/tablet/MainActivity.java');
 assert.match(java,/printAttempted/);
 assert.match(java,/Completar derivación/);
 assert.match(java,/RouterActivity\.class/);
 assert.ok(!java.includes('/api/derivar'));
});
test('IPP direct printing is limited to private IPs and has Android fallback',()=>{
 const java=src('app/src/main/java/io/laind/masduenos/tablet/PrintController.java');
 assert.match(java,/isPrivateIPv4/);
 assert.match(java,/application\/pdf/);
 assert.match(java,/PrintManager/);
 assert.match(java,/one-sided/);
});

test('Host report is captured from the original popup without importing files',()=>{
 const host=src('app/src/main/java/io/laind/masduenos/tablet/HostActivity.java');
 const capture=src('app/src/main/java/io/laind/masduenos/tablet/HostReportCapture.java');
 const main=src('app/src/main/java/io/laind/masduenos/tablet/MainActivity.java');
 assert.match(host,/new HostReportCapture/);
 assert.match(host,/Capturar PDF original/);
 assert.ok(host.includes('Imprimir'));
 assert.match(capture,/onCreateWindow/);
 assert.match(capture,/capturePicture/);
 assert.match(capture,/new PdfDocument/);
 assert.doesNotMatch(capture,/adapter.onLayout|adapter.onWrite/);
 assert.match(capture,/report-container/);
 assert.match(capture,/renderer.getPageCount\(\)!=2/);
 assert.match(src('app/src/main/java/io/laind/masduenos/tablet/DashboardActivity.java'),/getStringExtra\("pdfPath"\)/);
 assert.doesNotMatch(main,/ACTION_OPEN_DOCUMENT|Importar PDF original del CRM|choosePdf\(/);
});

test('tablet opens with the board, not the single-lead form',()=>{
 const manifest=src('app/src/main/AndroidManifest.xml');
 const dash=src('app/src/main/java/io/laind/masduenos/tablet/DashboardActivity.java');
 assert.match(manifest,/DashboardActivity" android:exported="true"/);
 assert.match(manifest,/MainActivity" android:exported="false"/);
 assert.match(dash,/Buscar en Host/);
 assert.match(dash,/Personas en gestión/);
 assert.match(dash,/Por imprimir/);
 assert.match(dash,/Por confirmar/);
 assert.match(dash,/getStringExtra\("pdfPath"\)/);
 assert.match(dash,/store.addFromHost/);
 assert.match(dash,/lead.id/);
 assert.match(dash,/getResources\(\).getConfiguration\(\).orientation/);
});
test('each lead has an encrypted persisted draft and its own protected PDF',()=>{
 const store=src('app/src/main/java/io/laind/masduenos/tablet/LeadStore.java');
 const editor=src('app/src/main/java/io/laind/masduenos/tablet/MainActivity.java');
 assert.match(store,/AndroidKeyStore/);
 assert.match(store,/AES\/GCM\/NoPadding/);
 assert.match(store,/getFilesDir\(\)/);
 assert.match(store,/UUID.randomUUID\(\)/);
 assert.match(store,/source.pdf/);
 assert.match(store,/archive.pdf/);
 assert.match(editor,/store.archiveFile\(draft\)/);
 assert.match(editor,/saveDraft\(\)/);
 assert.match(editor,/onPause\(\)/);
 assert.match(editor,/Volver al tablero/);
});
test('printing and CRM completion are distinct confirmed states',()=>{
 const editor=src('app/src/main/java/io/laind/masduenos/tablet/MainActivity.java');
 const control=src('app/src/main/java/io/laind/masduenos/tablet/PrintController.java');
 assert.match(editor,/confirmPaper\(\)/);
 assert.match(editor,/markRegistered\(\)/);
 assert.match(editor,/LeadStore.PAPER/);
 assert.match(editor,/LeadStore.DONE/);
 assert.match(editor,/CRM oficial/);
 assert.match(control,/Consumer<Result>/);
 assert.match(control,/new Result\(false/);
});
