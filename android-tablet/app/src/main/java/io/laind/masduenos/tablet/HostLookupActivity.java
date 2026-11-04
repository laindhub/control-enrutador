package io.laind.masduenos.tablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
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
import android.widget.FrameLayout;
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
    private LinearLayout root,results,actions,reviewPanel;
    private TextView resultSummary;
    private ScrollView scrolling;
    private FrameLayout webHolder,workspace;
    private LoadingScreen loading;
    private boolean loginRequired=false,loadTimedOut=false;
    private static String lastListDate="";
    private int scanGeneration;
    private Runnable loadingDeadline;
    private EditText search;
    private TextView status;
    private Button toggle;
    private JSONObject reviewed;
    private boolean selecting=false,ready=false,manual=false,seatPicker=false;
    private String wantedPath="";
    private int detailTries=0;
    private static final class Item {
        String name,time,path;
        Item(String name,String time,String path){this.name=name;this.time=time;this.path=path;}
    }
    @Override public void onCreate(Bundle state){
        seatPicker=getIntent().getBooleanExtra("seat_picker",false);
        if(seatPicker)setTheme(android.R.style.Theme_Material_Light_Dialog_NoActionBar);
        super.onCreate(state);
        Ui.statusBars(this);
        root=Ui.column(this,seatPicker?15:16);
        root.setBackgroundColor(Color.WHITE);
        if(seatPicker){
            android.graphics.drawable.GradientDrawable surface=new android.graphics.drawable.GradientDrawable();
            surface.setColor(Color.WHITE);
            float curve=Ui.dp(this,26);
            surface.setCornerRadii(new float[]{curve,curve,curve,curve,0,0,0,0});
            root.setBackground(surface);
            setContentView(root);
            android.util.DisplayMetrics metrics=getResources().getDisplayMetrics();
            android.view.Window window=getWindow();
            window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            window.setDimAmount(.34f);
            window.setNavigationBarColor(Color.WHITE);
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
            android.view.WindowManager.LayoutParams layout=window.getAttributes();
            layout.width=-1;
            layout.height=Math.min((int)(metrics.heightPixels*.83f),Ui.dp(this,800));
            layout.gravity=Gravity.BOTTOM;
            window.setAttributes(layout);
            View grip=new View(this);
            grip.setBackground(Ui.bg(this,Color.rgb(205,205,205),4,0));
            LinearLayout.LayoutParams g=new LinearLayout.LayoutParams(Ui.dp(this,42),Ui.dp(this,4));
            g.gravity=Gravity.CENTER_HORIZONTAL;g.bottomMargin=Ui.dp(this,15);
            root.addView(grip,g);
        }else NavigationShell.install(this,root,NavigationShell.HOST);
        String heading=seatPicker?
            getIntent().getStringExtra("talk_name")+" · Silla "+getIntent().getIntExtra("seat_number",0):
            "Atendidas · Full-test";
        LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL);
        TextView headingView=Ui.label(this,seatPicker?"Elegir de Atendidas":heading,seatPicker?22:24,true);
        top.addView(headingView,new LinearLayout.LayoutParams(0,-2,1));
        if(seatPicker){
            TextView close=Ui.label(this,"✕",21,false);
            close.setTextColor(Ui.MUTED);close.setGravity(Gravity.CENTER);
            close.setBackground(Ui.bg(this,Color.rgb(246,246,246),15,0));
            close.setOnClickListener(v->finish());
            top.addView(close,new LinearLayout.LayoutParams(Ui.dp(this,42),Ui.dp(this,42)));
        }
        root.addView(top);
        if(seatPicker){
            TextView seatInfo=Ui.label(this,heading,13,false);
            seatInfo.setTextColor(Ui.MUTED);
            root.addView(seatInfo,Ui.spaced(this,3));
        }
        status=Ui.label(this,"Conectando a la sesión de Host…",13,false);
        status.setTextColor(Ui.MUTED);root.addView(status,Ui.spaced(this,7));
        reviewPanel=Ui.column(this,15);
        reviewPanel.setBackground(Ui.bg(this,Color.rgb(248,248,248),19,Ui.LINE));
        reviewPanel.setVisibility(View.GONE);
        root.addView(reviewPanel,Ui.spaced(this,13));
        actions=new LinearLayout(this);
        LinearLayout buttons=actions;
        Button refresh=Ui.button(this,"Actualizar lista",false);
        refresh.setOnClickListener(v->{
            if(selecting)return;
            if(!ready){restartLoading();return;}
            ready=false;loadTimedOut=false;manual=false;showBrowser();armLoadingTimeout();
            final int scan=++scanGeneration;
            browser.evaluateJavascript("(()=>{const b=[...document.querySelectorAll('button')].find(x=>/actualizar lista/i.test(x.textContent||''));if(b)b.click();return !!b})()",v2->{
                if(isFinishing()||isDestroyed()||browser==null||scan!=scanGeneration)return;
                if(!"true".equals(v2))browser.loadUrl(ORIGIN+"/floor/full-test");
                handler.postDelayed(this::sync,900);
            });
        });
        buttons.addView(refresh,new LinearLayout.LayoutParams(0,Ui.dp(this,50),1));
        toggle=Ui.button(this,seatPicker?"Iniciar sesión Host":"Ver CRM / Ingresar",false);
        toggle.setOnClickListener(v->{
            if(manual||loginRequired){restartLoading();return;}
            openHostLogin();
        });
        LinearLayout.LayoutParams toggleParams=new LinearLayout.LayoutParams(0,Ui.dp(this,50),1);
        toggleParams.leftMargin=Ui.dp(this,8);buttons.addView(toggle,toggleParams);
        root.addView(buttons,Ui.spaced(this,9));
        search=new EditText(this);
        search.setSingleLine(true);search.setTextSize(16);
        search.setHint("Buscar entre las personas atendidas…");
        search.setPadding(Ui.dp(this,15),Ui.dp(this,10),Ui.dp(this,15),Ui.dp(this,10));
        search.setBackground(Ui.bg(this,Color.WHITE,13,Ui.LINE));
        root.addView(search,Ui.spaced(this,12));
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int a,int c,int after){}
            public void onTextChanged(CharSequence s,int a,int before,int count){draw();}
            public void afterTextChanged(Editable s){}
        });
        resultSummary=Ui.label(this,"",12,false);
        resultSummary.setTextColor(Ui.MUTED);
        root.addView(resultSummary,Ui.spaced(this,10));
        scrolling=new ScrollView(this);
        scrolling.setFillViewport(true);
        scrolling.setVerticalScrollBarEnabled(false);
        results=new LinearLayout(this);results.setOrientation(LinearLayout.VERTICAL);
        scrolling.addView(results);
        workspace=new FrameLayout(this);
        root.addView(workspace,new LinearLayout.LayoutParams(-1,0,1));
        webHolder=new FrameLayout(this);workspace.addView(webHolder,new FrameLayout.LayoutParams(-1,-1));
        browser=HostWebSession.attach(this,webHolder);
        browser.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if(!req.isForMainFrame())return false;
                Uri uri=req.getUrl();
                if("https".equals(uri.getScheme())&&HOST.equals(uri.getHost()))return false;
                return true;
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){
                ++scanGeneration;ready=false;
                if("/floor/login".equals(Uri.parse(url).getPath()))showHostLogin();
                else {loginRequired=false;manual=false;loadTimedOut=false;armLoadingTimeout();showBrowser();}
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error){
                if(request.isForMainFrame())showLoadingFailure("No pudimos cargar Atendidas");
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,android.webkit.WebResourceResponse response){
                if(!request.isForMainFrame())return;
                if(response.getStatusCode()==401||response.getStatusCode()==403){
                    if("/floor/login".equals(request.getUrl().getPath()))showHostLogin();
                    else openHostLogin();
                }
                else if(response.getStatusCode()>=400)showLoadingFailure("No pudimos cargar Atendidas");
            }
            @Override public void onPageFinished(WebView view,String url){
                HostDesktopMode.enforce(view,()->{
                    if(isFinishing()||isDestroyed())return;
                    handler.removeCallbacks(poll);
                    handler.postDelayed(poll,650);
                });
            }
        });
        workspace.addView(scrolling,new FrameLayout.LayoutParams(-1,-1));
        loading=new LoadingScreen(this);workspace.addView(loading,new FrameLayout.LayoutParams(-1,-1));
        loading.loading("Cargando Atendidas","Estamos preparando la lista de personas.");
        armLoadingTimeout();
        String today=java.time.LocalDate.now().toString();
        boolean newDay=!today.equals(lastListDate);lastListDate=today;
        if(newDay||!HostWebSession.initialized()){
            browser.loadUrl(ORIGIN+"/floor/full-test");
        }else{
            String existing=Uri.parse(browser.getUrl()).getPath();
            if(!"/floor/full-test".equals(existing)&&!"/floor/login".equals(existing))
                browser.loadUrl(ORIGIN+"/floor/full-test");
        }
        showBrowser();
    }
    private void restartLoading(){
        ++scanGeneration;handler.removeCallbacks(poll);ready=false;manual=false;loginRequired=false;selecting=false;reviewed=null;loadTimedOut=false;
        loading.loading("Cargando Atendidas","Estamos preparando la lista de personas.");
        showBrowser();browser.loadUrl(ORIGIN+"/floor/full-test");
        armLoadingTimeout();
    }
    private void cancelLoadingTimeout(){
        if(loadingDeadline!=null)handler.removeCallbacks(loadingDeadline);
        loadingDeadline=null;
    }
    private void armLoadingTimeout(){
        cancelLoadingTimeout();
        loadingDeadline=()->{
            if(isFinishing()||isDestroyed()||ready||manual||loginRequired||reviewed!=null)return;
            showLoadingFailure("La lista todavía no está lista");
        };
        handler.postDelayed(loadingDeadline,30000);
    }
    private void showLoadingFailure(String title){
        ++scanGeneration;selecting=false;ready=false;manual=false;loginRequired=false;loadTimedOut=true;
        cancelLoadingTimeout();showBrowser();
        loading.error(title,"Podés reintentar o tocar Iniciar sesión Host para volver a ingresar.",this::restartLoading);
    }
    private void showHostLogin(){
        ++scanGeneration;selecting=false;reviewed=null;ready=false;loginRequired=true;loadTimedOut=false;
        candidates.clear();cancelLoadingTimeout();showBrowser();
    }
    private void openHostLogin(){
        handler.removeCallbacks(poll);showHostLogin();manual=true;showBrowser();
        // Reuse the same Host WebView and cookies. No logout or data deletion.
        browser.stopLoading();browser.loadUrl(ORIGIN+"/floor/login");
        handler.postDelayed(poll,700);
    }
    private void showBrowser(){
        if(loading==null)return;
        boolean show=manual||loginRequired;
        boolean waiting=!show&&reviewed==null&&(!ready||selecting);
        // Keep a full-sized WebView for React/desktop layout, but never paint
        // extraction behind the list. Both native states occupy the SAME frame.
        webHolder.setVisibility(View.VISIBLE);webHolder.setAlpha(show?1f:0f);
        webHolder.setImportantForAccessibility(show?View.IMPORTANT_FOR_ACCESSIBILITY_AUTO:View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        browser.setVisibility(View.VISIBLE);
        scrolling.setVisibility(!show&&!waiting&&reviewed==null?View.VISIBLE:View.GONE);
        search.setVisibility(!show&&!waiting&&reviewed==null?View.VISIBLE:View.GONE);
        resultSummary.setVisibility(!show&&!waiting&&reviewed==null?View.VISIBLE:View.GONE);
        reviewPanel.setVisibility(reviewed!=null?View.VISIBLE:View.GONE);
        workspace.setVisibility(reviewed!=null?View.GONE:View.VISIBLE);
        // Recovery must remain reachable while waiting, selecting or timed out.
        actions.setVisibility(reviewed!=null?View.GONE:View.VISIBLE);
        actions.getChildAt(0).setEnabled(!selecting);
        if(waiting&&!loadTimedOut)loading.loading(selecting?"Verificando persona":"Cargando Atendidas",
            selecting?"En un momento vas a poder confirmar sus datos.":"Estamos preparando la lista de personas.");
        else if(!waiting)loading.setVisibility(View.GONE);
        toggle.setText(show?"Volver a la lista":"Iniciar sesión Host");
        if(show)status.setText("Ingresá con tu cuenta de Host para continuar.");
        else if(reviewed==null)status.setText(ready&&!selecting?candidates.size()+" personas atendidas":"Un momento, por favor…");
    }
    private void sync(){
        if(isFinishing()||isDestroyed()||browser==null||reviewed!=null)return;
        handler.removeCallbacks(poll);
        Uri uri=Uri.parse(browser.getUrl()==null?"":browser.getUrl());
        if(!"https".equals(uri.getScheme())||!HOST.equals(uri.getHost())){
            showLoadingFailure("La sesión de Host no está disponible");return;
        }
        final int scan=++scanGeneration;
        HostWebSession.checkAccess(browser,raw->{
            if(isFinishing()||isDestroyed()||browser==null||scan!=scanGeneration)return;
            try{
                JSONObject access=new JSONObject(new JSONArray("["+raw+"]").getString(0));
                if(access.optBoolean("login")){
                    showHostLogin();handler.postDelayed(poll,1000);return;
                }
                if(manual||loginRequired){
                    if(!access.optBoolean("authenticated")&&!"/floor".equals(uri.getPath())){
                        handler.postDelayed(poll,1000);return;
                    }
                    manual=false;loginRequired=false;loadTimedOut=false;armLoadingTimeout();showBrowser();
                }
            }catch(Exception error){
                if(manual||loginRequired){handler.postDelayed(poll,1000);return;}
            }
            if(selecting){readSelected();return;}
            syncList(uri);
        });
    }
    private void syncList(Uri uri){
        String safePath=uri.getPath()==null?"":uri.getPath();
        if(!safePath.startsWith("/floor/full-test")){
            if(safePath.equals("/floor")){
                // Host login normally redirects to the Salón landing page.
                // Go straight to Full-test without another manual navigation.
                loginRequired=false;manual=false;showBrowser();
                status.setText("Cargando personas atendidas…");
                browser.loadUrl(ORIGIN+"/floor/full-test");
                return;
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
            "const busy=!!m.querySelector('[aria-busy=true],[role=progressbar]');"+
            "const empty=/no (?:hay|se encontraron) [^\\n]*(?:atendid|visitas|personas)|sin personas/i.test(m.innerText||'');"+
            "return JSON.stringify({ready:!busy&&(items.length>0||empty),items});})()";
        final int scan=scanGeneration;
        browser.evaluateJavascript(script,raw->{
            if(isFinishing()||isDestroyed()||browser==null||scan!=scanGeneration)return;
            try{
                String serialized=new JSONArray("["+raw+"]").getString(0);
                JSONObject payload=new JSONObject(serialized);
                if(!payload.optBoolean("ready")){if(!ready)showBrowser();}
                else if(!payload.optBoolean("changing")){
                    ArrayList<Item> incoming=new ArrayList<>();
                    JSONArray rows=payload.optJSONArray("items");
                    if(rows!=null)for(int i=0;i<rows.length();i++){
                        JSONObject r=rows.getJSONObject(i);
                        String path=r.optString("path"),name=r.optString("name");
                        if(path.matches("/floor/visits/[0-9a-f-]{36}(?:/full-test)?")&&name.length()>1)
                            incoming.add(new Item(name,r.optString("time"),path));
                    }
                    boolean changed=incoming.size()!=candidates.size();
                    if(!changed)for(int i=0;i<incoming.size();i++){
                        Item a=incoming.get(i),b=candidates.get(i);
                        if(!a.path.equals(b.path)||!a.name.equals(b.name)||!a.time.equals(b.time)){
                            changed=true;break;
                        }
                    }
                    if(changed){
                        candidates.clear();
                        candidates.addAll(incoming);
                    }
                    boolean wasReady=ready;
                    ready=true;loadTimedOut=false;cancelLoadingTimeout();
                    if(!manual)showBrowser();
                    status.setText("Atendidas de hoy: "+candidates.size()+" · Sesión Host · actualización automática");
                    // Polling happens every few seconds. Recreating hundreds of
                    // cards each time caused jank and lost the scroll position.
                    if(changed||!wasReady)draw();
                }
            }catch(Exception e){status.setText("No pudimos leer Atendidas. Podés abrir la pantalla original.");}
            handler.postDelayed(poll,4200);
        });
    }
    private void draw(){
        if(results==null||reviewed!=null)return;
        results.removeAllViews();
        String q=search.getText().toString().trim().toLowerCase(Locale.ROOT);
        int matches=0,shown=0;
        final int LIMIT=32;
        for(Item item:candidates){
            if(!item.name.toLowerCase(Locale.ROOT).contains(q))continue;
            matches++;
            if(shown>=LIMIT)continue;
            shown++;
            LinearLayout card=new LinearLayout(this);
            card.setGravity(Gravity.CENTER_VERTICAL);
            card.setPadding(Ui.dp(this,13),Ui.dp(this,12),Ui.dp(this,12),Ui.dp(this,12));
            card.setBackground(Ui.bg(this,Color.WHITE,15,Ui.LINE));
            LinearLayout details=new LinearLayout(this);details.setOrientation(LinearLayout.VERTICAL);
            TextView name=Ui.label(this,item.name,15,true);name.setMaxLines(1);
            name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            details.addView(name);
            TextView time=Ui.label(this,item.time.isEmpty()?"Atendida hoy":"Llegó "+item.time,12,false);
            time.setTextColor(Ui.MUTED);details.addView(time,Ui.spaced(this,5));
            card.addView(details,new LinearLayout.LayoutParams(0,-2,1));
            TextView arrow=Ui.label(this,"›",28,false);
            arrow.setTextColor(Ui.RED);arrow.setGravity(Gravity.CENTER);
            card.addView(arrow,new LinearLayout.LayoutParams(Ui.dp(this,32),Ui.dp(this,47)));
            card.setOnClickListener(v->select(item));
            LinearLayout.LayoutParams lp=Ui.spaced(this,7);
            results.addView(card,lp);
        }
        resultSummary.setText(matches==0?"Sin coincidencias":(matches>LIMIT?
            "Mostrando "+LIMIT+" de "+matches+" · Escribí para filtrar":
            matches+" coincidencia"+(matches==1?"":"s")));
        if(shown==0){
            TextView empty=Ui.label(this,ready?"No hay personas con ese nombre.":"Esperando la lista de Host…",14,false);
            empty.setTextColor(Ui.MUTED);results.addView(empty,Ui.spaced(this,14));
        }
    }
    private void showReview(JSONObject data){
        reviewed=data;selecting=false;cancelLoadingTimeout();
        reviewPanel.removeAllViews();
        TextView heading=Ui.label(this,"Confirmá que sea la persona correcta",17,true);
        reviewPanel.addView(heading);
        TextView person=Ui.label(this,data.optString("name",""),20,true);
        reviewPanel.addView(person,Ui.spaced(this,12));
        LinearLayout identity=new LinearLayout(this);
        TextView phone=Ui.label(this,"TELÉFONO\\n"+(data.optString("phone").isEmpty()?"No visible":data.optString("phone")),13,false);
        TextView arrival=Ui.label(this,"LLEGÓ\\n"+data.optString("arrival","—"),13,false);
        identity.addView(phone,new LinearLayout.LayoutParams(0,-2,2));
        identity.addView(arrival,new LinearLayout.LayoutParams(0,-2,1));
        reviewPanel.addView(identity,Ui.spaced(this,9));
        LinearLayout buttons=new LinearLayout(this);
        Button back=Ui.button(this,"Volver",false);
        back.setOnClickListener(v->{
            reviewed=null;reviewPanel.setVisibility(View.GONE);
            browser.loadUrl(ORIGIN+"/floor/full-test");
            showBrowser();draw();
        });
        buttons.addView(back,new LinearLayout.LayoutParams(0,Ui.dp(this,52),1));
        Button accept=Ui.button(this,seatPicker?"Asignar a silla":"Preparar derivación",true);
        accept.setOnClickListener(v->{
            Intent result=new Intent();
            result.putExtra("leadName",data.optString("name"));
            result.putExtra("leadPhone",data.optString("phone"));
            result.putExtra("arrival",data.optString("arrival"));
            result.putExtra("crmPath",wantedPath);
            setResult(RESULT_OK,result);finish();
        });
        LinearLayout.LayoutParams action=new LinearLayout.LayoutParams(0,Ui.dp(this,52),1.45f);
        action.leftMargin=Ui.dp(this,8);
        buttons.addView(accept,action);
        reviewPanel.addView(buttons,Ui.spaced(this,17));
        showBrowser();
    }
    private void select(Item item){
        if(selecting)return;
        ++scanGeneration;selecting=true;wantedPath=item.path;detailTries=0;loadTimedOut=false;armLoadingTimeout();showBrowser();
        search.clearFocus();
        ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE))
            .hideSoftInputFromWindow(search.getWindowToken(),0);
        status.setText("Verificando "+item.name+"…");
        browser.loadUrl(ORIGIN+wantedPath);
    }
    private void readSelected(){
        if(!selecting||browser==null)return;
        if(isFinishing()||isDestroyed())return;
        if(detailTries++>12){
            selecting=false;ready=false;showBrowser();
            status.setText("No pudimos verificar esta ficha. Reintentá desde la lista.");
            UiSheets.notice(this,"No se pudo verificar la persona en el CRM.",true);
            browser.loadUrl(ORIGIN+"/floor/full-test");return;
        }
        Uri page=Uri.parse(browser.getUrl()==null?"":browser.getUrl());
        if(!wantedPath.equals(page.getPath())){handler.postDelayed(poll,500);return;}
        String script="(()=>{const m=document.querySelector('main');if(!m)return JSON.stringify({ready:false});"+
            "const text=m.innerText||'';const name=(m.querySelector('h1')?.textContent||'').trim();"+
            "const phone=(text.match(/Tel[eé]fono\\s*\\n?\\s*([+()0-9 \\-]{8,20})/i)?.[1]||'').trim();"+
            "const arrival=(text.match(/entr[oó]\\s+(\\d{1,2}:\\d{2})/i)?.[1]||'').trim();"+
            "return JSON.stringify({ready:name.length>1,name,phone,arrival});})()";
        final int scan=scanGeneration;
        browser.evaluateJavascript(script,raw->{
            if(!selecting||isFinishing()||isDestroyed()||browser==null||scan!=scanGeneration)return;
            try{
                JSONObject data=new JSONObject(new JSONArray("["+raw+"]").getString(0));
                if(!data.optBoolean("ready")){handler.postDelayed(poll,600);return;}
                showReview(data);
            }catch(Exception error){handler.postDelayed(poll,500);}
        });
    }
    @Override public void onBackPressed(){
        if(reviewed!=null){
            reviewed=null;browser.loadUrl(ORIGIN+"/floor/full-test");showBrowser();draw();return;
        }
        if(manual){manual=false;showBrowser();return;}
        super.onBackPressed();
    }
    @Override protected void onPause(){++scanGeneration;handler.removeCallbacks(poll);cancelLoadingTimeout();super.onPause();}
    @Override protected void onResume(){
        super.onResume();if(browser!=null){
            String today=java.time.LocalDate.now().toString();
            if(!today.equals(lastListDate)){
                lastListDate=today;
                if(!manual&&!loginRequired&&reviewed==null){candidates.clear();restartLoading();}
            }
            if(!ready&&!manual&&!loginRequired&&!loadTimedOut&&reviewed==null)armLoadingTimeout();
            handler.removeCallbacks(poll);handler.postDelayed(poll,700);
        }
    }
    @Override protected void onDestroy(){
        ++scanGeneration;cancelLoadingTimeout();handler.removeCallbacksAndMessages(null);
        HostWebSession.release(this);
        browser=null;
        super.onDestroy();
    }
}
