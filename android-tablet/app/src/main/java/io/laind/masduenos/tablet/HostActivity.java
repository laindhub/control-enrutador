package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

/** Host has its own WebView process/data directory; the user's router login stays separate. */
public final class HostActivity extends Activity {
    private static final String HOST="liniers.xn--somosmasdueos-skb.com";
    private WebView browser;
    private HostReportCapture capture;
    private TextView captureStatus;
    private Button choose;
    private FrameLayout webHolder;
    private LoadingScreen loading;
    private final android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());
    private boolean loadingFailed=false,loginShown=false;
    private final Runnable loginWatch=()->watchLogin();
    private boolean printOnly=false,autoRequested=false;
    private boolean tabRequested=false,routeOpening=false;
    private int listAttempts=0,detailAttempts=0,recoveryAttempts=0;
    private String targetPath="",expectedName="";
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Ui.statusBars(this);
        String path=getIntent().getStringExtra("crmPath");
        if(path!=null&&path.matches("/floor/visits/[a-fA-F0-9-]{36}(?:/full-test)?")){
            printOnly=true;targetPath=path;
            expectedName=getIntent().getStringExtra("expectedName");
        }
        LinearLayout root=Ui.column(this,0);root.setBackgroundColor(Color.WHITE);
        NavigationShell.install(this,root,NavigationShell.HOST);
        LinearLayout top=Ui.column(this,12);top.setOrientation(LinearLayout.HORIZONTAL);top.setGravity(android.view.Gravity.CENTER_VERTICAL);
        TextView back=Ui.label(this,"‹",30,false);back.setGravity(android.view.Gravity.CENTER);
        back.setContentDescription("Cancelar y volver");back.setOnClickListener(v->finish());
        top.addView(back,new LinearLayout.LayoutParams(Ui.dp(this,44),Ui.dp(this,48)));
        TextView title=Ui.label(this,"Preparar test",21,true);top.addView(title);root.addView(top);
        captureStatus=Ui.label(this,"",12,false); // Internal status is never painted during extraction.
        choose=Ui.button(this,"Reintentar",true);choose.setOnClickListener(v->retryCapture());
        FrameLayout workspace=new FrameLayout(this);root.addView(workspace,new LinearLayout.LayoutParams(-1,0,1));
        FrameLayout holder=new FrameLayout(this);webHolder=holder;holder.setAlpha(0f);
        holder.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        workspace.addView(holder,new FrameLayout.LayoutParams(-1,-1));
        loading=new LoadingScreen(this);workspace.addView(loading,new FrameLayout.LayoutParams(-1,-1));
        loading.loading("Recuperando el test","En un momento vas a poder revisar la hoja.");
        capture=new HostReportCapture(this,holder);
        boolean existing=HostWebSession.initialized();
        browser=HostWebSession.attach(this,holder);
        browser.setWebChromeClient(capture.chrome());
        browser.setWebViewClient(new WebViewClient(){
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){
                if(!"/floor/login".equals(Uri.parse(url).getPath())){
                    webHolder.setAlpha(0f);webHolder.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
                    if(!loadingFailed)loading.loading("Recuperando el test","En un momento vas a poder revisar la hoja.");
                }
            }
            @Override public void onPageFinished(WebView view,String url){
                HostDesktopMode.enforce(view,()->{
                    if(!printOnly||isFinishing()||isDestroyed()||loadingFailed)return;
                    String current=Uri.parse(view.getUrl()==null?url:view.getUrl()).getPath();
                if(current==null)return;
                if(targetPath.equals(current)){
                    captureStatus.setText("Verificando Full-test de la persona seleccionada…");
                    detailAttempts=0;
                    handler.postDelayed(()->checkSelectedVisit(),450);
                }else if("/floor".equals(current)&&recoveryAttempts++<2){
                    // A direct deep-link may land on the authenticated CRM home.
                    // The session is active; recover through Host's own list.
                    captureStatus.setText("Host conectado. Recuperando Atendidas…");
                    handler.postDelayed(()->view.loadUrl("https://"+HOST+"/floor/full-test"),350);
                }else if("/floor/full-test".equals(current)){
                    captureStatus.setText("Localizando la ficha de este lead en Atendidas…");
                    handler.postDelayed(()->openVisitFromList(),650);
                }else if("/floor/login".equals(current)){
                    // This URL alone does not prove the session expired:
                    // mobile/desktop routing can briefly visit the login page.
                    captureStatus.setText("Comprobando acceso al CRM en vista de escritorio…");
                }
                });
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error){if(request.isForMainFrame())showCaptureError();}
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,android.webkit.WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400)showCaptureError();}
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(!request.isForMainFrame())return false;
                Uri url=request.getUrl();
                if("https".equals(url.getScheme())&&HOST.equals(url.getHost()))return false;
                if(request.hasGesture()&&"https".equals(url.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,url));
                return true;
            }
        });
        handler.postDelayed(loginWatch,700);
        handler.postDelayed(this::captureTimeout,45000);
        // Resume the SAME authenticated WebView used by Atendidas. The lookup
        // leaves the selected UUID open, so there is no second login or reload.
        String current=existing?Uri.parse(browser.getUrl()).getPath():null;
        if(printOnly&&targetPath.equals(current)){
            captureStatus.setText("Sesión Host recuperada. Preparando Full-test de este lead…");
            handler.postDelayed(()->checkSelectedVisit(),500);
        }else if(!existing||!"/floor/full-test".equals(current)){
            browser.loadUrl("https://"+HOST+"/floor/full-test");
        }else if(printOnly){
            handler.postDelayed(()->openVisitFromList(),500);
        }
    }
    private void openVisitFromList(){
        if(!printOnly||isFinishing()||browser==null||autoRequested||loadingFailed)return;
        if(!"/floor/full-test".equals(Uri.parse(browser.getUrl()).getPath()))return;
        if(++listAttempts>26){
            captureStatus.setText("No se encontró la visita en Atendidas. Podés revisar el CRM y reintentar.");
            showCaptureError();return;
        }
        String js="(()=>{const wanted="+JSONObject.quote(targetPath)+";"+
            "const link=[...document.querySelectorAll('a[href]')].find(a=>new URL(a.href,location.href).pathname===wanted);"+
            "if(link){link.click();return 'opened';}"+
            "const tab=[...document.querySelectorAll('button')].find(b=>/Atendidas/.test(b.textContent||''));"+
            "if(tab&&"+(!tabRequested?"true":"false")+"){tab.click();return 'tab';}"+
            "return 'waiting';})()";
        browser.evaluateJavascript(js,value->{
            if(isFinishing()||browser==null)return;
            if("\"opened\"".equals(value)){
                routeOpening=true;
                captureStatus.setText("Abriendo el Full-test correspondiente…");
                // Next.js client-side navigation does not invoke onPageFinished.
                handler.postDelayed(()->checkSelectedVisit(),650);
            }else{
                if("\"tab\"".equals(value))tabRequested=true;
                handler.postDelayed(()->openVisitFromList(),600);
            }
        });
    }
    private void checkSelectedVisit(){
        if(isFinishing()||!printOnly||autoRequested||browser==null||loadingFailed)return;
        if(++detailAttempts>22){
            captureStatus.setText("El Full-test no aparece todavía. Podés reintentar sin volver a ingresar tu PIN.");
            showCaptureError();return;
        }
        if(!targetPath.equals(Uri.parse(browser.getUrl()).getPath())){
            handler.postDelayed(()->checkSelectedVisit(),450);
            return;
        }
        browser.evaluateJavascript("(()=>{const m=document.querySelector('main');"+
            "return !!m&&[...m.querySelectorAll('button')].some(b=>/Imprimir\\s+(?:el\\s+)?Full[-\\s]?Test/i.test(b.textContent||''));})()",
            result->{
                if(isFinishing()||browser==null)return;
                if("true".equals(result)){
                    autoRequested=true;
                    readSelection();
                }else handler.postDelayed(()->checkSelectedVisit(),500);
            });
    }
    private void readSelection(){
        Uri url=Uri.parse(browser.getUrl()==null?"":browser.getUrl());
        if(!"https".equals(url.getScheme())||!HOST.equals(url.getHost())){
            UiSheets.notice(this,"Abrí una ficha del CRM antes de continuar.",true);return;
        }
        // This snippet runs only after a deliberate tap; it reads visible lead
        // information, never passwords, form PINs or authentication cookies.
        String js="(function(){"+
            "const main=document.querySelector('main')||document.body;const text=main.innerText||'';"+
            "const name=[...main.querySelectorAll('h1,h2')].map(e=>(e.textContent||'').trim()).find(t=>t.length>2&&!/full.test|Salón/i.test(t))||'';"+
            "const phone=text.match(/(?:Tel[eé]fono|Celular)\\s*([+0-9() \\-]{8,20})/i)?.[1]?.trim()||'';"+
            "const entered=text.match(/entr[oó]\\s+(\\d{1,2}:\\d{2})/i)?.[1]||'';"+
            "const print=[...main.querySelectorAll('button')].some(b=>/^Imprimir\\s+(?:el\\s+)?Full[-\\s]?Test$/i.test((b.innerText||b.textContent||'').trim()));"+
            "return JSON.stringify({name,phone,arrival:entered,path:location.pathname,print});"+
            "})()";
        browser.evaluateJavascript(js,result->{
            try{
                String value=new JSONArray("["+result+"]").getString(0);
                JSONObject obj=new JSONObject(value);
                String name=obj.optString("name","").trim();
                String path=obj.optString("path","");
                if(name.length()<2||!obj.optBoolean("print")||
                   !(path.matches("/floor/visits/[a-zA-Z0-9-]+(?:/full-test)?")||path.matches("/floor/full-test/[a-zA-Z0-9-]+"))){
                    UiSheets.notice(this,"Elegí una persona de Atendidas para capturar su test.",true);
                    return;
                }
                if(printOnly){
                    if(!targetPath.equals(path)||expectedName==null||
                        !normalizeName(expectedName).equals(normalizeName(name))){
                        captureStatus.setText("La ficha abierta no coincide con el lead elegido. No se imprimirá otro test.");
                        showCaptureError();return;
                    }
                    beginCapture(name,path,obj);
                }else{
                    UiSheets.confirm(this,"Verificar persona",
                        "Nombre: "+name+"\nHora: "+obj.optString("arrival","Sin identificar")+
                            "\nTeléfono: "+obj.optString("phone","Revisar en CRM"),
                        "Volver","Capturar test",()->beginCapture(name,path,obj));
                }
            }catch(Exception error){UiSheets.notice(this,"No se pudo leer la ficha. Revisá el CRM.",true);}
        });
    }
    private String normalizeName(String text){
        return java.text.Normalizer.normalize(text,java.text.Normalizer.Form.NFD)
            .replaceAll("\\p{M}","").toLowerCase(java.util.Locale.ROOT)
            .replaceAll("[^a-z0-9 ]"," ").replaceAll(" +"," ").trim();
    }
    private void beginCapture(String name,String path,JSONObject obj){
        captureStatus.setText("Capturando el documento original del CRM…");
        capture.arm(pdf->{
            Intent result=new Intent();
            result.putExtra("leadName",name);
            result.putExtra("leadPhone",obj.optString("phone",""));
            result.putExtra("arrival",obj.optString("arrival",""));
            result.putExtra("crmPath",path);
            result.putExtra("pdfPath",pdf.getAbsolutePath());
            setResult(RESULT_OK,result);finish();
        },message->{captureStatus.setText(message);showCaptureError();});
        browser.evaluateJavascript(
            "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Imprimir\\s+(?:el\\s+)?Full[-\\s]?Test$/i.test((x.innerText||x.textContent||'').trim()));if(!b)return false;b.click();return true;})()",
            clicked->{if(!"true".equals(clicked))showCaptureError();});
    }
    private void retryCapture(){
        handler.removeCallbacksAndMessages(null);capture.dispose();
        listAttempts=0;detailAttempts=0;recoveryAttempts=0;tabRequested=false;autoRequested=false;
        loadingFailed=false;loginShown=false;webHolder.setAlpha(0f);
        webHolder.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        loading.loading("Recuperando el test","En un momento vas a poder revisar la hoja.");
        browser.loadUrl("https://"+HOST+"/floor/full-test");
        handler.postDelayed(loginWatch,700);handler.postDelayed(this::captureTimeout,45000);
    }
    private void showCaptureError(){
        if(isFinishing()||isDestroyed())return;
        loadingFailed=true;handler.removeCallbacksAndMessages(null);capture.dispose();
        webHolder.setAlpha(0f);
        loading.error("No pudimos preparar el test","Revisá la conexión y volvé a intentar. No se imprimió ninguna hoja.",this::retryCapture);
    }
    private void captureTimeout(){if(!loginShown&&!isFinishing())showCaptureError();}
    private void watchLogin(){
        if(isFinishing()||browser==null||loadingFailed)return;
        String current=Uri.parse(browser.getUrl()==null?"":browser.getUrl()).getPath();
        if("/floor/login".equals(current)){
            browser.evaluateJavascript("!!document.querySelector('form,input[type=password],input[name=pin]')",answer->{
                if(isFinishing()||browser==null)return;
                if("true".equals(answer)){
                    loginShown=true;loading.setVisibility(View.GONE);webHolder.setAlpha(1f);
                    webHolder.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
                }
            });
        }else if(loginShown){
            loginShown=false;webHolder.setAlpha(0f);webHolder.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            loading.loading("Recuperando el test","En un momento vas a poder revisar la hoja.");
            handler.postDelayed(this::captureTimeout,45000);
            if(targetPath.equals(current))checkSelectedVisit();
            else if("/floor/full-test".equals(current))openVisitFromList();
            else browser.loadUrl("https://"+HOST+"/floor/full-test");
        }
        handler.postDelayed(loginWatch,800);
    }
    @Override public void onBackPressed(){setResult(RESULT_CANCELED);finish();}
    @Override protected void onDestroy(){
        handler.removeCallbacksAndMessages(null);
        if(capture!=null)capture.dispose();
        HostWebSession.release(this);
        browser=null;
        super.onDestroy();
    }
}
