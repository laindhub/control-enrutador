package io.laind.masduenos.tablet;

import android.webkit.WebSettings;
import android.webkit.WebView;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Host Full-test is available in the desktop layout of the original CRM.
 * Keep the device in desktop emulation even when the app is used on a phone.
 */
final class HostDesktopMode {
    private static final Pattern CHROME=Pattern.compile("Chrome/[0-9.]+");
    private static final int WIDTH=1280;

    static void configure(WebView browser){
        WebSettings settings=browser.getSettings();
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        String original=settings.getUserAgentString();
        Matcher chrome=CHROME.matcher(original==null?"":original);
        String version=chrome.find()?chrome.group():"Chrome/131.0.0.0";
        settings.setUserAgentString(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "+
            "AppleWebKit/537.36 (KHTML, like Gecko) "+version+" Safari/537.36");
    }

    /** Force CSS layout viewport, not merely a desktop User-Agent string.
     * The CRM can select mobile UI based on window.innerWidth. The script
     * applies after page load and emits resize for React media-query listeners.
     * It does not read user information, cookies or authentication state.
     */
    static void enforce(WebView browser,Runnable whenReady){
        if(browser==null)return;
        browser.evaluateJavascript(
            "(function(){try{var m=document.querySelector('meta[name=viewport]');"+
            "if(!m){m=document.createElement('meta');m.name='viewport';"+
            "document.head.appendChild(m);}"+
            "var want='width="+WIDTH+", user-scalable=yes';"+
            "if(m.content!==want){m.content=want;window.dispatchEvent(new Event('resize'));}"+
            "document.documentElement.style.minWidth='"+WIDTH+"px';"+
            "return JSON.stringify({width:window.innerWidth,desktop:window.innerWidth>=980});"+
            "}catch(e){return JSON.stringify({desktop:false});}})()",
            ignored->{if(whenReady!=null)whenReady.run();});
    }
    private HostDesktopMode(){}
}
