package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.MutableContextWrapper;
import android.graphics.Color;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Exactly one Host WebView in the isolated :host process.
 *
 * The CRM may keep login state in page-scoped/sessionStorage memory. Cookies and
 * a shared data-directory ALONE do not preserve that state between WebViews.
 * Reparenting this same object preserves the session, DOM, history and selected
 * CRM visit as the user moves from Atendidas to printing.
 *
 * No PIN, cookie, token or sessionStorage value is copied or persisted here.
 * Losing the Android process may still require signing in again.
 */
final class HostWebSession {
    private static WebView shared;
    private static MutableContextWrapper context;

    static WebView attach(Activity activity,ViewGroup target) {
        if(shared==null) {
            context=new MutableContextWrapper(activity);
            shared=new WebView(context);
            WebSettings config=shared.getSettings();
            config.setJavaScriptEnabled(true);
            config.setDomStorageEnabled(true);
            config.setSupportMultipleWindows(true);
            config.setJavaScriptCanOpenWindowsAutomatically(true);
            config.setAllowFileAccess(false);
            config.setAllowContentAccess(false);
            config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            CookieManager.getInstance().setAcceptCookie(true);
            shared.setBackgroundColor(Color.WHITE);
        } else {
            context.setBaseContext(activity);
        }
        ViewParent parent=shared.getParent();
        if(parent instanceof ViewGroup)((ViewGroup)parent).removeView(shared);
        target.addView(shared,new ViewGroup.LayoutParams(-1,-1));
        shared.setVisibility(android.view.View.VISIBLE);
        return shared;
    }

    static boolean initialized(){return shared!=null&&shared.getUrl()!=null;}

    static void release(Activity owner) {
        if(shared==null||context.getBaseContext()!=owner)return;
        // Callbacks referencing an Activity must not survive when its UI closes.
        shared.setWebViewClient(new WebViewClient());
        shared.setWebChromeClient(new WebChromeClient());
        ViewParent parent=shared.getParent();
        if(parent instanceof ViewGroup)((ViewGroup)parent).removeView(shared);
        context.setBaseContext(owner.getApplicationContext());
    }

    private HostWebSession(){}
}
