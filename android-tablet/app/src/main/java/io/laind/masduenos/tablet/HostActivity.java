package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
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
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if(Build.VERSION.SDK_INT>=28)WebView.setDataDirectorySuffix("host");
        WebView.enableSlowWholeDocumentDraw();
        Ui.statusBars(this);
        LinearLayout root=Ui.column(this,10);root.setBackgroundColor(Color.WHITE);setContentView(root);
        TextView title=Ui.label(this,"Full-test · Host",21,true);root.addView(title);
        TextView help=Ui.label(this,"Ingresá con la cuenta autorizada de Host. Buscá el nombre, abrí la ficha y comprobá el teléfono. Después tocá «Usar esta persona».",13,false);
        help.setTextColor(Ui.MUTED);root.addView(help,Ui.spaced(this,4));
        Button choose=Ui.button(this,"Preparar derivación y capturar test",true);
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
        browser.loadUrl("https://"+HOST+"/floor/full-test");
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
                new android.app.AlertDialog.Builder(this).setTitle("Confirmar persona")
                    .setMessage("Nombre: "+name+"\nHora: "+obj.optString("arrival","Sin identificar")+
                      "\nTeléfono: "+obj.optString("phone","Revisar manualmente"))
                    .setNegativeButton("Volver",(d,w)->{})
                    .setPositiveButton("Capturar PDF original",(d,w)->{
                        captureStatus.setText("Abriendo el reporte original del CRM…");
                        capture.arm(pdf->{
                            Intent data=new Intent();
                            data.putExtra("leadName",name);
                            data.putExtra("leadPhone",obj.optString("phone",""));
                            data.putExtra("arrival",obj.optString("arrival",""));
                            data.putExtra("crmPath",path);
                            data.putExtra("pdfPath",pdf.getAbsolutePath());
                            setResult(RESULT_OK,data);
                            finish();
                        },message->captureStatus.setText(message));
                        browser.evaluateJavascript(
                            "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Imprimir\\s+(?:el\\s+)?Full[-\\s]?Test$/i.test((x.innerText||x.textContent||'').trim()));if(!b)return false;b.click();return true;})()",
                            clicked->{if(!"true".equals(clicked))captureStatus.setText("Tocá «Imprimir el Full-Test» en la ficha para capturarlo.");});
                        browser.postDelayed(()->captureStatus.setText("Si el reporte no se abrió, tocá el botón original «Imprimir el Full-Test» en la ficha."),5500);
                    }).show();
            }catch(Exception error){Toast.makeText(this,"No se pudieron leer los datos de esta ficha. Confirmá que esté abierta.",Toast.LENGTH_LONG).show();}
        });
    }
    @Override public void onBackPressed(){if(browser.canGoBack())browser.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(capture!=null)capture.dispose();if(browser!=null)browser.destroy();super.onDestroy();}
}
