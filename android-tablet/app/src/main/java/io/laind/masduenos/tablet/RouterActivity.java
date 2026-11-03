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
import android.widget.TextView;

/** Router credentials stay in Android WebView storage, never in our server or app preferences. */
public final class RouterActivity extends Activity {
    private static final String ORIGIN="https://liniers.xn--somosmasdueos-skb.com";
    private WebView page;
    private String assignedPath="";
    private boolean returnedFromLogin=false;
    private android.widget.ProgressBar loading;
    private LinearLayout errorPanel;
    private String leadId="",handoffNonce="";
    private boolean completed=false;
    private String navigationScript="",returnScript="";
    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.statusBars(this);
        navigationScript=asset("unified-navigation.js");returnScript=asset("assignment-return.js");
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
        errorPanel=Ui.column(this,18);errorPanel.setVisibility(View.GONE);
        TextView unavailable=Ui.label(this,"No pudimos abrir el CRM",19,true);errorPanel.addView(unavailable);
        TextView explanation=Ui.label(this,"Revisá la conexión. Si estabas guardando una derivación, comprobá primero su estado en Liniers antes de volver a enviarla.",14,false);
        explanation.setTextColor(Ui.MUTED);errorPanel.addView(explanation,Ui.spaced(this,8));
        android.widget.Button retry=Ui.button(this,"Abrir CRM",true);
        retry.setOnClickListener(v->{errorPanel.setVisibility(View.GONE);page.setVisibility(View.VISIBLE);page.loadUrl(ORIGIN+(assignedPath.isEmpty()?"/floor/router":assignedPath));});
        errorPanel.addView(retry,Ui.spaced(this,16));root.addView(errorPanel);
        page=new WebView(this);
        WebSettings s=page.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        page.setWebViewClient(new WebViewClient(){
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap favicon){loading.setVisibility(View.VISIBLE);}
            @Override public void onReceivedError(WebView view,WebResourceRequest request,android.webkit.WebResourceError error){
                if(request.isForMainFrame())showError();
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,android.webkit.WebResourceResponse response){
                if(request.isForMainFrame()&&response.getStatusCode()>=400)showError();
            }
            @Override public void onPageFinished(WebView view,String url){
                loading.setVisibility(View.GONE);CookieManager.getInstance().flush();injectIntegration();
                Uri current=Uri.parse(url);
                if(!assignedPath.isEmpty()&&!returnedFromLogin&&"/floor".equals(current.getPath())){
                    returnedFromLogin=true;
                    view.loadUrl(ORIGIN+assignedPath);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if(!req.isForMainFrame())return false;
                Uri u=req.getUrl();
                if("masduenos".equals(u.getScheme())){
                    Uri source=Uri.parse(view.getUrl()==null?"":view.getUrl());
                    if("https".equals(source.getScheme())&&"liniers.xn--somosmasdueos-skb.com".equals(source.getHost())&&
                            "assignment-complete".equals(u.getHost())&&("/"+handoffNonce).equals(u.getPath())&&
                            !handoffNonce.isEmpty()&&!assignedPath.isEmpty())returnToRouting(true);
                    return true;
                }
                if("https".equals(u.getScheme())&&"liniers.xn--somosmasdueos-skb.com".equals(u.getHost()))return false;
                if(req.hasGesture()&&"https".equals(u.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,u));
                return true;
            }
        });
        page.setWebChromeClient(new android.webkit.WebChromeClient(){
            @Override public void onProgressChanged(WebView view,int progress){loading.setProgress(progress);}
        });
        root.addView(page,new LinearLayout.LayoutParams(-1,0,1));
        Bundle savedPage=state==null?null:state.getBundle("crm_page");
        assignedPath=state==null?"":state.getString("assigned_path","");
        returnedFromLogin=state!=null&&state.getBoolean("returned_login",false);
        leadId=state==null?"":state.getString("lead_id","");handoffNonce=state==null?"":state.getString("handoff_nonce","");
        if(savedPage==null||page.restoreState(savedPage)==null)loadVisit(getIntent());
        page.postDelayed(this::injectIntegration,500);
    }
    private void showError(){
        loading.setVisibility(View.GONE);page.setVisibility(View.GONE);errorPanel.setVisibility(View.VISIBLE);
    }
    private void loadVisit(Intent intent){
        leadId=intent.getStringExtra("lead_id");if(leadId==null)leadId="";
        handoffNonce=java.util.UUID.randomUUID().toString();completed=false;
        String link=intent.getStringExtra("crmPath");String destination="/floor/router";
        if(link!=null&&link.matches("/floor/visits/[a-fA-F0-9-]{36}(?:/full-test)?")){
            String id=link.split("/")[3];destination="/floor/visits/"+id+"/assignment";
        }
        assignedPath=destination.equals("/floor/router")?"":destination;returnedFromLogin=false;
        errorPanel.setVisibility(View.GONE);page.setVisibility(View.VISIBLE);page.loadUrl(ORIGIN+destination);
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
        page.evaluateJavascript(navigationScript+";"+state+returnScript,null);
    }
    private void returnToRouting(boolean saved){
        if(completed)return;completed=true;
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
    @Override protected void onDestroy(){if(page!=null)page.destroy();super.onDestroy();}
}
