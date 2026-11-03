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
    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.statusBars(this);
        LinearLayout root=Ui.column(this,0);root.setBackgroundColor(-1);NavigationShell.install(this,root,NavigationShell.ROUTER);
        TextView heading=Ui.label(this,"Derivaciones",24,true);
        heading.setPadding(Ui.dp(this,18),Ui.dp(this,14),Ui.dp(this,18),Ui.dp(this,8));root.addView(heading);
        TextView hint=Ui.label(this,"Registro oficial de Liniers",13,false);
        hint.setTextColor(Ui.MUTED);hint.setPadding(Ui.dp(this,18),0,Ui.dp(this,18),Ui.dp(this,10));root.addView(hint);
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
                loading.setVisibility(View.GONE);CookieManager.getInstance().flush();
                Uri current=Uri.parse(url);
                if(!assignedPath.isEmpty()&&!returnedFromLogin&&"/floor".equals(current.getPath())){
                    returnedFromLogin=true;
                    view.loadUrl(ORIGIN+assignedPath);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if(!req.isForMainFrame())return false;
                Uri u=req.getUrl();
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
        if(savedPage==null||page.restoreState(savedPage)==null)loadVisit(getIntent());
    }
    private void showError(){
        loading.setVisibility(View.GONE);page.setVisibility(View.GONE);errorPanel.setVisibility(View.VISIBLE);
    }
    private void loadVisit(Intent intent){
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
        state.putString("assigned_path",assignedPath);state.putBoolean("returned_login",returnedFromLogin);
        super.onSaveInstanceState(state);
    }
    @Override public void onBackPressed(){if(page.canGoBack())page.goBack();else NavigationShell.openRouting(this);}
    @Override protected void onDestroy(){if(page!=null)page.destroy();super.onDestroy();}
}
