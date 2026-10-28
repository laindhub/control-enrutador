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
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;

/** Host has its own WebView process/data directory; the user's router login stays separate. */
public final class HostActivity extends Activity {
    private static final String HOST="liniers.xn--somosmasdueos-skb.com";
    private WebView browser;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if(Build.VERSION.SDK_INT>=28)WebView.setDataDirectorySuffix("host");
        Ui.statusBars(this);
        LinearLayout root=Ui.column(this,10);root.setBackgroundColor(Color.WHITE);setContentView(root);
        TextView title=Ui.label(this,"Full-test · Host",21,true);root.addView(title);
        TextView help=Ui.label(this,"Ingresá con la cuenta autorizada de Host. Buscá el nombre, abrí la ficha y comprobá el teléfono. Después tocá «Usar esta persona».",13,false);
        help.setTextColor(Ui.MUTED);root.addView(help,Ui.spaced(this,4));
        Button choose=Ui.button(this,"Usar esta persona",true);
        choose.setOnClickListener(v->readSelection());
        root.addView(choose,Ui.spaced(this,5));
        browser=new WebView(this);
        WebSettings settings=browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                if(!request.isForMainFrame())return false;
                Uri url=request.getUrl();
                if("https".equals(url.getScheme())&&HOST.equals(url.getHost()))return false;
                if(request.hasGesture()&&"https".equals(url.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,url));
                return true;
            }
        });
        root.addView(browser,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1));
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
            "const main=document.querySelector('main');const body=(main||document.body).innerText||'';"+
            "const text=body.slice(0,4000);"+
            "const heading=text.match(/(?:Full-test|El Test del Dueño)[\\s\\S]{0,160}?Con\\s+([^\\n.]{2,100})/i)||text.match(/\\bCon\\s+([^\\n.]{2,100})/i);"+
            "const phoneLink=main?.querySelector('a[href^=tel]')?.getAttribute('href')?.replace('tel:','');"+
            "const telephone=phoneLink||text.match(/(?:teléfono|celular|móvil)\\s*[:\\-]?\\s*([+()0-9 \\-]{8,20})/i)?.[1]||'';"+
            "const entered=text.match(/\\bentr[oó]\\s+(\\d{1,2}:\\d{2})/i)?.[1]||'';"+
            "return JSON.stringify({name:heading?.[1]?.trim()||'',phone:telephone.trim(),arrival:entered,path:location.pathname});"+
            "})()";
        browser.evaluateJavascript(js,result->{
            try{
                String value=new JSONArray("["+result+"]").getString(0);
                JSONObject obj=new JSONObject(value);
                String name=obj.optString("name","").trim();
                String path=obj.optString("path","");
                if(name.length()<2||!path.startsWith("/floor/full-test")||path.equals("/floor/full-test")){
                    Toast.makeText(this,"Abrí primero el Full-test de una persona; no alcanza con la lista.",Toast.LENGTH_LONG).show();
                    return;
                }
                new android.app.AlertDialog.Builder(this).setTitle("Confirmar persona")
                    .setMessage("Nombre: "+name+"\nHora: "+obj.optString("arrival","Sin identificar")+
                      "\nTeléfono: "+obj.optString("phone","Revisar manualmente"))
                    .setNegativeButton("Volver",(d,w)->{})
                    .setPositiveButton("Usar este lead",(d,w)->{
                        Intent data=new Intent();
                        data.putExtra("leadName",name);
                        data.putExtra("leadPhone",obj.optString("phone",""));
                        data.putExtra("arrival",obj.optString("arrival",""));
                        data.putExtra("crmPath",path);
                        setResult(RESULT_OK,data);finish();
                    }).show();
            }catch(Exception error){Toast.makeText(this,"No se pudieron leer los datos de esta ficha. Confirmá que esté abierta.",Toast.LENGTH_LONG).show();}
        });
    }
    @Override public void onBackPressed(){if(browser.canGoBack())browser.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(browser!=null)browser.destroy();super.onDestroy();}
}
