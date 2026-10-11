package io.laind.masduenos.salon;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Two ordinary HTTPS WebViews; no native JavaScript bridge and no access to credentials. */
public final class MainActivity extends Activity {
    private static final String SALON_HOST = "liniers.xn--somosmasdueos-skb.com";
    private static final String SALES_HOST = "masduenos.laind.io";
    private static final String SALON_URL = "https://" + SALON_HOST + "/floor";
    private static final String SALES_URL = "https://" + SALES_HOST + "/presentador";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final boolean[] failed = {false, false};
    private final boolean[] retrySafe = {true, true};
    private final int[] attempts = {0, 0};
    private final String[] errors = {"No pudimos conectar.", "No pudimos conectar."};
    private final Runnable[] retries = new Runnable[2];
    private final WebView[] pages = new WebView[2];
    private ProgressBar progress;
    private LinearLayout errorBox;
    private TextView errorText;
    private Button salonButton, salesButton;
    private int selected = 0;
    private boolean resumed;
    private String navigationScript = "";
    private ValueCallback<Uri[]> fileResult;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        CookieManager.getInstance().setAcceptCookie(true);
        try (InputStream input = getAssets().open("salon-navigation.js")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            navigationScript = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception ignored) { Toast.makeText(this, "Usá Mis ventas para abrir tu panel.", Toast.LENGTH_LONG).show(); }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        setContentView(root);
        // Android 15 edge-to-edge: protect the native toolbar, page and web bottom navigation.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        salonButton = button("Salón", () -> select(0));
        salesButton = button("Mis ventas", () -> select(1));
        toolbar.addView(salonButton, new LinearLayout.LayoutParams(0, dp(48), 1));
        toolbar.addView(salesButton, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button reload = button("↻", () -> { attempts[selected] = 0; pages[selected].reload(); });
        reload.setContentDescription("Actualizar la página actual");
        toolbar.addView(reload, new LinearLayout.LayoutParams(dp(52), dp(48)));
        root.addView(toolbar);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));
        FrameLayout frame = new FrameLayout(this);
        root.addView(frame, new LinearLayout.LayoutParams(-1, 0, 1));
        for (int i = 0; i < pages.length; i++) {
            pages[i] = makePage(i);
            frame.addView(pages[i], new FrameLayout.LayoutParams(-1, -1));
        }
        errorBox = new LinearLayout(this);
        errorBox.setOrientation(LinearLayout.VERTICAL);
        errorBox.setGravity(Gravity.CENTER);
        errorBox.setPadding(dp(24), dp(24), dp(24), dp(24));
        errorBox.setBackgroundColor(Color.WHITE);
        errorText = new TextView(this);
        errorText.setTextSize(18);
        errorText.setGravity(Gravity.CENTER);
        errorBox.addView(errorText);
        errorBox.addView(button("Reintentar", () -> { attempts[selected] = 0; pages[selected].reload(); }));
        frame.addView(errorBox, new FrameLayout.LayoutParams(-1, -1));

        for (int i = 0; i < pages.length; i++) {
            Bundle pageState = saved == null ? null : saved.getBundle("page" + i);
            if (pageState == null || pages[i].restoreState(pageState) == null)
                pages[i].loadUrl(i == 0 ? SALON_URL : SALES_URL);
        }
        select(saved == null ? 0 : saved.getInt("selected", 0));
        connectivity = (ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) {
                handler.post(() -> { for (int i = 0; i < pages.length; i++) if (failed[i]) scheduleRetry(i, 1000); });
            }
        };
        connectivity.registerDefaultNetworkCallback(networkCallback);
    }

    private Button button(String label, Runnable action) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setOnClickListener(view -> action.run());
        return button;
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private boolean trusted(Uri uri) {
        return "https".equals(uri.getScheme()) && (uri.getPort() == -1 || uri.getPort() == 443) &&
            (SALON_HOST.equals(uri.getHost()) || SALES_HOST.equals(uri.getHost()));
    }
    private WebView makePage(final int index) {
        WebView page = new WebView(this);
        WebSettings settings = page.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(page, false);
        page.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if (trusted(uri)) {
                    int destination = SALES_HOST.equals(uri.getHost()) ? 1 : 0;
                    if (destination != index) {
                        // “Yo” keeps the existing sales view, including its selected tab and login.
                        if (!(destination == 1 && "/presentador".equals(uri.getPath()) && pages[1].getUrl() != null))
                            pages[destination].loadUrl(uri.toString());
                        select(destination);
                        return true;
                    }
                    return false;
                }
                if (request.hasGesture()) openExternal(uri);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                failed[index] = false;
                cancelRetry(index);
                if (selected == index) { errorBox.setVisibility(View.GONE); progress.setVisibility(View.VISIBLE); }
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                if (!failed[index]) attempts[index] = 0;
                Uri uri = Uri.parse(url);
                if (!failed[index] && SALON_HOST.equals(uri.getHost()) && trusted(uri))
                    view.evaluateJavascript(navigationScript, null);
                if (selected == index) progress.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (!request.isForMainFrame()) return;
                retrySafe[index] = "GET".equals(request.getMethod());
                fail(index, "No pudimos conectar. Reintentaremos cuando vuelva la conexión.", true);
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (!request.isForMainFrame()) return;
                int status = response.getStatusCode();
                retrySafe[index] = "GET".equals(request.getMethod());
                if (status == 408 || status == 429 || status >= 500)
                    fail(index, "El servicio está reconectando. Esperá unos segundos.", true);
                else fail(index, "El sitio respondió con un error (" + status + "). Podés reintentar o volver al salón.", false);
            }
        });
        page.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                if (selected == index) { progress.setProgress(value); progress.setVisibility(value < 100 && !failed[index] ? View.VISIBLE : View.GONE); }
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (view.getUrl() == null || !trusted(Uri.parse(view.getUrl()))) return false;
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = callback;
                try { startActivityForResult(params.createIntent(), 20); }
                catch (ActivityNotFoundException error) { fileResult.onReceiveValue(null); fileResult = null; }
                return true;
            }
        });
        return page;
    }
    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"tel".equals(scheme) && !"mailto".equals(scheme) && !"whatsapp".equals(scheme)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
        catch (ActivityNotFoundException ignored) { Toast.makeText(this, "No hay una aplicación para abrir este enlace.", Toast.LENGTH_SHORT).show(); }
    }
    private void select(int index) {
        selected = index == 1 ? 1 : 0;
        for (int i = 0; i < pages.length; i++) pages[i].setVisibility(i == selected ? View.VISIBLE : View.GONE);
        salonButton.setTextColor(selected == 0 ? Color.rgb(216,37,27) : Color.DKGRAY);
        salesButton.setTextColor(selected == 1 ? Color.rgb(216,37,27) : Color.DKGRAY);
        errorBox.setVisibility(failed[selected] ? View.VISIBLE : View.GONE);
        errorText.setText(errors[selected]);
        progress.setProgress(pages[selected].getProgress());
        progress.setVisibility(pages[selected].getProgress() < 100 && !failed[selected] ? View.VISIBLE : View.GONE);
    }
    private void fail(int index, String message, boolean temporary) {
        failed[index] = true;
        errors[index] = message;
        if (selected == index) { errorText.setText(message); errorBox.setVisibility(View.VISIBLE); progress.setVisibility(View.GONE); }
        if (temporary) scheduleRetry(index, Math.min(30000, 2000L << Math.min(attempts[index]++, 4)));
    }
    private void cancelRetry(int index) { if (retries[index] != null) handler.removeCallbacks(retries[index]); }
    private void scheduleRetry(final int index, long delay) {
        cancelRetry(index);
        if (!resumed || !retrySafe[index]) return; // Never resubmit a form automatically.
        retries[index] = () -> { if (failed[index] && resumed) pages[index].reload(); };
        handler.postDelayed(retries[index], delay);
    }
    @Override protected void onResume() {
        super.onResume(); resumed = true;
        for (int i = 0; i < pages.length; i++) { pages[i].onResume(); if (failed[i]) scheduleRetry(i, 1000); }
    }
    @Override protected void onPause() {
        resumed = false;
        for (int i = 0; i < pages.length; i++) { cancelRetry(i); pages[i].onPause(); }
        CookieManager.getInstance().flush(); super.onPause();
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state); state.putInt("selected", selected);
        for (int i = 0; i < pages.length; i++) { Bundle pageState = new Bundle(); pages[i].saveState(pageState); state.putBundle("page" + i, pageState); }
    }
    @Override public void onBackPressed() {
        if (pages[selected].canGoBack()) pages[selected].goBack();
        else if (selected == 1) select(0);
        else super.onBackPressed();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 20 && fileResult != null) { fileResult.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); fileResult = null; }
    }
    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (networkCallback != null) connectivity.unregisterNetworkCallback(networkCallback);
        if (fileResult != null) fileResult.onReceiveValue(null);
        for (WebView page : pages) { ((ViewGroup)page.getParent()).removeView(page); page.destroy(); }
        super.onDestroy();
    }
}
