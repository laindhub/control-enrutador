package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.webkit.JavascriptInterface;

/** Router credentials stay in Android WebView storage, never in our server or app preferences. */
public final class RouterActivity extends Activity {
    private static final String ORIGIN="https://liniers.xn--somosmasdueos-skb.com";
    private WebView page;
    private String assignedPath="";
    private boolean returnedFromLogin=false;
    private android.widget.ProgressBar loading;
    private LoadingScreen loadScreen;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private int loadGeneration;
    private boolean loadFailed, destroyed, documentFinished;
    private String readinessScript="";
    private String leadId="",handoffNonce="";
    private boolean completed=false;
    private String navigationScript="",returnScript="";
    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.statusBars(this);
        navigationScript=asset("unified-navigation.js");returnScript=asset("assignment-return.js");
        readinessScript=asset("assignment-readiness.js");
        LinearLayout root=Ui.column(this,0);root.setBackgroundColor(-1);NavigationShell.installSalon(this,root);
        LinearLayout toolbar=Ui.column(this,8);toolbar.setOrientation(LinearLayout.HORIZONTAL);
        android.widget.Button back=Ui.button(this,"‹ Enrutar",false);back.setOnClickListener(v->returnToRouting(false));
        toolbar.addView(back,new LinearLayout.LayoutParams(0,Ui.dp(this,44),1));
        android.widget.Button finish=Ui.button(this,"Ya guardé · volver",false);
        finish.setOnClickListener(v->UiSheets.confirm(this,"Volver a Enrutar",
            "¿Guardaste la derivación de esta persona en el CRM?","Todavía no","Sí, volver",()->returnToRouting(true)));
        LinearLayout.LayoutParams fp=new LinearLayout.LayoutParams(0,Ui.dp(this,44),1);fp.leftMargin=Ui.dp(this,8);toolbar.addView(finish,fp);
        root.addView(toolbar);
        loading=new android.widget.ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        loading.setMax(100);root.addView(loading,new LinearLayout.LayoutParams(-1,Ui.dp(this,2)));
        page=new WebView(this);
        WebSettings s=page.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        // Completion is a message, never a navigation of the CRM's streaming document.
        page.addJavascriptInterface(new AssignmentBridge(),"MdAssignment");
        page.setWebViewClient(new WebViewClient(){
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){
                beginLoading();
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error){
                if(request.isForMainFrame())showError();
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,android.webkit.WebResourceResponse response){
                if(request.isForMainFrame()&&response.getStatusCode()>=400)showError();
            }
            @Override public void onPageFinished(WebView view,String url){
                CookieManager.getInstance().flush();
                if(loadFailed)return;
                documentFinished=true;
                // Do not inject on a timer while Next.js is still streaming the form.
                injectIntegration();
                Uri current=Uri.parse(url);
                if(!assignedPath.isEmpty()&&!returnedFromLogin&&"/floor".equals(current.getPath())){
                    returnedFromLogin=true;
                    view.loadUrl(ORIGIN+assignedPath);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if(!req.isForMainFrame())return false;
                Uri u=req.getUrl();
                if("masduenos".equals(u.getScheme()))return true;
                if("https".equals(u.getScheme())&&"liniers.xn--somosmasdueos-skb.com".equals(u.getHost()))return false;
                if(req.hasGesture()&&"https".equals(u.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,u));
                return true;
            }
        });
        page.setWebChromeClient(new android.webkit.WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int progress){loading.setProgress(progress);}
        });
        FrameLayout content=new FrameLayout(this);
        content.addView(page,new FrameLayout.LayoutParams(-1,-1));
        loadScreen=new LoadingScreen(this);
        content.addView(loadScreen,new FrameLayout.LayoutParams(-1,-1));
        root.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        Bundle savedPage=state==null?null:state.getBundle("crm_page");
        assignedPath=state==null?"":state.getString("assigned_path","");
        returnedFromLogin=state!=null&&state.getBoolean("returned_login",false);
        leadId=state==null?"":state.getString("lead_id","");handoffNonce=state==null?"":state.getString("handoff_nonce","");
        if(savedPage==null||page.restoreState(savedPage)==null)loadVisit(getIntent());
        if(savedPage!=null&&!loadFailed)beginLoading();
    }
    private void beginLoading(){
        loadFailed=false;documentFinished=false;
        int generation=++loadGeneration;
        long deadline=SystemClock.uptimeMillis()+30000;
        loading.setVisibility(View.VISIBLE);
        page.setVisibility(View.VISIBLE);page.setAlpha(0f);
        page.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        loadScreen.loading("Abriendo derivación…","Estamos preparando el formulario del CRM.");
        // Independent deadline also covers a stalled JavaScript renderer that
        // never invokes evaluateJavascript's callback.
        handler.postDelayed(()->{
            if(!destroyed&&generation==loadGeneration&&!loadFailed)showError();
        },30000);
        pollReady(generation,deadline);
    }
    private void pollReady(int generation,long deadline){
        handler.postDelayed(()->{
            if(destroyed||generation!=loadGeneration||loadFailed)return;
            if(SystemClock.uptimeMillis()>=deadline){showError();return;}
            if(!documentFinished){pollReady(generation,deadline);return;}
            page.evaluateJavascript(readinessScript,result->{
                if(destroyed||generation!=loadGeneration||loadFailed)return;
                if("true".equals(result)){
                    ++loadGeneration;
                    injectIntegration();
                    page.setAlpha(1f);page.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
                    loadScreen.setVisibility(View.GONE);loading.setVisibility(View.GONE);
                }else pollReady(generation,deadline);
            });
        },400);
    }
    private void showError(){
        loadFailed=true;++loadGeneration;
        loading.setVisibility(View.GONE);page.setAlpha(0f);
        loadScreen.error("No terminó de cargar","Podés volver a abrir el formulario. Si ya habías guardado, comprobá la derivación antes de enviarla otra vez.",()->{
            // A fresh GET is safe; never replay a form submission with reload().
            beginLoading();page.loadUrl(ORIGIN+(assignedPath.isEmpty()?"/floor/router":assignedPath));
        });
    }
    public final class AssignmentBridge {
        @JavascriptInterface public void complete(String nonce){
            handler.post(()->{
                if(destroyed||isFinishing()||nonce==null||handoffNonce.isEmpty()||!handoffNonce.equals(nonce))return;
                Uri source=Uri.parse(page.getUrl()==null?"":page.getUrl());
                if("https".equals(source.getScheme())&&"liniers.xn--somosmasdueos-skb.com".equals(source.getHost())&&
                    (source.getPort()==-1||source.getPort()==443)&&!assignedPath.isEmpty())returnToRouting(true);
            });
        }
    }
    private void loadVisit(Intent intent){
        leadId=intent.getStringExtra("lead_id");if(leadId==null)leadId="";
        handoffNonce=java.util.UUID.randomUUID().toString();completed=false;
        String link=intent.getStringExtra("crmPath");String destination="/floor/router";
        if(link!=null&&link.matches("/floor/visits/[a-fA-F0-9-]{36}(?:/full-test)?")){
            String id=link.split("/")[3];destination="/floor/visits/"+id+"/assignment";
        }
        assignedPath=destination.equals("/floor/router")?"":destination;returnedFromLogin=false;
        beginLoading();page.loadUrl(ORIGIN+destination);
    }
    @Override protected void onNewIntent(Intent intent){
        super.onNewIntent(intent);setIntent(intent);
        if(intent.hasExtra("crmPath"))loadVisit(intent);
    }
    @Override protected void onSaveInstanceState(Bundle state){
        Bundle pageState=new Bundle();page.saveState(pageState);state.putBundle("crm_page",pageState);
        state.putString("lead_id",leadId);state.putString("handoff_nonce",handoffNonce);
        state.putString("assigned_path",assignedPath);state.putBoolean("returned_login",returnedFromLogin);
        super.onSaveInstanceState(state);
    }
    private String asset(String name){
        try(java.io.InputStream in=getAssets().open(name);java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){
            byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
            return new String(out.toByteArray(),java.nio.charset.StandardCharsets.UTF_8);
        }catch(Exception ignored){return "";}
    }
    private void injectIntegration(){
        if(page==null||isFinishing())return;
        Uri url=Uri.parse(page.getUrl()==null?"":page.getUrl());
        if(!"https".equals(url.getScheme())||!"liniers.xn--somosmasdueos-skb.com".equals(url.getHost()))return;
        String state="";
        if(!assignedPath.isEmpty()){
            String uuid=assignedPath.split("/")[3];
            state="if(!window.__mdAssignment||window.__mdAssignment.nonce!=="+org.json.JSONObject.quote(handoffNonce)+
                "){window.__mdAssignment={uuid:"+org.json.JSONObject.quote(uuid)+",nonce:"+org.json.JSONObject.quote(handoffNonce)+"};}";
        }
        page.evaluateJavascript("window.__mdUnifiedHideOnly=true;"+navigationScript+";"+state+returnScript,null);
    }
    private void returnToRouting(boolean saved){
        if(completed)return;completed=true;++loadGeneration;
        Intent destination=new Intent(this,DashboardActivity.class);
        if(!leadId.isEmpty())try{
            LeadStore store=new LeadStore(this);LeadStore.Lead lead=store.get(leadId);
            if(lead!=null){
                String uuid=assignedPath.isEmpty()?"":assignedPath.split("/")[3];
                boolean matches=!uuid.isEmpty()&&lead.crmPath.matches("/floor/visits/"+java.util.regex.Pattern.quote(uuid)+"(?:/full-test)?");
                if(saved&&matches&&LeadStore.PAPER.equals(lead.status)){lead.status=LeadStore.DONE;store.save(lead);}
                if(!lead.talkId.isEmpty()){destination.putExtra("talk_id",lead.talkId);destination.putExtra("presenter_filter",lead.presenter);}
            }
        }catch(Exception error){UiSheets.notice(this,"Volvé a revisar el estado local de esta persona.",true);}
        NavigationShell.open(this,destination);finish();
    }
    @Override public void onBackPressed(){returnToRouting(false);}
    @Override protected void onDestroy(){destroyed=true;++loadGeneration;handler.removeCallbacksAndMessages(null);if(page!=null){page.removeJavascriptInterface("MdAssignment");page.destroy();}super.onDestroy();}
}
