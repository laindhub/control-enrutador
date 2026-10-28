package io.laind.masduenos.tablet;

import android.app.Application;
import android.os.Build;
import android.webkit.WebView;

/** Must run once per process, BEFORE either Host Activity creates a WebView. */
public final class TabletApplication extends Application {
    @Override public void onCreate(){
        super.onCreate();
        if(Build.VERSION.SDK_INT>=28) {
            String process=Application.getProcessName();
            if(process!=null&&process.endsWith(":host"))WebView.setDataDirectorySuffix("host");
        }
    }
}
