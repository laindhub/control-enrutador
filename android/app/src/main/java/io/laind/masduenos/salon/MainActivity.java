package io.laind.masduenos.salon;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
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
import android.widget.ImageView;
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
    private final boolean[] loadFailed = {false, false};
    private final boolean[] temporaryErrors = {false, false};
    private final boolean[] retrySafe = {true, true};
    private final int[] attempts = {0, 0};
    private final String[] errors = {"No se pudo cargar la página.", "No se pudo cargar la página."};
    private final String[] errorTitles = {"No pudimos conectar", "No pudimos conectar"};
    private final Runnable[] retries = new Runnable[2];
    private final WebView[] pages = new WebView[2];
    private ProgressBar progress;
    private LinearLayout errorBox;
    private TextView errorText;
    private TextView errorTitle;
    private TextView errorHint;
    private Button retryButton;
    private int selected = 0;
    private boolean resumed;
    private boolean salesPrepared;
    private String navigationScript = "";
    private ValueCallback<Uri[]> fileResult;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        configureLightStatusBar();
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
        createConnectionScreen(frame);

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

    /** Keep the clock, signal and battery dark against the salon's white status-bar background. */
    private void configureLightStatusBar() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.WHITE);
        View decor = window.getDecorView();
        decor.setSystemUiVisibility(decor.getSystemUiVisibility() | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = decor.getWindowInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS);
            }
        }
    }

    /** Branded native connection state; no network needed to display it. */
    private void createConnectionScreen(FrameLayout frame) {
        final int black=Color.rgb(22,22,22), muted=Color.rgb(105,105,105), red=Color.rgb(216,37,27);
        errorBox = new LinearLayout(this);
        errorBox.setOrientation(LinearLayout.VERTICAL);
        errorBox.setBackgroundColor(Color.WHITE);

        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.setPadding(dp(20),dp(12),dp(20),dp(12));
        TextView brand = new TextView(this);
        brand.setText("Salón");
        brand.setTextSize(22);
        brand.setTextColor(black);
        brand.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(brand,new LinearLayout.LayoutParams(0,dp(52),1));
        TextView identity = new TextView(this);
        identity.setText("Más Dueños");
        identity.setTextSize(13);
        identity.setTextColor(muted);
        identity.setPadding(dp(14),dp(9),dp(14),dp(9));
        identity.setBackground(roundBackground(Color.WHITE,dp(24),Color.rgb(229,229,229)));
        heading.addView(identity);
        errorBox.addView(heading,new LinearLayout.LayoutParams(-1,dp(76)));
        View separator = new View(this);
        separator.setBackgroundColor(Color.rgb(237,237,237));
        errorBox.addView(separator,new LinearLayout.LayoutParams(-1,dp(1)));

        LinearLayout center = new LinearLayout(this);
        center.setGravity(Gravity.CENTER);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setPadding(dp(20),dp(24),dp(20),dp(24));
        errorBox.addView(center,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(24),dp(26),dp(24),dp(26));
        card.setBackground(roundBackground(Color.WHITE,dp(22),Color.rgb(229,229,229)));
        int screenWidth=getResources().getDisplayMetrics().widthPixels;
        center.addView(card,new LinearLayout.LayoutParams(Math.min(dp(440),Math.max(dp(260),screenWidth-dp(40))),-2));

        ImageView icon = new ImageView(this);
        icon.setImageResource(R.drawable.app_icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
        icon.setBackground(roundBackground(Color.WHITE,dp(12),0));
        icon.setClipToOutline(true);
        card.addView(icon,new LinearLayout.LayoutParams(dp(58),dp(58)));

        errorTitle = new TextView(this);
        errorTitle.setTextColor(black);
        errorTitle.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        errorTitle.setTextSize(23);
        LinearLayout.LayoutParams titleLayout=new LinearLayout.LayoutParams(-1,-2);
        titleLayout.topMargin=dp(20);
        card.addView(errorTitle,titleLayout);

        errorText = new TextView(this);
        errorText.setTextColor(muted);
        errorText.setTextSize(15);
        errorText.setLineSpacing(dp(4),1f);
        LinearLayout.LayoutParams messageLayout=new LinearLayout.LayoutParams(-1,-2);
        messageLayout.topMargin=dp(10);
        card.addView(errorText,messageLayout);

        retryButton=button("Reintentar",()->{
            attempts[selected]=0;
            cancelRetry(selected);
            errorHint.setText("Reintentando conexión…");
            // Never replay a failed POST or another unsafe request.
            if(retrySafe[selected]) pages[selected].reload();
            else pages[selected].loadUrl(selected==0?SALON_URL:PREPARE_URL);
        });
        retryButton.setTextColor(Color.WHITE);
        retryButton.setTextSize(16);
        retryButton.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        retryButton.setElevation(0);
        retryButton.setBackground(roundBackground(red,dp(13),0));
        LinearLayout.LayoutParams buttonLayout=new LinearLayout.LayoutParams(-1,dp(52));
        buttonLayout.topMargin=dp(23);
        card.addView(retryButton,buttonLayout);

        errorHint = new TextView(this);
        errorHint.setTextColor(muted);
        errorHint.setTextSize(12);
        errorHint.setLineSpacing(dp(3),1f);
        LinearLayout.LayoutParams hintLayout=new LinearLayout.LayoutParams(-1,-2);
        hintLayout.topMargin=dp(16);
        card.addView(errorHint,hintLayout);

        TextView reassurance=new TextView(this);
        reassurance.setText("No necesitás cerrar sesión ni reinstalar la aplicación.");
        reassurance.setTextSize(12);
        reassurance.setTextColor(muted);
        reassurance.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams reassuranceLayout=new LinearLayout.LayoutParams(-1,-2);
        reassuranceLayout.topMargin=dp(18);
        center.addView(reassurance,reassuranceLayout);

        frame.addView(errorBox,new FrameLayout.LayoutParams(-1,-1));
        errorBox.setVisibility(View.GONE);
    }

    private GradientDrawable roundBackground(int color,float radius,int stroke) {
        GradientDrawable drawable=new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        if(stroke!=0)drawable.setStroke(dp(1),stroke);
        return drawable;
    }

    private void showError(int index) {
        errorTitle.setText(errorTitles[index]);
        errorText.setText(errors[index]);
        retryButton.setText(retrySafe[index]?"Reintentar":"Volver al inicio");
        errorHint.setText(temporaryErrors[index]&&retrySafe[index]
            ?"Reintentaremos automáticamente. Tus datos y tu sesión se conservan."
            :"Tus datos y tu sesión se conservan. Podés volver a intentarlo.");
        errorBox.setVisibility(View.VISIBLE);
        progress.setVisibility(View.GONE);
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
                loadFailed[index]=false;
                if (selected == index && !failed[index]) {
                    errorBox.setVisibility(View.GONE);
                    progress.setVisibility(View.VISIBLE);
                }
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
                if (!loadFailed[index]) {
                    failed[index]=false;
                    attempts[index]=0;
                    cancelRetry(index);
                    if(selected==index) errorBox.setVisibility(View.GONE);
                }
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
                loadFailed[index]=true;
                retrySafe[index] = "GET".equals(request.getMethod());
                fail(index,"No pudimos conectar",
                    "No logramos cargar Salón. Revisá tu conexión e intentá nuevamente.",true);
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (!request.isForMainFrame()) return;
                int status = response.getStatusCode();
                if (index == 1 && status == 401 && "/login".equals(request.getUrl().getPath())) return;
                loadFailed[index]=true;
                retrySafe[index]="GET".equals(request.getMethod());
                if(status==408||status==429||status>=500)
                    fail(index,"Servicio temporalmente no disponible",
                        "El servidor está ocupado o en mantenimiento ("+status+"). Intentá nuevamente en unos segundos.",true);
                else fail(index,"No pudimos abrir esta página",
                    "El sitio respondió con un error ("+status+"). Podés reintentar sin cerrar sesión.",false);
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
        if(failed[selected])showError(selected);
        else errorBox.setVisibility(View.GONE);
        progress.setProgress(pages[selected].getProgress());
        progress.setVisibility(pages[selected].getProgress() < 100 && !failed[selected] ? View.VISIBLE : View.GONE);
    }
    private void fail(int index,String title,String message,boolean temporary) {
        failed[index]=true;
        errorTitles[index]=title;
        errors[index]=message;
        temporaryErrors[index]=temporary;
        if(selected==index)showError(index);
        if(temporary)scheduleRetry(index,Math.min(30000,2000L<<Math.min(attempts[index]++,4)));
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
        configureLightStatusBar();
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
