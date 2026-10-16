package io.laind.masduenos.tv;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.view.TextureView;
import android.graphics.SurfaceTexture;
import android.graphics.Matrix;
import android.view.animation.DecelerateInterpolator;
import android.view.Surface;
import android.widget.Toast;
import android.media.MediaPlayer;
import org.json.JSONObject;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.graphics.drawable.GradientDrawable;
import android.content.res.Configuration;
import android.content.res.ColorStateList;
import android.widget.TextView;
import java.io.*;
import java.util.HashMap;
import java.util.Map;

/** Remote-first TV launcher. No mouse, login, filesystem permission or editable CRM. */
public final class TvActivity extends Activity {
    private static final String ASSET_HOST="appassets.androidplatform.net";
    private static final String LOCAL="https://"+ASSET_HOST+"/tv/";
    private TvAssetStore files;
    private FrameLayout frame;
    private LinearLayout menu;
    private LinearLayout checkingPanel;
    private ScrollView menuSurface;
    private TextView pptxStatus,videoStatus,notice;
    private ProgressBar pptxProgress,videoProgress;
    private Button open,retry;
    private TextView offlineStatus;
    private WebView player;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private boolean inPlayer=false;
    // The prepared WebView stays loaded while the native main menu is shown.
    // Pressing Back suspends the presentation, not its PPTX or cached slides.
    private boolean playerLoaded=false;
    // Launch the locally stored deck as soon as BOTH media sync attempts finish.
    // Returning with Back keeps the native menu open until the user requests it.
    private boolean autoOpenAfterSync=true;
    private FrameLayout introLayer;
    private TextureView introTexture;
    private MediaPlayer introMedia;
    private Surface introSurface;
    private int introVideoWidth;
    private int introVideoHeight;
    private boolean introNativeActive=false;
    private boolean introRevealed=false;
    private boolean introStopping=false;
    private GeraldinePlayer geraldine;


