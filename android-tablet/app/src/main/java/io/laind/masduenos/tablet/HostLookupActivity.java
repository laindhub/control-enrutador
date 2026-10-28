package io.laind.masduenos.tablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Locale;

/** Fast native search, fed by the authorized live Host "Atendidas" DOM.
 * No CRM credentials or client lists are transmitted to our backend.
 */
public final class HostLookupActivity extends Activity {
    static final String HOST="liniers.xn--somosmasdueos-skb.com";
    static final String ORIGIN="https://"+HOST;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ArrayList<Item> candidates=new ArrayList<>();
    private final Runnable poll=()->sync();
    private WebView browser;
    private LinearLayout root,results;
    private EditText search;
    private TextView status;
    private Button toggle;
    private boolean selecting=false,ready=false,manual=false;
    private String wantedPath="";
    private int detailTries=0;
    private static final class Item {
        String name,time,path;
        Item(String name,String time,String path){this.name=name;this.time=time;this.path=path;}
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        if(Build.VERSION.SDK_INT>=28)WebView.setDataDirectorySuffix("host");
        Ui.statusBars(this);
        root=Ui.column(this,16);root.setBackgroundColor(Color.WHITE);setContentView(root);
        root.addView(Ui.label(this,"Atendidas · Full-test",24,true));
        status=Ui.label(this,"Conectando a la sesión de Host…",13,false);
        status.setTextColor(Ui.MUTED);root.addView(status,Ui.spaced(this,7));
        LinearLayout buttons=new LinearLayout(this);
        Button refresh=Ui.button(this,"Actualizar lista",false);
        refresh.setOnClickListener(v->{
            if(selecting)return;
            if(!ready){showBrowser();return;}
            browser.evaluateJavascript("(()=>{const b=[...document.querySelectorAll('button')].find(x=>/actualizar lista/i.test(x.textContent||''));if(b)b.click();return !!b})()",v2->{
                handler.postDelayed(this::sync,900);
            });
        });
        buttons.addView(refresh,new LinearLayout.LayoutParams(0,Ui.dp(this,50),1));
        toggle=Ui.button(this,"Ver CRM / Ingresar",false);
        toggle.setOnClickListener(v->{manual=!manual;showBrowser();});
        LinearLayout.LayoutParams toggleParams=new LinearLayout.LayoutParams(0,Ui.dp(this,50),1);
        toggleParams.leftMargin=Ui.dp(this,8);buttons.addView(toggle,toggleParams);
        root.addView(buttons,Ui.spaced(this,9));
        search=new EditText(this);
        search.setSingleLine(true);search.setTextSize(16);search.setHint("Buscar persona por nombre…");
        search.setPadding(Ui.dp(this,15),Ui.dp(this,10),Ui.dp(this,15),Ui.dp(this,10));
        search.setBackground(Ui.bg(this,Color.WHITE,13,Ui.LINE));
        root.addView(search,Ui.spaced(this,12));
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int a,int c,int after){}
            public void onTextChanged(CharSequence s,int a,int before,int count){draw();}
            public void afterTextChanged(Editable s){}
        });
        ScrollView scrolling=new ScrollView(this);
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);
        scrolling.addView(results);root.addView(scrolling,new LinearLayout.LayoutParams(-1,0,1));
        browser=new WebView(this);
        WebSettings config=browser.getSettings();
        config.setJavaScriptEnabled(true);config.setDomStorageEnabled(true);
        config.setAllowFileAccess(false);config.setAllowContentAccess(false);
        config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if(!req.isForMainFrame())return false;
                Uri uri=req.getUrl();
                if("https".equals(uri.getScheme())&&HOST.equals(uri.getHost()))return false;
                return true;
            }
            @Override public void onPageFinished(WebView view,String url){
                handler.removeCallbacks(poll);handler.postDelayed(poll,600);
            }
        });
        LinearLayout.LayoutParams webParams=new LinearLayout.LayoutParams(-1,0,1);
        root.addView(browser,webParams);
        browser.loadUrl(ORIGIN+"/floor/full-test");
        showBrowser();
    }
    private void showBrowser(){
        boolean show=manual||!ready;
        browser.setVisibility(show?View.VISIBLE:View.GONE);
        search.setVisibility(show?View.GONE:View.VISIBLE);
        results.setVisibility(show?View.GONE:View.VISIBLE);
        toggle.setText(show?"Mostrar buscador":"Ver CRM / Ingresar");
        if(show&&browser.getVisibility()==View.VISIBLE)status.setText("Si Liniers solicita acceso, ingresá con el PIN autorizado de Host.");
    }
    private void sync(){
        if(isFinishing()||browser==null)return;
        handler.removeCallbacks(poll);
        if(selecting){readSelected();return;}
        Uri uri=Uri.parse(browser.getUrl()==null?"":browser.getUrl());
        if(!"https".equals(uri.getScheme())||!HOST.equals(uri.getHost())){status.setText("La sesión de Host no está disponible.");return;}
        if(!uri.getPath().startsWith("/floor/full-test")){
            if(uri.getPath().equals("/floor")){
                // Host login normally redirects to the Salón landing page.
                // Go straight to Full-test without another manual navigation.
                status.setText("Abriendo Atendidas con tu sesión Host…");
                browser.loadUrl(ORIGIN+"/floor/full-test");
                return;
            }
            if(uri.getPath().equals("/floor/login")){
                ready=false;showBrowser();
                status.setText("Ingresá con el PIN de Host para activar el buscador.");
            }
            handler.postDelayed(poll,4000);return;
        }
        // React tab is a button with aria-pressed. The list cards are links
        // to /floor/visits/<uuid>[/full-test], as in the original Full-test JS.
        String script="(()=>{const m=document.querySelector('main');if(!m)return JSON.stringify({ready:false});"+
            "const btn=[...m.querySelectorAll('button')].find(x=>(x.textContent||'').trim().startsWith('Atendidas'));"+
            "if(!btn)return JSON.stringify({ready:false});"+
            "if(btn.getAttribute('aria-pressed')!=='true'){btn.click();return JSON.stringify({ready:true,changing:true});}"+
            "const items=[...m.querySelectorAll('a[href]')].map(a=>{const p=new URL(a.href,location.href).pathname;"+
            "if(!/^\\/floor\\/visits\\/[0-9a-f-]{36}(?:\\/full-test)?$/i.test(p))return null;"+
            "const cells=a.children;const name=(cells[1]?.querySelector('span')?.textContent||'').trim();"+
            "const time=(cells[cells.length-1]?.textContent||'').trim();"+
            "return name?{name:name.slice(0,120),time:time.slice(0,24),path:p}:null}).filter(Boolean);"+
            "return JSON.stringify({ready:true,items});})()";
        browser.evaluateJavascript(script,raw->{
            try{
                String serialized=new JSONArray("["+raw+"]").getString(0);
                JSONObject payload=new JSONObject(serialized);
                if(!payload.optBoolean("ready")){ready=false;showBrowser();status.setText("Entrá al Full-test con el rol autorizado de Host.");}
                else if(!payload.optBoolean("changing")){
                    candidates.clear();JSONArray rows=payload.optJSONArray("items");
                    if(rows!=null)for(int i=0;i<rows.length();i++){
                        JSONObject r=rows.getJSONObject(i);
                        String path=r.optString("path"),name=r.optString("name");
                        if(path.matches("/floor/visits/[0-9a-f-]{36}(?:/full-test)?")&&name.length()>1)
                            candidates.add(new Item(name,r.optString("time"),path));
                    }
                    ready=true;
                    if(!manual)showBrowser();
                    status.setText("Atendidas de hoy: "+candidates.size()+" · Sesión Host · actualización automática");
                    draw();
                }
            }catch(Exception e){status.setText("No pudimos leer Atendidas. Podés abrir la pantalla original.");}
            handler.postDelayed(poll,4200);
        });
    }
    private void draw(){
        if(results==null)return;
        results.removeAllViews();
        String q=search.getText().toString().trim().toLowerCase(Locale.ROOT);
        int shown=0;
        for(Item item:candidates){
            if(!item.name.toLowerCase(Locale.ROOT).contains(q))continue;
            shown++;
            LinearLayout card=Ui.column(this,13);
            card.setBackground(Ui.bg(this,Color.WHITE,15,Ui.LINE));
            LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);
            TextView name=Ui.label(this,item.name,17,true);
            heading.addView(name,new LinearLayout.LayoutParams(0,-2,1));
            TextView time=Ui.label(this,item.time,12,false);time.setTextColor(Ui.MUTED);heading.addView(time);
            card.addView(heading);
            TextView caption=Ui.label(this,"Verificar teléfono y preparar derivación →",12,false);caption.setTextColor(Ui.RED);
            card.addView(caption,Ui.spaced(this,6));
            card.setOnClickListener(v->select(item));
            results.addView(card,Ui.spaced(this,9));
        }
        if(shown==0){
            TextView empty=Ui.label(this,ready?"No hay coincidencias entre las Atendidas del día.":"Ingresá a Host para consultar las Atendidas.",14,false);
            empty.setTextColor(Ui.MUTED);results.addView(empty,Ui.spaced(this,18));
        }
    }
    private void select(Item item){
        if(selecting)return;
        selecting=true;wantedPath=item.path;detailTries=0;
        status.setText("Verificando "+item.name+" en el CRM…");
        browser.loadUrl(ORIGIN+wantedPath);
    }
    private void readSelected(){
        if(!selecting||browser==null)return;
        if(detailTries++>12){selecting=false;status.setText("No pudimos verificar la ficha. Volvé a Atendidas.");browser.loadUrl(ORIGIN+"/floor/full-test");return;}
        Uri page=Uri.parse(browser.getUrl()==null?"":browser.getUrl());
        if(!wantedPath.equals(page.getPath())){handler.postDelayed(poll,500);return;}
        String script="(()=>{const m=document.querySelector('main');if(!m)return JSON.stringify({ready:false});"+
            "const text=m.innerText||'';const name=(m.querySelector('h1')?.textContent||'').trim();"+
            "const phone=(text.match(/Tel[eé]fono\\s*\\n?\\s*([+()0-9 \\-]{8,20})/i)?.[1]||'').trim();"+
            "const arrival=(text.match(/entr[oó]\\s+(\\d{1,2}:\\d{2})/i)?.[1]||'').trim();"+
            "return JSON.stringify({ready:name.length>1,name,phone,arrival});})()";
        browser.evaluateJavascript(script,raw->{
            try{
                JSONObject data=new JSONObject(new JSONArray("["+raw+"]").getString(0));
                if(!data.optBoolean("ready")){handler.postDelayed(poll,600);return;}
                new AlertDialog.Builder(this).setTitle("Confirmar persona")
                    .setMessage("Nombre: "+data.optString("name")+
                        "\nHora: "+data.optString("arrival","—")+
                        "\nTeléfono: "+(data.optString("phone").isEmpty()?"Revisar en ficha":data.optString("phone"))+
                        "\n\nEl Full-test se capturará recién al imprimir.")
                    .setNegativeButton("Volver",(d,w)->{
                        selecting=false;browser.loadUrl(ORIGIN+"/floor/full-test");})
                    .setPositiveButton("Preparar derivación",(d,w)->{
                        Intent result=new Intent();
                        result.putExtra("leadName",data.optString("name"));
                        result.putExtra("leadPhone",data.optString("phone"));
                        result.putExtra("arrival",data.optString("arrival"));
                        result.putExtra("crmPath",wantedPath);
                        setResult(RESULT_OK,result);finish();
                    }).show();
            }catch(Exception error){handler.postDelayed(poll,500);}
        });
    }
    @Override public void onBackPressed(){
        if(manual){manual=false;showBrowser();return;}
        super.onBackPressed();
    }
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);if(browser!=null)browser.destroy();super.onDestroy();}
}
