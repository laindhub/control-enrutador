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
        LinearLayout root=Ui.column(this,12);root.setBackgroundColor(Color.WHITE);
        NavigationShell.install(this,root,NavigationShell.HOST);
        TextView title=Ui.label(this,printOnly?"Full-test · Impresión":"Full-test · Host",19,true);root.addView(title);
        TextView help=Ui.label(this,printOnly?
            "Buscando el reporte de esta persona con tu sesión Host activa…":
            "Entrá al Full-test con Host y abrí la ficha seleccionada para capturar el reporte.",13,false);
        help.setTextColor(Ui.MUTED);root.addView(help,Ui.spaced(this,4));
        choose=Ui.button(this,printOnly?"Reintentar obtención del test":"Preparar derivación y capturar test",false);
        choose.setOnClickListener(v->{
            if(printOnly){
                listAttempts=0;detailAttempts=0;tabRequested=false;autoRequested=false;
                browser.loadUrl("https://"+HOST+"/floor/full-test");
            }else readSelection();
        });
        if(printOnly)choose.setVisibility(View.GONE);
        root.addView(choose,Ui.spaced(this,5));
        captureStatus=Ui.label(this,printOnly?"Recuperando la ficha de la sesión Host…":
            "Seleccioná una persona de Atendidas para preparar su impresión.",12,false);
        captureStatus.setTextColor(Ui.MUTED);root.addView(captureStatus,Ui.spaced(this,4));
        FrameLayout holder=new FrameLayout(this);
        capture=new HostReportCapture(this,holder);
        boolean existing=HostWebSession.initialized();
        browser=HostWebSession.attach(this,holder);
        browser.setWebChromeClient(capture.chrome());
        browser.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView view,String url){
                HostDesktopMode.enforce(view,()->{
                    if(!printOnly||isFinishing()||isDestroyed())return;
                    String current=Uri.parse(view.getUrl()==null?url:view.getUrl()).getPath();
                if(current==null)return;
                if(targetPath.equals(current)){
                    captureStatus.setText("Verificando Full-test de la persona seleccionada…");
                    detailAttempts=0;
                    view.postDelayed(()->checkSelectedVisit(),450);
                }else if("/floor".equals(current)&&recoveryAttempts++<2){
                    // A direct deep-link may land on the authenticated CRM home.
                    // The session is active; recover through Host's own list.
                    captureStatus.setText("Host conectado. Recuperando Atendidas…");
                    view.postDelayed(()->view.loadUrl("https://"+HOST+"/floor/full-test"),350);
                }else if("/floor/full-test".equals(current)){
                    captureStatus.setText("Localizando la ficha de este lead en Atendidas…");
                    view.postDelayed(()->openVisitFromList(),650);
                }else if("/floor/login".equals(current)){
                    // This URL alone does not prove the session expired:
                    // mobile/desktop routing can briefly visit the login page.
                    captureStatus.setText("Comprobando acceso al CRM en vista de escritorio…");
                }
                });
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(!request.isForMainFrame())return false;
                Uri url=request.getUrl();
                if("https".equals(url.getScheme())&&HOST.equals(url.getHost()))return false;
                if(request.hasGesture()&&"https".equals(url.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,url));
                return true;
            }
        });
        root.addView(holder,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
        // Resume the SAME authenticated WebView used by Atendidas. The lookup
        // leaves the selected UUID open, so there is no second login or reload.
        String current=existing?Uri.parse(browser.getUrl()).getPath():null;
        if(printOnly&&targetPath.equals(current)){
            captureStatus.setText("Sesión Host recuperada. Preparando Full-test de este lead…");
            browser.postDelayed(()->checkSelectedVisit(),500);
        }else if(!existing||!"/floor/full-test".equals(current)){
            browser.loadUrl("https://"+HOST+"/floor/full-test");
        }else if(printOnly){
            browser.postDelayed(()->openVisitFromList(),500);
        }
    }
    private void openVisitFromList(){
        if(!printOnly||isFinishing()||browser==null||autoRequested)return;
        if(!"/floor/full-test".equals(Uri.parse(browser.getUrl()).getPath()))return;
        if(++listAttempts>26){
            captureStatus.setText("No se encontró la visita en Atendidas. Podés revisar el CRM y reintentar.");
            if(choose!=null)choose.setVisibility(View.VISIBLE);
            return;
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
                browser.postDelayed(()->checkSelectedVisit(),650);
            }else{
                if("\"tab\"".equals(value))tabRequested=true;
                browser.postDelayed(()->openVisitFromList(),600);
            }
        });
    }
    private void checkSelectedVisit(){
        if(isFinishing()||!printOnly||autoRequested||browser==null)return;
        if(++detailAttempts>22){
            captureStatus.setText("El Full-test no aparece todavía. Podés reintentar sin volver a ingresar tu PIN.");
            if(choose!=null)choose.setVisibility(View.VISIBLE);
            return;
        }
        if(!targetPath.equals(Uri.parse(browser.getUrl()).getPath())){
            browser.postDelayed(()->checkSelectedVisit(),450);
            return;
        }
        browser.evaluateJavascript("(()=>{const m=document.querySelector('main');"+
            "return !!m&&[...m.querySelectorAll('button')].some(b=>/Imprimir\\s+(?:el\\s+)?Full[-\\s]?Test/i.test(b.textContent||''));})()",
            result->{
                if(isFinishing()||browser==null)return;
                if("true".equals(result)){
                    autoRequested=true;
                    readSelection();
                }else browser.postDelayed(()->checkSelectedVisit(),500);
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
                        if(choose!=null)choose.setVisibility(View.VISIBLE);
                        return;
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
        },message->captureStatus.setText(message));
        browser.evaluateJavascript(
            "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Imprimir\\s+(?:el\\s+)?Full[-\\s]?Test$/i.test((x.innerText||x.textContent||'').trim()));if(!b)return false;b.click();return true;})()",
            clicked->{if(!"true".equals(clicked))captureStatus.setText("Tocá el botón «Imprimir el Full-Test» del CRM para capturarlo.");});
    }
    @Override public void onBackPressed(){if(browser.canGoBack())browser.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){
        if(capture!=null)capture.dispose();
        HostWebSession.release(this);
        browser=null;
        super.onDestroy();
    }
}