    // Flat opaque palette: premium red/black without blurred surfaces,
    // looping effects or offscreen render layers on budget Android TVs.
    private static final int TV_BLACK=Color.rgb(9,10,13);
    private static final int TV_PANEL=Color.rgb(23,24,29);
    private static final int TV_CARD=Color.rgb(30,31,37);
    private static final int TV_RED=Color.rgb(216,37,27);
    private static final int TV_RED_FOCUS=Color.rgb(235,55,45);
    private static final int TV_WHITE=Color.rgb(249,249,251);
    private static final int TV_MUTED=Color.rgb(169,172,183);
    private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private TextView text(String content,int size,int color,boolean bold){
        TextView view=new TextView(this);
        view.setText(content);view.setTextSize(size);view.setTextColor(color);
        if(bold)view.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        return view;
    }
    private LinearLayout vertical(){
        LinearLayout l=new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL);return l;
    }
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        files=new TvAssetStore(this);
        frame=new FrameLayout(this);frame.setBackgroundColor(TV_BLACK);
        setContentView(frame);
        createMenu();
        geraldine=new GeraldinePlayer(this,frame,error->{
            if(!error.isEmpty())Log.e("MasDuenosTV","Geraldine: "+error);
            if(inPlayer&&player!=null)
                player.evaluateJavascript("window.tvNativeGeraldineEnded?.("+JSONObject.quote(error)+")",null);
        });
        player=new WebView(this);
        player.setBackgroundColor(Color.BLACK);
        player.setVisibility(View.GONE);
        player.setFocusable(true);player.setFocusableInTouchMode(true);
        WebSettings web=player.getSettings();
        web.setJavaScriptEnabled(true);
        web.setDomStorageEnabled(true);
        web.setMediaPlaybackRequiresUserGesture(false);
        web.setAllowFileAccess(false);
        web.setAllowContentAccess(false);
        web.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setCacheMode(WebSettings.LOAD_DEFAULT);
        player.setOverScrollMode(View.OVER_SCROLL_NEVER);
        player.setWebViewClient(new LocalClient());
        // Native playback avoids WebView's virtual-URL streaming and user-gesture
        // limitations for the locally downloaded 280 MB introduction video.
        player.addJavascriptInterface(new IntroBridge(),"AndroidTv");
        player.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onConsoleMessage(ConsoleMessage info){
                Log.w("MasDuenosTV",info.message()+" ["+info.sourceId()+":"+info.lineNumber()+"]");
                return true;
            }
            @Override public void onShowCustomView(View view,CustomViewCallback callback){
                if(customView!=null){callback.onCustomViewHidden();return;}
                customView=view;customCallback=callback;
                frame.addView(view,new FrameLayout.LayoutParams(-1,-1));
                view.requestFocus();
            }
            @Override public void onHideCustomView(){hideCustom();}
        });
        frame.addView(player,new FrameLayout.LayoutParams(-1,-1));
        open.setEnabled(files.has("presentation"));
        open.requestFocus();
        refresh(false);
    }
    private void hideCustom(){
        if(customView==null)return;
        frame.removeView(customView);customView=null;
        if(customCallback!=null){customCallback.onCustomViewHidden();customCallback=null;}
        player.requestFocus();
    }
    private GradientDrawable panelBackground(int color,int stroke,int radius){
        GradientDrawable bg=new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(radius));
        if(stroke!=0)bg.setStroke(dp(1),stroke);
        return bg;
    }
    private GradientDrawable actionBackground(boolean primary,boolean focused){
        int fill=primary?(focused?TV_RED_FOCUS:TV_RED):
            (focused?Color.rgb(49,34,38):TV_CARD);
        int border=focused?TV_WHITE:(primary?Color.rgb(222,70,64):Color.rgb(72,42,45));
        GradientDrawable drawable=panelBackground(fill,border,22);
        drawable.setStroke(dp(focused?2:1),border);
        return drawable;
    }
    private void styleAction(Button button,boolean primary,boolean compact){
        button.setAllCaps(false);
        button.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        button.setTextColor(TV_WHITE);
        button.setTextSize(compact?17:20);
        button.setGravity(Gravity.CENTER_VERTICAL|Gravity.LEFT);
        button.setMinHeight(dp(compact?56:68));
        button.setMinimumHeight(0);
        button.setPadding(dp(21),dp(12),dp(20),dp(12));
        button.setBackgroundTintList(null);
        button.setStateListAnimator(null);
        button.setBackground(actionBackground(primary,false));
        button.setFocusable(true);
    }
    private void createMenu(){
        // Single-screen 10-foot interface. The native view tree remains GONE
        // throughout playback, so it never draws/reflows or intercepts input.
        int widthDp=getResources().getConfiguration().screenWidthDp;
        int heightDp=getResources().getConfiguration().screenHeightDp;
        boolean compact=heightDp<650;
        int edge=dp(compact?16:28);
        int gap=dp(compact?10:16);
        menuSurface=new ScrollView(this);
        menuSurface.setFillViewport(true);
        menuSurface.setBackgroundColor(TV_BLACK);
        menuSurface.setVerticalScrollBarEnabled(false);
        menuSurface.setOverScrollMode(View.OVER_SCROLL_NEVER);
        menuSurface.setClipToPadding(false);
        frame.addView(menuSurface,new FrameLayout.LayoutParams(-1,-1));

        LinearLayout viewport=vertical();
        viewport.setGravity(Gravity.CENTER_HORIZONTAL|Gravity.CENTER_VERTICAL);
        viewport.setPadding(edge,edge,edge,edge);
        menuSurface.addView(viewport,new ScrollView.LayoutParams(-1,-2));

        menu=vertical();
        menu.setPadding(dp(compact?20:32),dp(compact?20:30),
            dp(compact?20:32),dp(compact?20:30));
        menu.setBackground(panelBackground(TV_PANEL,Color.rgb(83,39,42),30));
        LinearLayout.LayoutParams container=new LinearLayout.LayoutParams(-1,-2);
        int available=Math.max(dp(280),getResources().getDisplayMetrics().widthPixels-2*edge);
        container.width=Math.min(dp(widthDp<800?710:860),available);
        viewport.addView(menu,container);

        // Reuse the shipping brand artwork. No network/image decoding or
        // additional asset download is required.
        LinearLayout brand=new LinearLayout(this);
        brand.setOrientation(LinearLayout.HORIZONTAL);
        brand.setGravity(Gravity.CENTER_VERTICAL);
        menu.addView(brand,new LinearLayout.LayoutParams(-1,-2));
        ImageView brandIcon=new ImageView(this);
        brandIcon.setImageResource(R.drawable.tv_icon);
        brandIcon.setScaleType(ImageView.ScaleType.FIT_CENTER);
        brandIcon.setBackground(panelBackground(TV_RED,0,13));
        brandIcon.setClipToOutline(true);
        brand.addView(brandIcon,new LinearLayout.LayoutParams(dp(compact?44:52),dp(compact?44:52)));

        LinearLayout branding=vertical();
        LinearLayout.LayoutParams brandText=new LinearLayout.LayoutParams(-1,-2);
        brandText.leftMargin=dp(14);
        brand.addView(branding,brandText);
        TextView logoName=text("MÁS DUEÑOS",compact?15:18,TV_WHITE,true);
        logoName.setLetterSpacing(.12f);
        branding.addView(logoName);
        TextView branch=text("TV   /   LINIERS",compact?11:13,TV_RED_FOCUS,true);
        branch.setLetterSpacing(.15f);
        branch.setPadding(0,dp(3),0,0);
        branding.addView(branch);

        TextView heading=text("Presentación comercial",compact?30:43,TV_WHITE,true);
        LinearLayout.LayoutParams hero=new LinearLayout.LayoutParams(-1,-2);
        hero.topMargin=dp(compact?18:25);
        menu.addView(heading,hero);
        TextView subtitle=text("Todo preparado para continuar tu charla.",
            compact?15:18,TV_MUTED,false);
        LinearLayout.LayoutParams subtitleLayout=new LinearLayout.LayoutParams(-1,-2);
        subtitleLayout.topMargin=dp(compact?4:6);
        menu.addView(subtitle,subtitleLayout);

        // Persistent offline-ready card, independent from any sync progress.
        LinearLayout readyCard=new LinearLayout(this);
        readyCard.setOrientation(LinearLayout.HORIZONTAL);
        readyCard.setGravity(Gravity.CENTER_VERTICAL);
        readyCard.setPadding(dp(17),dp(compact?11:16),dp(17),dp(compact?11:16));
        readyCard.setBackground(panelBackground(TV_CARD,Color.rgb(48,49,57),17));
        LinearLayout.LayoutParams readyLayout=new LinearLayout.LayoutParams(-1,-2);
        readyLayout.topMargin=dp(compact?18:26);
        menu.addView(readyCard,readyLayout);
        View readyDot=new View(this);
        readyDot.setBackground(panelBackground(TV_RED,0,5));
        readyCard.addView(readyDot,new LinearLayout.LayoutParams(dp(9),dp(9)));
        offlineStatus=text("PREPARANDO CONTENIDO LOCAL",compact?13:15,TV_WHITE,true);
        offlineStatus.setLetterSpacing(.025f);
        LinearLayout.LayoutParams readyText=new LinearLayout.LayoutParams(-1,-2);
        readyText.leftMargin=dp(12);
        readyCard.addView(offlineStatus,readyText);

        LinearLayout actions=vertical();
        LinearLayout.LayoutParams actionLayout=new LinearLayout.LayoutParams(-1,-2);
        actionLayout.topMargin=dp(compact?17:24);
        menu.addView(actions,actionLayout);
        open=new Button(this);
        open.setText("▶   Abrir presentación");
        styleAction(open,true,compact);
        open.setOnClickListener(v->openPlayer());
        actions.addView(open,new LinearLayout.LayoutParams(-1,-2));

        retry=new Button(this);
        retry.setText("↻   Buscar actualizaciones");
        styleAction(retry,false,compact);
        retry.setOnClickListener(v->{
            if(inPlayer)return;
            checkingPanel.setVisibility(View.VISIBLE);
            autoOpenAfterSync=false;
            refresh(true);
        });
        LinearLayout.LayoutParams retryLayout=new LinearLayout.LayoutParams(-1,-2);
        retryLayout.topMargin=dp(10);
        actions.addView(retry,retryLayout);

        // Only visible on initial setup or when the user explicitly chooses
        // updates. No progress bars/labels update during slide playback.
        checkingPanel=vertical();
        checkingPanel.setPadding(dp(17),dp(14),dp(17),dp(14));
        checkingPanel.setBackground(panelBackground(TV_CARD,Color.rgb(60,43,46),18));
        LinearLayout.LayoutParams checkingLayout=new LinearLayout.LayoutParams(-1,-2);
        checkingLayout.topMargin=dp(14);
        menu.addView(checkingPanel,checkingLayout);
        TextView filesTitle=text("ARCHIVOS Y SINCRONIZACIÓN",
            compact?11:13,TV_RED_FOCUS,true);
        filesTitle.setLetterSpacing(.09f);
        checkingPanel.addView(filesTitle);

        pptxStatus=text("PowerPoint · comprobando…",compact?13:15,TV_WHITE,false);
        pptxStatus.setPadding(0,dp(12),0,dp(7));
        checkingPanel.addView(pptxStatus);
        pptxProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        pptxProgress.setMax(100);
        pptxProgress.setProgressTintList(ColorStateList.valueOf(TV_RED));
        pptxProgress.setProgressBackgroundTintList(ColorStateList.valueOf(Color.rgb(58,59,65)));
        checkingPanel.addView(pptxProgress,new LinearLayout.LayoutParams(-1,dp(5)));

        videoStatus=text("Introducción MP4 · comprobando…",compact?13:15,TV_WHITE,false);
        videoStatus.setPadding(0,dp(13),0,dp(7));
        checkingPanel.addView(videoStatus);
        videoProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        videoProgress.setMax(100);
        videoProgress.setProgressTintList(ColorStateList.valueOf(TV_RED));
        videoProgress.setProgressBackgroundTintList(ColorStateList.valueOf(Color.rgb(58,59,65)));
        checkingPanel.addView(videoProgress,new LinearLayout.LayoutParams(-1,dp(5)));
        notice=text("Preparando archivos…",compact?12:14,TV_MUTED,false);
        notice.setPadding(0,dp(13),0,0);
        checkingPanel.addView(notice);

        TextView tips=text("OK para seleccionar    ·    Atrás para volver al menú",
            compact?12:14,TV_MUTED,false);
        LinearLayout.LayoutParams tipsLayout=new LinearLayout.LayoutParams(-1,-2);
        tipsLayout.topMargin=dp(compact?18:24);
        menu.addView(tips,tipsLayout);

        // Focus and scrolling run ONLY while this menu is visible. Animations
        // are one-shot, cancelled immediately when the slides become visible.
        View.OnFocusChangeListener focus=(v,hasFocus)->{
            if(inPlayer||menuSurface.getVisibility()!=View.VISIBLE)return;
            v.animate().cancel();
            v.animate().scaleX(hasFocus?1.025f:1f)
                .scaleY(hasFocus?1.025f:1f).setDuration(105).start();
            v.setBackground(actionBackground(v==open,hasFocus));
            if(hasFocus)menuSurface.post(()->{
                if(inPlayer||menuSurface.getVisibility()!=View.VISIBLE)return;
                android.graphics.Rect rect=new android.graphics.Rect();
                v.getDrawingRect(rect);
                menuSurface.offsetDescendantRectToMyCoords(v,rect);
                int availableHeight=menuSurface.getHeight()-dp(28);
                if(rect.bottom>menuSurface.getScrollY()+availableHeight)
                    menuSurface.smoothScrollTo(0,
                        Math.max(0,rect.bottom-availableHeight));
            });
        };
        open.setOnFocusChangeListener(focus);
        retry.setOnFocusChangeListener(focus);
        open.setId(View.generateViewId());
        retry.setId(View.generateViewId());
        open.setNextFocusDownId(retry.getId());
        retry.setNextFocusUpId(open.getId());
        // No animation loops, video backgrounds, WebView or timers in menu.
    }
    private void suspendMenuRendering(){
        // GONE excludes the complete native menu subtree from layout/drawing.
        // Cancel pending focus animations; progress observers are gated too.
        open.animate().cancel();
        retry.animate().cancel();
        open.setScaleX(1f);open.setScaleY(1f);
        retry.setScaleX(1f);retry.setScaleY(1f);
        menuSurface.clearFocus();
        menuSurface.setImportantForAccessibility(
            View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        menuSurface.setVisibility(View.GONE);
    }
    private void showMenuRendering(){
        menuSurface.setImportantForAccessibility(
            View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        menuSurface.setVisibility(View.VISIBLE);
        menuSurface.bringToFront();
        offlineStatus.setText(files.has("presentation")?
            "CONTENIDO LOCAL DISPONIBLE · SIN WI-FI":
            "ARCHIVOS NO DISPONIBLES");
        open.setEnabled(files.has("presentation"));
        open.requestFocus();
    }
    private void refresh(boolean checkUpdates){
        if(!inPlayer&&menuSurface.getVisibility()==View.VISIBLE)
            retry.setEnabled(false);
        files.refresh(new TvAssetStore.Listener(){
            @Override public void status(String kind,long received,long total,String phase){
                // A download can finish while the presenter is on a slide.
                // Do not touch labels, progress, focus or layout offscreen.
                if(inPlayer||menuSurface.getVisibility()!=View.VISIBLE||
                   checkingPanel.getVisibility()!=View.VISIBLE)return;
                boolean deck=kind.equals("presentation");
                ProgressBar progress=deck?pptxProgress:videoProgress;
                TextView label=deck?pptxStatus:videoStatus;
                String title=deck?"PowerPoint":"Introducción MP4";
                int pct=total>0?(int)Math.min(100,received*100/total):0;
                if(phase.equals("descargando")){
                    label.setText(title+" · "+pct+" % · "+String.format(java.util.Locale.ROOT,
                        "%.1f / %.1f MB",received/1048576d,total/1048576d));
                }else if(phase.equals("guardado")){
                    label.setText(title+" · guardado y listo");
                }else if(phase.equals("anterior")){
                    label.setText(title+" · versión anterior disponible");
                }else if(phase.equals("no-disponible")){
                    label.setText(title+" · todavía no disponible");
                }else if(phase.equals("guardando")){
                    label.setText(title+" · verificando y guardando...");
                }else{
                    label.setText(title+" · "+phase);
                }
                int target=total>0?pct:0;
                if(progress.getProgress()!=target)progress.setProgress(target);
            }
            @Override public void complete(boolean playable,String message){
                if(!inPlayer&&menuSurface.getVisibility()==View.VISIBLE){
                    notice.setText(message);
                    retry.setEnabled(true);
                    open.setEnabled(playable);
                    offlineStatus.setText(playable?
                        "CONTENIDO LOCAL DISPONIBLE · SIN WI-FI":
                        "ARCHIVOS NO DISPONIBLES");
                }
                // Extract and decode the first frame while other slides load.
                if(playable&&geraldine!=null){
                    String fingerprint=getSharedPreferences("tv-files-v1",MODE_PRIVATE)
                        .getString("presentation.sha","");
                    geraldine.warm(files.file("presentation"),fingerprint);
                }
                if(playable && autoOpenAfterSync && !inPlayer){
                    // Called only by TvAssetStore.complete, which is posted
                    // after PPTX and MP4 were checked / downloaded and saved.
                    // Navigate to the same native-cached "Preparando presentación"
                    // screen as the former manual "Abrir presentación" button.
                    autoOpenAfterSync=false;
                    openPlayer();
                }else if(playable && !inPlayer){
                    open.requestFocus();
                }
            }
        },checkUpdates);
    }
    // JS-to-native bridge. The interface contains no file paths or arbitrary URLs.
    // Only the fixed, SHA-256-verified introduction in private app storage plays.
    private final class IntroBridge {
        @JavascriptInterface public void exitPresentation(){
            runOnUiThread(()->{
                if(inPlayer)returnMenu();
            });
        }
        @JavascriptInterface public void playIntroduction(){
            runOnUiThread(()->startNativeIntroduction());
        }
        @JavascriptInterface public void previewGeraldine(double x,double y,double w,double h){
            runOnUiThread(()->{
                if(!inPlayer||introNativeActive||!files.has("presentation"))return;
                String digest=getSharedPreferences("tv-files-v1",MODE_PRIVATE)
                    .getString("presentation.sha","");
                geraldine.preview(files.file("presentation"),digest,x,y,w,h);
            });
        }
        @JavascriptInterface public void playGeraldine(double x,double y,double w,double h){
            runOnUiThread(()->{
                if(!inPlayer||introNativeActive||!files.has("presentation"))return;
                String digest=getSharedPreferences("tv-files-v1",MODE_PRIVATE)
                    .getString("presentation.sha","");
                geraldine.play(files.file("presentation"),digest,x,y,w,h);
            });
        }
        @JavascriptInterface public void stopGeraldine(){
            runOnUiThread(()->geraldine.dismiss());
        }
    }
    private void sendIntroResult(String error){
        if(!inPlayer||player==null)return;
        // Quotes are escaped for a JS string; the HTML player is trusted local code.
        player.evaluateJavascript("window.tvNativeIntroEnded?.("+JSONObject.quote(error)+")",null);
    }
    /**
     * Native video renderer attached to the actual Activity composition.
     *
     * VideoView is backed by a SurfaceView; on some phones and TV firmwares
     * its video surface is composited behind WebView, yielding audio but a
     * completely black video. TextureView instead participates in the same
     * view hierarchy as the WebView and our overlay, so the video pixels are
     * actually drawn above the slides. DO NOT give TextureView an opaque
     * background; the surrounding FrameLayout supplies the black bars.
     */
    private void startNativeIntroduction(){
        if(!inPlayer||introNativeActive)return;
        if(geraldine!=null)geraldine.dismiss();
        if(!files.has("introduction")){
            sendIntroResult("El video introductorio no está guardado. Volvé al menú y buscá actualizaciones.");
            return;
        }
        introNativeActive=true;
        introRevealed=false;
        introStopping=false;
        introVideoWidth=0;
        introVideoHeight=0;
        introLayer=new FrameLayout(this);
        introLayer.setBackgroundColor(Color.BLACK);
        // Fade applies ONLY to the introduction, never to PPTX navigation.
        // Keep the slides visible while the native 280 MB MP4 prepares.
        introLayer.setAlpha(0f);
        introLayer.setFocusable(true);
        final TextureView texture=new TextureView(this);
        introTexture=texture;
        // A fullscreen TextureView scales the original video to fit without
        // cropping. Keeping the background ONLY on introLayer is essential.
        introLayer.addView(texture,new FrameLayout.LayoutParams(-1,-1,Gravity.CENTER));
        frame.addView(introLayer,new FrameLayout.LayoutParams(-1,-1));
        introLayer.bringToFront();
        introLayer.requestFocus();
        texture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
            @Override public void onSurfaceTextureAvailable(SurfaceTexture surface,int width,int height){
                if(introNativeActive&&texture==introTexture)
                    prepareNativeIntroduction(surface);
            }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture surface,int width,int height){
                fitNativeIntroToScreen();
            }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture surface){
                if(introNativeActive&&texture==introTexture)
                    stopNativeIntroduction(true,"Se perdió la superficie de video; volvé a iniciar la introducción.");
                return true;
            }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture surface){
                // Some TV decoders don't emit VIDEO_RENDERING_START. The first
                // real TextureView frame is a safe fallback for the fade-in.
                if(introNativeActive && introMedia!=null)revealNativeIntroduction();
            }
        });
    }
    private void prepareNativeIntroduction(SurfaceTexture surfaceTexture){
        MediaPlayer engine=null;
        Surface surface=null;
        try {
            surface=new Surface(surfaceTexture);
            engine=new MediaPlayer();
            introMedia=engine;
            introSurface=surface;
            final MediaPlayer current=engine;
            engine.setSurface(surface);
            engine.setAudioStreamType(android.media.AudioManager.STREAM_MUSIC);
            engine.setOnPreparedListener(mp->{
                if(introNativeActive&&introMedia==mp){
                    introVideoWidth=mp.getVideoWidth();
                    introVideoHeight=mp.getVideoHeight();
                    fitNativeIntroToScreen();
                    mp.start();
                    Log.i("MasDuenosTV","Intro preparada: video "+introVideoWidth+
                        "x"+introVideoHeight+", textura="+(introTexture!=null));
                }
            });
            engine.setOnVideoSizeChangedListener((mp,w,h)->{
                if(introNativeActive&&introMedia==mp){
                    introVideoWidth=w;
                    introVideoHeight=h;
                    fitNativeIntroToScreen();
                }
            });
            engine.setOnInfoListener((mp,what,extra)->{
                if(what==MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START){
                    Log.i("MasDuenosTV","Primer cuadro de introducción renderizado en TextureView");
                    revealNativeIntroduction();
                }
                return false;
            });
            engine.setOnCompletionListener(mp->{
                if(introMedia==mp)fadeOutNativeIntroduction(true,null);
            });
            engine.setOnErrorListener((mp,what,extra)->{
                Log.e("MasDuenosTV","Error de introduccion nativa: "+what+", "+extra);
                if(introMedia==mp)stopNativeIntroduction(true,
                    "No se pudo decodificar el video introductorio (código "+what+", "+extra+").");
                return true;
            });
            // Only the file already downloaded and verified by TvAssetStore.
            engine.setDataSource(files.file("introduction").getAbsolutePath());
            engine.prepareAsync();
        }catch(Exception error){
            Log.e("MasDuenosTV","No se pudo preparar el video para TextureView",error);
            stopNativeIntroduction(true,"No se pudo abrir la imagen del video introductorio.");
        }
    }
    private void fitNativeIntroToScreen(){
        TextureView texture=introTexture;
        if(texture==null||introVideoWidth<=0||introVideoHeight<=0)return;
        float w=texture.getWidth(),h=texture.getHeight();
        if(w<=0||h<=0)return;
        float videoRatio=(float)introVideoWidth/introVideoHeight;
        float frameRatio=w/h;
        float scaleX=1f,scaleY=1f;
        if(videoRatio>frameRatio)scaleY=frameRatio/videoRatio;
        else scaleX=videoRatio/frameRatio;
        Matrix transform=new Matrix();
        transform.setScale(scaleX,scaleY,w/2f,h/2f);
        texture.setTransform(transform);
    }
    private void revealNativeIntroduction(){
        if(!introNativeActive||introRevealed||introStopping||introLayer==null)return;
        introRevealed=true;
        introLayer.animate().cancel();
        introLayer.animate().alpha(1f).setDuration(190)
            .setInterpolator(new DecelerateInterpolator()).start();
    }
    private void fadeOutNativeIntroduction(boolean notifyWeb,String error){
        if(!introNativeActive||introStopping)return;
        introStopping=true;
        final FrameLayout leaving=introLayer;
        if(leaving==null||leaving.getAlpha()<0.05f||error!=null){
            stopNativeIntroduction(notifyWeb,error);
            return;
        }
        // Native overlay dissolves back to the same still-open slide.
        leaving.animate().cancel();
        leaving.animate().alpha(0f).setDuration(190)
            .setInterpolator(new DecelerateInterpolator())
            .withEndAction(()->{
                if(introNativeActive&&introLayer==leaving)
                    stopNativeIntroduction(notifyWeb,error);
            }).start();
    }
    private void stopNativeIntroduction(boolean notifyWeb,String error){
        introNativeActive=false;
        introRevealed=false;
        introStopping=false;
        MediaPlayer engine=introMedia;
        introMedia=null;
        if(engine!=null){
            engine.setOnPreparedListener(null);
            engine.setOnCompletionListener(null);
            engine.setOnErrorListener(null);
            engine.setOnVideoSizeChangedListener(null);
            engine.setOnInfoListener(null);
            try{engine.release();}catch(Exception e){
                Log.w("MasDuenosTV","Error al liberar el decodificador de video",e);
            }
        }
        Surface surface=introSurface;
        introSurface=null;
        if(surface!=null)surface.release();
        TextureView texture=introTexture;
        introTexture=null;
        if(texture!=null)texture.setSurfaceTextureListener(null);
        if(introLayer!=null){
            introLayer.animate().cancel();
            frame.removeView(introLayer);
            introLayer=null;
        }
        introVideoWidth=0;
        introVideoHeight=0;
        if(inPlayer&&player!=null)player.requestFocus();
        if(notifyWeb){
            if(error!=null)Toast.makeText(this,error,Toast.LENGTH_LONG).show();
            sendIntroResult(error==null?"":error);
        }
    }
    private void seekNativeIntroduction(int seconds){
        MediaPlayer video=introMedia;
        if(video==null||!introNativeActive)return;
        try {
            int now=Math.max(0,video.getCurrentPosition());
            int duration=video.getDuration();
            long target=Math.max(0L,(long)now+seconds*1000L);
            if(duration>0)target=Math.min(target,duration);
            video.seekTo((int)Math.min(Integer.MAX_VALUE,target));
        }catch(IllegalStateException e){
            Log.w("MasDuenosTV","La introducción todavía se está preparando",e);
        }
    }
    private boolean handleNativeIntroKey(KeyEvent event){
        if(!introNativeActive)return false;
        int code=event.getKeyCode();
        if(event.getAction()==KeyEvent.ACTION_DOWN&&event.getRepeatCount()==0){
            switch(code){
                case KeyEvent.KEYCODE_TAB:
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                case KeyEvent.KEYCODE_BUTTON_A:
                    fadeOutNativeIntroduction(true,null);
                    break;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                case KeyEvent.KEYCODE_DPAD_UP:
                case KeyEvent.KEYCODE_PAGE_UP:
                    seekNativeIntroduction(-5);
                    break;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_DPAD_DOWN:
                case KeyEvent.KEYCODE_PAGE_DOWN:
                    seekNativeIntroduction(5);
                    break;
                default:break;
            }
        }
        // Never forward a remote command to the PPTX while intro is active.
        return true;
    }
    private void openPlayer(){
        if(inPlayer||!files.has("presentation"))return;
        autoOpenAfterSync=false;
        inPlayer=true;
        suspendMenuRendering();
        player.setVisibility(View.VISIBLE);
        if(!playerLoaded){
            playerLoaded=true;
            player.loadUrl(LOCAL+"index.html");
        }else{
            // Continue on exactly the same cached slide, without reloading the
            // PPTX, restarting the offline verification or reentering the WebView.
            player.evaluateJavascript("window.tvMenuResumed?.()",null);
        }
        // Browser fullscreen can be a separate native customView; keep it in
        // front of the WebView when returning to the existing presentation.
        if(customView!=null)customView.bringToFront();
        else player.bringToFront();
        player.requestFocus();
    }
    private void returnMenu(){
        if(!inPlayer)return;
        inPlayer=false;
        autoOpenAfterSync=false;
        if(geraldine!=null)geraldine.dismiss();
        if(introNativeActive)stopNativeIntroduction(false,null);
        // Keep the PPTX viewer, decoded screenshots, current slide and WebView
        // alive. Just close any native movie that was playing and overlay the
        // main menu above the existing fullscreen activity.
        player.evaluateJavascript(
            "window.tvNativeIntroEnded?.('');window.tvNativeGeraldineEnded?.('');",
            null);
        open.setText("▶  Continuar presentación");
        checkingPanel.setVisibility(View.GONE);
        showMenuRendering();
    }
    @Override public void onBackPressed(){
        if(inPlayer)returnMenu();
        else super.onBackPressed();
    }
    /**
     * When the native introduction goes away the WebView may still lack input
     * focus, especially with a USB presentation remote. Dispatch PageUp/Down
     * directly to our trusted local JS controller rather than relying on
     * WebView.dispatchKeyEvent(), which can silently swallow them.
     *
     * Flush the native-intro-ended callback in the SAME JS turn as navigation
     * so even a slow/lost asynchronous callback cannot leave mode='intro'.
     */
    private void dispatchSlideNavigation(String key){
        if(!inPlayer||player==null)return;
        player.evaluateJavascript(
            "window.tvNativeIntroEnded?.('');window.tvRemoteKey?.("+JSONObject.quote(key)+");",
            null);
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event){
        // Return/Back always means MAIN MENU, including during introduction.
        // Consume both key phases; menu return happens once on ACTION_UP.
        if(inPlayer&&(event.getKeyCode()==KeyEvent.KEYCODE_BACK||
                      event.getKeyCode()==KeyEvent.KEYCODE_ESCAPE)){
            if(event.getAction()==KeyEvent.ACTION_UP)returnMenu();
            return true;
        }
        if(introNativeActive)return handleNativeIntroKey(event);
        if(inPlayer){
            int code=event.getKeyCode();
            if(code==KeyEvent.KEYCODE_PAGE_UP||code==KeyEvent.KEYCODE_PAGE_DOWN){
                if(event.getAction()==KeyEvent.ACTION_DOWN && event.getRepeatCount()==0)
                    dispatchSlideNavigation(code==KeyEvent.KEYCODE_PAGE_DOWN?"PageDown":"PageUp");
                // Consume both DOWN and UP to avoid double navigation.
                return true;
            }
            if(code==KeyEvent.KEYCODE_TAB){
                // On several Android TV WebViews, Tab moves focus instead of
                // dispatching DOM keydown. Invoke the exact JS mapping directly.
                if(event.getAction()==KeyEvent.ACTION_DOWN&&event.getRepeatCount()==0)
                    player.evaluateJavascript("window.tvRemoteTab?.()",null);
                return true;
            }
            // Android TV D-pad OK becomes browser Enter; this clicks the
            // focused Start button using the real hardware user gesture.
            if(code==KeyEvent.KEYCODE_DPAD_CENTER ||
               code==KeyEvent.KEYCODE_BUTTON_A ||
               code==KeyEvent.KEYCODE_NUMPAD_ENTER){
                KeyEvent translated=new KeyEvent(event.getDownTime(),event.getEventTime(),
                    event.getAction(),KeyEvent.KEYCODE_ENTER,event.getRepeatCount(),event.getMetaState());
                return player.dispatchKeyEvent(translated);
            }
            // Let actual DPAD arrows, PageUp/Down, Tab, Enter and Escape
            // generate trusted DOM key events in the local TV player.
            if(player.dispatchKeyEvent(event))return true;
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public void onConfigurationChanged(Configuration config){
        // Connecting/disconnecting a USB or Bluetooth keyboard changes
        // keyboard/keyboardHidden/navigation on Android TV. Keep the same
        // Activity, WebView, deck and current slide alive mid-presentation.
        super.onConfigurationChanged(config);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        if(frame!=null)frame.post(()->{
            fitNativeIntroToScreen();
            if(geraldine!=null)geraldine.reposition();
        });
    }
    @Override protected void onDestroy(){
        if(geraldine!=null)geraldine.dismiss();
        if(introNativeActive)stopNativeIntroduction(false,null);
        hideCustom();
        player.destroy();
        super.onDestroy();
    }
    private class LocalClient extends WebViewClient{
        // IMPORTANT: The TV entry module imports the next two local modules.
        // A missing whitelist entry causes Chromium WebView to abandon all
        // module execution silently and freeze on the static loading screen.

        @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
            return !ASSET_HOST.equals(request.getUrl().getHost());
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
            android.net.Uri uri=request.getUrl();
            if(!"https".equals(uri.getScheme())||!ASSET_HOST.equals(uri.getHost()))return null;
            String path=uri.getPath();
            try{
                if(path.equals("/tv/index.html") ||
                   path.equals("/tv/tv.css") ||
                   path.equals("/tv/tv-fonts.css") ||
                   path.equals("/tv/tv.js") ||
                   path.equals("/tv/presentation-media.js") ||
                   path.equals("/tv/presentation-timing.js") ||
                   path.equals("/tv/pptx-viewer-offline.js")){
                    String filename=path.substring(4);
                    InputStream in=getAssets().open(filename);
                    String mime=filename.endsWith(".html")?"text/html":
                        filename.endsWith(".css")?"text/css":"application/javascript";
                    return response(200,"OK",mime,in,0,-1,-1);
                }
                // Exact, locally bundled presentation snapshots. No network.
                if(path.equals("/tv/slides/manifest.json")){
                    return response(200,"OK","application/json",
                        getAssets().open("slides/manifest.json"),0,-1,-1);
                }
                if(path.matches("^/tv/slides/slide-[0-9]{3}\\.jpg$")){
                    return response(200,"OK","image/jpeg",
                        getAssets().open(path.substring(4)),0,-1,-1);
                }
                if(path.equals("/tv/cache/presentation.pptx"))return media("presentation",request);
                if(path.equals("/tv/cache/introduccion.mp4"))return media("introduction",request);
            }catch(Exception e){return response(404,"Not Found","text/plain",
                new ByteArrayInputStream(new byte[0]),0,-1,-1);}
            return response(404,"Not Found","text/plain",
                new ByteArrayInputStream(new byte[0]),0,-1,-1);
        }
        private WebResourceResponse media(String kind,WebResourceRequest request)throws IOException{
            File f=files.file(kind);
            if(!files.has(kind))return response(404,"Not Found","text/plain",
                new ByteArrayInputStream(new byte[0]),0,-1,-1);
            long len=f.length(),start=0,end=len-1;
            String range=null;
            for(Map.Entry<String,String> entry:request.getRequestHeaders().entrySet()){
                if("range".equalsIgnoreCase(entry.getKey()))range=entry.getValue();
            }
            if(range!=null&&range.matches("bytes=[0-9]+-[0-9]*")){
                String[] pieces=range.substring(6).split("-",2);
                try{
                    start=Long.parseLong(pieces[0]);
                    if(pieces.length>1&&!pieces[1].isEmpty())
                        end=Math.min(end,Long.parseLong(pieces[1]));
                }catch(NumberFormatException err){start=len;}
            }
            if(start>=len || end<start){
                WebResourceResponse bad=response(416,"Range Not Satisfiable","text/plain",
                    new ByteArrayInputStream(new byte[0]),0,-1,-1);
                bad.getResponseHeaders().put("Content-Range","bytes */"+len);
                return bad;
            }
            FileInputStream stream=new FileInputStream(f);
            long skipped=0;
            try{
                while(skipped<start){
                    long chunk=stream.skip(start-skipped);
                    if(chunk<=0)throw new EOFException("Error de rango");
                    skipped+=chunk;
                }
            }catch(Exception e){stream.close();throw e;}
            String mime="presentation".equals(kind)?
                "application/vnd.openxmlformats-officedocument.presentationml.presentation":"video/mp4";
            return response(range==null?200:206,range==null?"OK":"Partial Content",
                mime,new LimitStream(stream,end-start+1),start,end,len);
        }
        private WebResourceResponse response(int code,String reason,String mime,
                                             InputStream stream,long start,long end,long total){
            WebResourceResponse result=new WebResourceResponse(mime,null,stream);
            result.setStatusCodeAndReasonPhrase(code,reason);
            Map<String,String> headers=new HashMap<>();
            headers.put("Access-Control-Allow-Origin","*");
            headers.put("Cache-Control","no-store");
            headers.put("Accept-Ranges","bytes");
            if(total>=0){
                headers.put("Content-Length",String.valueOf(end-start+1));
                if(code==206)headers.put("Content-Range","bytes "+start+"-"+end+"/"+total);
            }
            result.setResponseHeaders(headers);
            return result;
        }
    }
    private static final class LimitStream extends FilterInputStream{
        private long remaining;
        LimitStream(InputStream in,long size){super(in);remaining=size;}
        @Override public int read()throws IOException{
            if(remaining<=0)return -1;
            int value=super.read();if(value!=-1)remaining--;return value;
        }
        @Override public int read(byte[] b,int off,int len)throws IOException{
            if(remaining<=0)return -1;
            int n=in.read(b,off,(int)Math.min(remaining,len));
            if(n>0)remaining-=n;return n;
        }
    }
}
