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
