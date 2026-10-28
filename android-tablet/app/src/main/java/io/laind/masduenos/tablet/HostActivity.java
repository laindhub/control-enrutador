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
    private boolean printOnly=false,autoRequested=false;
    private String targetPath="",expectedName="";
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.enableSlowWholeDocumentDraw();
        Ui.statusBars(this);
        String path=getIntent().getStringExtra("crmPath");
        if(path!=null&&path.matches("/floor/visits/[a-fA-F0-9-]{36}(?:/full-test)?")){
            printOnly=true;targetPath=path;
            expectedName=getIntent().getStringExtra("expectedName");
        }
        LinearLayout root=Ui.column(this,10);root.setBackgroundColor(Color.WHITE);setContentView(root);
        TextView title=Ui.label(this,printOnly?"Impresión de esta persona · Host":"Full-test · Host",21,true);root.addView(title);
        TextView help=Ui.label(this,printOnly?
            "Abriendo directamente el Full-test seleccionado. Si el CRM solicita login, ingresá con Host. El reporte se capturará automáticamente. Podés tocar el botón inferior si no se inicia.":
            "Entrá al Full-test con Host y abrí la ficha seleccionada para capturar el reporte.",13,false);
        help.setTextColor(Ui.MUTED);root.addView(help,Ui.spaced(this,4));
        Button choose=Ui.button(this,printOnly?"Capturar Full-test":"Preparar derivación y capturar test",true);
        choose.setOnClickListener(v->readSelection());
        root.addView(choose,Ui.spaced(this,5));
        captureStatus=Ui.label(this,"Seleccioná una persona de Atendidas para preparar su impresión.",12,false);
        captureStatus.setTextColor(Ui.MUTED);root.addView(captureStatus,Ui.spaced(this,4));
        FrameLayout holder=new FrameLayout(this);
        capture=new HostReportCapture(this,holder);
        browser=new WebView(this);
        WebSettings settings=browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        browser.setWebChromeClient(capture.chrome());
        browser.setWebViewClient(new WebViewClient(){
            @Override public void onPageFinished(WebView view,String url){
                Uri u=Uri.parse(url);
                if(printOnly&&!autoRequested&&targetPath.equals(u.getPath())){
                    autoRequested=true;
                    view.postDelayed(()->readSelection(),1400);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(!request.isForMainFrame())return false;
                Uri url=request.getUrl();
                if("https".equals(url.getScheme())&&HOST.equals(url.getHost()))return false;
                if(request.hasGesture()&&"https".equals(url.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,url));
                return true;
            }
        });
        holder.addView(browser,new FrameLayout.LayoutParams(-1,-1));
        root.addView(holder,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
        browser.loadUrl("https://"+HOST+(printOnly?targetPath:"/floor/full-test"));
    }
    private void readSelection(){
        Uri url=Uri.parse(browser.getUrl()==null?"":browser.getUrl());
        if(!"https".equals(url.getScheme())||!HOST.equals(url.getHost())){
            Toast.makeText(this,"Abrí una ficha del CRM antes de continuar.",Toast.LENGTH_LONG).show();return;
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
                    Toast.makeText(this,"Abrí la ficha de una persona de Atendidas, donde figure «Imprimir el Full-Test».",Toast.LENGTH_LONG).show();
                    return;
                }
                if(printOnly){
                    if(!targetPath.equals(path)||expectedName==null||
                        !normalizeName(expectedName).equals(normalizeName(name))){
                        captureStatus.setText("El nombre no coincide con el lead elegido. Volvé al tablero y revisá la ficha.");
                        return;
                    }
                    beginCapture(name,path,obj);
                }else{
                    new android.app.AlertDialog.Builder(this).setTitle("Confirmar persona")
                        .setMessage("Nombre: "+name+"\nHora: "+obj.optString("arrival","Sin identificar")+
                            "\nTeléfono: "+obj.optString("phone","Revisar manualmente"))
                        .setNegativeButton("Volver",(d,w)->{})
                        .setPositiveButton("Capturar PDF original",(d,w)->beginCapture(name,path,obj)).show();
                }
            }catch(Exception error){Toast.makeText(this,"No se pudieron leer los datos de esta ficha. Confirmá que esté abierta.",Toast.LENGTH_LONG).show();}
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
    @Override protected void onDestroy(){if(capture!=null)capture.dispose();if(browser!=null)browser.destroy();super.onDestroy();}
}
