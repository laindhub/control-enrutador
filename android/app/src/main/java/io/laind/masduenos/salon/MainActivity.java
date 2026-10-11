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

/** Original salon with an embedded sales section. A second view is used only for sales sign-in. */
public final class MainActivity extends Activity {
    private static final String SALON_HOST = "liniers.xn--somosmasdueos-skb.com";
    private static final String SALES_HOST = "masduenos.laind.io";
    private static final String SALON_URL = "https://" + SALON_HOST + "/floor";
    private static final String SALES_URL = "https://" + SALES_HOST + "/presentador?salon=1";
    private static final String PREPARE_URL = "https://" + SALES_HOST + "/presentador/preparar?salon=1";
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
    private int selected = 0;
    private boolean resumed;
    private boolean salesPrepared;
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
        } catch (Exception ignored) { Toast.makeText(this, "No se pudo cargar la integración de ventas.", Toast.LENGTH_LONG).show(); }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        setContentView(root);
        // Android 15 edge-to-edge: preserve the page and its original bottom navigation.
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
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
                pages[i].loadUrl(i == 0 ? SALON_URL : PREPARE_URL);
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
        CookieManager.getInstance().setAcceptThirdPartyCookies(page, index == 0);
        page.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri uri = request.getUrl();
                if (trusted(uri)) {
                    int destination = SALES_HOST.equals(uri.getHost()) ? 1 : 0;
                    if (destination != index) {
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
                    view.evaluateJavascript("window.__mdSalesPrepared=" + salesPrepared + ";" + navigationScript, null);
                if (!failed[index] && index == 1 && trusted(uri) && SALES_HOST.equals(uri.getHost()) &&
                    ("/login".equals(uri.getPath()) || "/presentador/preparar".equals(uri.getPath()))) {
                    salesPrepared = true;
                    pages[0].evaluateJavascript("window.__mdSalesPrepared=true;window.dispatchEvent(new Event('md-sales-prepared'))", null);
                }
                // The only separate view is the first-party sign-in required by the sales account.
                // Once connected, return to the unchanged activity and refresh its embedded section.
                if (!failed[index] && index == 1 && SALES_HOST.equals(uri.getHost()) && "/presentador".equals(uri.getPath())) {
                    if (!"1".equals(uri.getQueryParameter("salon"))) view.loadUrl(SALES_URL);
                    else {
                        salesPrepared = true;
                        select(0);
                        pages[0].evaluateJavascript("window.__mdSalesPrepared=true;window.dispatchEvent(new Event('md-sales-connected'))", null);
                        view.loadUrl(PREPARE_URL);
                    }
                }
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
                if (index == 1 && status == 401 && "/login".equals(request.getUrl().getPath())) return;
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
        if (selected == 1) select(0);
        else pages[0].evaluateJavascript("Boolean(window.__mdSalesModalOpen)", value -> {
            if ("true".equals(value)) pages[0].evaluateJavascript("window.__mdCloseSalesModal()", null);
            else backFromSalon();
        });
    }
    private void backFromSalon() {
        if (pages[0].canGoBack()) pages[0].goBack(); else super.onBackPressed();
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
