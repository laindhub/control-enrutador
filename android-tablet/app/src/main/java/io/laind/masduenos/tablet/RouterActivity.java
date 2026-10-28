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
    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.statusBars(this);
        LinearLayout root=Ui.column(this,12);root.setBackgroundColor(-1);NavigationShell.install(this,root,NavigationShell.ROUTER);
        TextView heading=Ui.label(this,"Enrutador · CRM original",21,true);root.addView(heading);
        TextView hint=Ui.label(this,"Ingresá con tu PIN de Enrutador. La app nunca registra el PIN ni completa derivaciones sin confirmar los campos.",13,false);
        hint.setTextColor(Ui.MUTED);root.addView(hint,Ui.spaced(this,6));
        page=new WebView(this);
        WebSettings s=page.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        page.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){
                if(!req.isForMainFrame())return false;
                Uri u=req.getUrl();
                if("https".equals(u.getScheme())&&"liniers.xn--somosmasdueos-skb.com".equals(u.getHost()))return false;
                if(req.hasGesture()&&"https".equals(u.getScheme()))startActivity(new Intent(Intent.ACTION_VIEW,u));
                return true;
            }
        });
        root.addView(page,new LinearLayout.LayoutParams(-1,0,1));
        page.loadUrl(ORIGIN+"/floor/visits");
    }
    @Override public void onBackPressed(){if(page.canGoBack())page.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){if(page!=null)page.destroy();super.onDestroy();}
}
