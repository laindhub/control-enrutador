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
 assert.match(java,/PageInfo\.Builder\(A4_WIDTH,A4_HEIGHT,1\)/);
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
 assert.match(capture,/NativeFullTestPdf\.write/);
 assert.doesNotMatch(capture,/\.capturePicture\(|picture\.draw\(/);
 assert.match(src('app/src/main/java/io/laind/masduenos/tablet/NativeFullTestPdf.java'),/new PdfDocument/);
 assert.doesNotMatch(capture,/adapter.onLayout|adapter.onWrite/);
 assert.match(capture,/report-container/);
 assert.match(capture,/pages.getPageCount\(\)!=2/);
 assert.match(main,/getStringExtra\("pdfPath"\)/);
 assert.doesNotMatch(main,/ACTION_OPEN_DOCUMENT|Importar PDF original del CRM|choosePdf\(/);
});

test('tablet opens with the board, not the single-lead form',()=>{
 const manifest=src('app/src/main/AndroidManifest.xml');
 const dash=src('app/src/main/java/io/laind/masduenos/tablet/DashboardActivity.java');
 assert.match(manifest,/DashboardActivity" android:exported="true"/);
 assert.match(manifest,/MainActivity" android:exported="false"/);
 assert.match(dash,/Charlas de hoy/);
 assert.match(dash,/SILLA /);
 assert.match(dash,/Por imprimir/);
 assert.match(dash,/Por confirmar/);
 assert.match(dash,/HostLookupActivity/);
 assert.match(dash,/store.placeFromHost/);
 assert.match(dash,/lead.id/);
 assert.match(dash,/TalkStore.COLS/);
 assert.match(dash,/TalkStore.ROWS/);
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

test('Atendidas native picker mirrors the real Full-test list in the Host session',()=>{
 const java=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 const dash=src('app/src/main/java/io/laind/masduenos/tablet/DashboardActivity.java');
 const manifest=src('app/src/main/AndroidManifest.xml');
 assert.match(java,/Atendidas/);
 assert.match(java,/aria-pressed/);
 assert.match(java,/full-test/);
 assert.match(java,/sync\(\)/);
 assert.match(java,/candidates/);
 assert.match(java,/setResult\(RESULT_OK/);
 assert.match(java,/Confirmar persona/);
 assert.match(dash,/HostLookupActivity\.class/);
 assert.match(dash,/store.placeFromHost/);
 assert.match(manifest,/HostLookupActivity" android:exported="false" android:process=":host"/);
});
test('deferred print opens selected CRM visit and archives it under correct lead',()=>{
 const editor=src('app/src/main/java/io/laind/masduenos/tablet/MainActivity.java');
 const host=src('app/src/main/java/io/laind/masduenos/tablet/HostActivity.java');
 const store=src('app/src/main/java/io/laind/masduenos/tablet/LeadStore.java');
 assert.match(editor,/putExtra\("crmPath",draft\.crmPath\)/);
 assert.match(editor,/putExtra\("expectedName",draft\.name\)/);
 assert.match(editor,/store.attachPdf\(draft.id,file\)/);
 assert.match(host,/targetPath\.equals\(path\)/);
 assert.match(host,/printOnly/);
 assert.match(store,/sourceFile\(item\)/);
 assert.match(store,/addFromHostMetadata/);
 assert.match(store,/attachPdf/);
 assert.doesNotMatch(editor,/ACTION_OPEN_DOCUMENT/);
});

test('Host WebView process suffix is configured only once, before WebView creation',()=>{
 const manifest=src('app/src/main/AndroidManifest.xml');
 const app=src('app/src/main/java/io/laind/masduenos/tablet/TabletApplication.java');
 const lookup=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 const host=src('app/src/main/java/io/laind/masduenos/tablet/HostActivity.java');
 assert.match(manifest,/android:name="\.TabletApplication"/);
 assert.match(app,/WebView\.setDataDirectorySuffix\("host"\)/);
 assert.match(app,/process\.endsWith\(":host"\)/);
 assert.doesNotMatch(lookup,/setDataDirectorySuffix/);
 assert.doesNotMatch(host,/setDataDirectorySuffix/);
 assert.match(lookup,/safePath=uri\.getPath\(\)==null/);
});
test('mobile bottom tabs and landscape tablet dock give Host and Router fast access',()=>{
 const shell=src('app/src/main/java/io/laind/masduenos/tablet/NavigationShell.java');
 const dash=src('app/src/main/java/io/laind/masduenos/tablet/DashboardActivity.java');
 const lookup=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 const router=src('app/src/main/java/io/laind/masduenos/tablet/RouterActivity.java');
 assert.match(shell,/smallestScreenWidthDp>=600/);
 assert.match(shell,/LinearLayout\.HORIZONTAL:LinearLayout\.VERTICAL/);
 for(const label of ['Tablero','Atendidas','Enrutador'])assert.ok(shell.includes(label));
 for(const java of [dash,lookup,router])assert.match(java,/NavigationShell\.install/);
});
test('shared CRM UUID opens direct assignment in own Router session',()=>{
 const editor=src('app/src/main/java/io/laind/masduenos/tablet/MainActivity.java');
 const router=src('app/src/main/java/io/laind/masduenos/tablet/RouterActivity.java');
 assert.match(editor,/putExtra\("crmPath",draft\.crmPath\)/);
 assert.match(router,/assignment/);
 assert.match(router,/getStringExtra\("crmPath"\)/);
 assert.match(router,/returnedFromLogin/);
 assert.doesNotMatch(router,/loadUrl\(ORIGIN\+"\/floor\/visits"\)/);
});

test('Host lookup and printing attach the SAME live WebView, not two independent sessions',()=>{
 const shared=src('app/src/main/java/io/laind/masduenos/tablet/HostWebSession.java');
 const lookup=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 const host=src('app/src/main/java/io/laind/masduenos/tablet/HostActivity.java');
 const application=src('app/src/main/java/io/laind/masduenos/tablet/TabletApplication.java');
 assert.match(shared,/private static WebView shared/);
 assert.match(shared,/new WebView\(context\)/);
 assert.match(shared,/MutableContextWrapper/);
 assert.match(shared,/context\.setBaseContext\(activity\)/);
 assert.match(shared,/getBaseContext\(\)!=owner/);
 assert.match(shared,/shared\.setWebViewClient\(new WebViewClient\(\)\)/);
 assert.match(lookup,/HostWebSession\.attach\(this,webHolder\)/);
 assert.match(host,/HostWebSession\.attach\(this,holder\)/);
 assert.match(lookup,/HostWebSession\.release\(this\)/);
 assert.match(host,/HostWebSession\.release\(this\)/);
 assert.doesNotMatch(lookup,/new WebView\(this\)/);
 assert.doesNotMatch(host,/new WebView\(this\)/);
 assert.doesNotMatch(host,/browser\.destroy\(\)/);
 assert.match(application,/WebView\.enableSlowWholeDocumentDraw\(\)/);
});
test('same Host visit remains selected between picking and printing',()=>{
 const lookup=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 const host=src('app/src/main/java/io/laind/masduenos/tablet/HostActivity.java');
 assert.match(lookup,/putExtra\("crmPath",wantedPath\)/);
 assert.match(host,/targetPath\.equals\(current\)/);
 assert.match(host,/checkSelectedVisit\(\)/);
 assert.match(host,/No se encontró la visita/);
 assert.doesNotMatch(host,/browser\.loadUrl\("https:\/\/"\+HOST\+\(printOnly\?targetPath/);
});

test('Host CRM always uses desktop UA and wide viewport even on mobile',()=>{
 const desktop=src('app/src/main/java/io/laind/masduenos/tablet/HostDesktopMode.java');
 const session=src('app/src/main/java/io/laind/masduenos/tablet/HostWebSession.java');
 const lookup=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 const host=src('app/src/main/java/io/laind/masduenos/tablet/HostActivity.java');
 assert.match(desktop,/Windows NT 10\.0; Win64; x64/);
 assert.match(desktop,/setUseWideViewPort\(true\)/);
 assert.match(desktop,/setLoadWithOverviewMode\(true\)/);
 assert.match(desktop,/WIDTH=1280/);
 assert.match(desktop,/meta\[name=viewport\]/);
 assert.match(desktop,/dispatchEvent\(new Event\('resize'\)\)/);
 assert.match(session,/HostDesktopMode\.configure\(shared\)/);
 assert.match(lookup,/HostDesktopMode\.enforce\(view/);
 assert.match(host,/HostDesktopMode\.enforce\(view/);
 assert.doesNotMatch(host,/La sesión Host expiró/);
});

test('full-test uses native vector PDF from complete CRM report DOM, not a bitmap screenshot',()=>{
 const capture=src('app/src/main/java/io/laind/masduenos/tablet/HostReportCapture.java');
 const native=src('app/src/main/java/io/laind/masduenos/tablet/NativeFullTestPdf.java');
 assert.match(capture,/\.report-container/);
 assert.match(capture,/\.section-title/);
 assert.match(capture,/summary-box/);
 assert.match(capture,/info-item/);
 assert.match(capture,/conclusion-message/);
 assert.match(capture,/new JSONObject\(encoded\)/);
 assert.match(capture,/NativeFullTestPdf\.write\(report,output\)/);
 assert.doesNotMatch(capture,/\.capturePicture\(|Bitmap\.createBitmap\(|CSS_WIDTH|midpoint/);
 assert.match(native,/PageInfo.Builder\(W,H,pageCount\)/);
 assert.match(native,/if\(pageCount>=2\)/);
 assert.match(native,/finishPage\(\)/);
 assert.match(native,/cardHeight/);
 assert.match(native,/wrap\(/);
 assert.match(native,/\bINK\b/);
 assert.match(native,/throw new IOException\("El test necesita "/);
 assert.doesNotMatch(native,/Bitmap|PdfRenderer|capturePicture/);
});
test('imposition matches original Edge 2-up portrait geometry and keeps a single copy',()=>{
 const source=src('app/src/main/java/io/laind/masduenos/tablet/PdfComposer.java');
 assert.match(source,/A4_WIDTH=595,A4_HEIGHT=842/);
 assert.match(source,/slotH\+GUTTER/);
 assert.match(source,/canvas.rotate\(-90f\)/);
 assert.match(source,/page.getWidth\(\)\*factor/);
 assert.match(source,/PageInfo.Builder\(A4_WIDTH,A4_HEIGHT,1\)/);
 assert.match(source,/if\(renderer.getPageCount\(\)!=2\)/);
});
test('visual PDF proof is required before dispatching to Brother or Android',()=>{
 const source=src('app/src/main/java/io/laind/masduenos/tablet/MainActivity.java');
 const preview=source.indexOf('previewBeforePrinting(direct)');
 const send=source.indexOf('private void sendPreparedPrint(boolean direct)');
 assert.ok(preview>0&&send>preview);
 assert.match(source,/new android.widget.ImageView/);
 assert.match(source,/setNegativeButton\("Cancelar"/);
 assert.match(source,/setPositiveButton\("Imprimir 1 hoja"/);
});

test('exact extension geometry, no new header and only three added values',()=>{
 const source=src('app/src/main/java/io/laind/masduenos/tablet/PdfComposer.java');
 assert.match(source,/slotH=\(A4_HEIGHT-2\*SHEET_MARGIN-GUTTER\)\/2f/);
 assert.match(source,/SHEET_MARGIN=0f/);
 assert.match(source,/GUTTER=0f/);
 assert.match(source,/drawThreeFieldsInWhitespace/);
 assert.match(source,/Charla de:/);
 assert.match(source,/Derivado a:/);
 assert.match(source,/Descripción:/);
 assert.doesNotMatch(source,/HEADER=|drawHeader\(|HOJA DE ARCHIVO/);
 assert.doesNotMatch(source,/A4_HEIGHT-HEADER|slotH=\(A4_HEIGHT-HEADER/);
});

test('archive references match the questionnaire, stay outside content, omit heading',()=>{
 const pdf=src('app/src/main/java/io/laind/masduenos/tablet/PdfComposer.java');
 assert.doesNotMatch(pdf,/canvas\.rotate\(90f\)/);
 assert.match(pdf,/canvas\.rotate\(-90f\)/);
 assert.match(pdf,/canvas\.translate\(335f,397f\)/);
 assert.match(pdf,/drawFieldCard\(canvas,p,4f,0/);
 assert.match(pdf,/drawFieldCard\(canvas,p,80f,1/);
 assert.match(pdf,/drawFieldCard\(canvas,p,156f,2/);
 assert.match(pdf,/drawSymbol\(Canvas c,Paint p,int kind/);
 assert.match(pdf,/Typeface.BOLD/);
 assert.match(pdf,/ensureReservedWhitespaceIsBlank\(image\)/);
 assert.match(pdf,/source\.getPixel\(x,y\)/);
 assert.match(pdf,/Se canceló la impresión para no tapar datos/);
 assert.doesNotMatch(pdf,/REFERENCIAS DE SALÓN/);
 assert.match(pdf,/SHEET_MARGIN=0f/);
 assert.match(pdf,/GUTTER=0f/);
 assert.doesNotMatch(pdf,/drawHeader\(/);
});

test('Host lookup uses full-height native list instead of leaving invisible WebView half-screen',()=>{
 const lookup=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 assert.match(lookup,/private ScrollView scrolling;/);
 assert.match(lookup,/private FrameLayout webHolder;/);
 assert.match(lookup,/webHolder\.setVisibility\(show\?View\.VISIBLE:View\.GONE\)/);
 assert.match(lookup,/scrolling\.setVisibility\(show\?View\.GONE:View\.VISIBLE\)/);
 assert.doesNotMatch(lookup,/browser\.setVisibility\(show\?View\.VISIBLE:View\.GONE\)/);
 assert.match(lookup,/status\.setText\("Atendidas de hoy: "\+candidates\.size\(\)/);
});
test('4-second Host sync does not rebuild 200+ cards if no lead changed',()=>{
 const lookup=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 assert.match(lookup,/incoming\.size\(\)!=candidates\.size\(\)/);
 assert.match(lookup,/if\(changed\|\|!wasReady\)draw\(\)/);
 assert.match(lookup,/search\.addTextChangedListener/);
});

test('12-seat talk boards are persisted encrypted without losing prior lead fields',()=>{
 const talks=src('app/src/main/java/io/laind/masduenos/tablet/TalkStore.java');
 const store=src('app/src/main/java/io/laind/masduenos/tablet/LeadStore.java');
 const dash=src('app/src/main/java/io/laind/masduenos/tablet/DashboardActivity.java');
 assert.match(talks,/COLS=4,ROWS=3,CAPACITY=COLS\*ROWS/);
 assert.match(talks,/LeadStore\.encrypt/);
 assert.match(talks,/LeadStore\.decrypt/);
 assert.match(talks,/createToday/);
 assert.match(talks,/removeEmpty/);
 assert.match(dash,/for\(int r=0;r<TalkStore\.ROWS;r\+\+\)/);
 assert.match(dash,/for\(int c=0;c<TalkStore\.COLS;c\+\+\)/);
 assert.match(dash,/showChatOptions/);
 assert.match(dash,/Personas sin silla/);
 assert.match(store,/o\.put\("talkId",talkId\)/);
 assert.match(store,/o\.put\("seatIndex",seatIndex\)/);
 assert.match(store,/o\.optInt\("seatIndex",-1\)/);
});
test('unoccupied chair opens attended Host dialog and prevents duplicate UUIDs',()=>{
 const picker=src('app/src/main/java/io/laind/masduenos/tablet/HostLookupActivity.java');
 const dash=src('app/src/main/java/io/laind/masduenos/tablet/DashboardActivity.java');
 const store=src('app/src/main/java/io/laind/masduenos/tablet/LeadStore.java');
 assert.match(dash,/picker\.putExtra\("seat_picker",true\)/);
 assert.match(dash,/picker\.putExtra\("seat_number",seat\+1\)/);
 assert.match(picker,/Theme_Material_Light_Dialog_NoActionBar/);
 assert.match(picker,/FLAG_DIM_BEHIND/);
 assert.match(store,/placeFromHost/);
 assert.match(store,/visitKey\(lead\.crmPath\)/);
 assert.match(store,/Esta silla ya está ocupada/);
 assert.match(store,/El lead ya ocupa otra silla/);
});
test('occupied chair shows visible release action and preserves saved lead data',()=>{
 const dash=src('app/src/main/java/io/laind/masduenos/tablet/DashboardActivity.java');
 const store=src('app/src/main/java/io/laind/masduenos/tablet/LeadStore.java');
 assert.match(dash,/tile\.setOnClickListener\(v->showSeatOptions\(selectedLead\)\)/);
 assert.match(dash,/Liberar silla · Se retiró/);
 assert.match(dash,/setPositiveButton\("Liberar"/);
 assert.match(dash,/store\.unseat\(lead\.id\)/);
 assert.match(store,/synchronized void unseat/);
 assert.match(store,/lead\.talkId="";lead\.seatIndex=-1/);
 assert.match(store,/lead\.talkId="";lead\.seatIndex=-1/);
});
