package io.laind.masduenos.tv;

import android.app.Activity;
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
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
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
    private TextView pptxStatus,videoStatus,notice;
    private ProgressBar pptxProgress,videoProgress;
    private Button open,retry;
    private WebView player;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private boolean inPlayer=false;

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
        frame=new FrameLayout(this);frame.setBackgroundColor(Color.rgb(15,16,20));
        setContentView(frame);
        createMenu();
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
        refresh();
    }
    private void hideCustom(){
        if(customView==null)return;
        frame.removeView(customView);customView=null;
        if(customCallback!=null){customCallback.onCustomViewHidden();customCallback=null;}
        player.requestFocus();
    }
    private void createMenu(){
        menu=vertical();menu.setGravity(Gravity.CENTER);
        menu.setPadding(dp(42),dp(28),dp(42),dp(28));
        frame.addView(menu,new FrameLayout.LayoutParams(-1,-1));
        TextView kicker=text("MÁS DUEÑOS  /  LINIERS",19,Color.rgb(230,81,70),true);
        menu.addView(kicker);
        TextView heading=text("Presentación comercial",35,Color.WHITE,true);
        heading.setPadding(0,dp(15),0,dp(26));
        menu.addView(heading);
        TextView info=text("Archivos guardados en este televisor. Se actualizan desde Hostinger.",18,
            Color.rgb(198,198,205),false);
        menu.addView(info);
        pptxStatus=text("PowerPoint · comprobando...",17,Color.WHITE,false);
        pptxStatus.setPadding(0,dp(23),0,dp(6));menu.addView(pptxStatus);
        pptxProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        pptxProgress.setMax(100);menu.addView(pptxProgress,new LinearLayout.LayoutParams(dp(560),dp(7)));
        videoStatus=text("Introducción · comprobando...",17,Color.WHITE,false);
        videoStatus.setPadding(0,dp(23),0,dp(6));menu.addView(videoStatus);
        videoProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        videoProgress.setMax(100);menu.addView(videoProgress,new LinearLayout.LayoutParams(dp(560),dp(7)));
        notice=text("Preparando archivos…",15,Color.rgb(188,188,195),false);
        notice.setPadding(0,dp(18),0,dp(8));menu.addView(notice);
        LinearLayout actions=new LinearLayout(this);actions.setGravity(Gravity.CENTER);
        open=new Button(this);
        open.setText("▶  Abrir presentación");
        open.setTextSize(19);
        open.setMinWidth(dp(280));
        open.setOnClickListener(v->openPlayer());
        actions.addView(open,new LinearLayout.LayoutParams(-2,dp(60)));
        retry=new Button(this);
        retry.setText("Buscar actualizaciones");
        retry.setTextSize(17);
        retry.setOnClickListener(v->refresh());
        LinearLayout.LayoutParams gap=new LinearLayout.LayoutParams(-2,dp(60));
        gap.leftMargin=dp(18);actions.addView(retry,gap);
        LinearLayout.LayoutParams actionLayout=new LinearLayout.LayoutParams(-2,-2);
        actionLayout.topMargin=dp(22);
        menu.addView(actions,actionLayout);
        TextView tips=text("Usá las flechas y OK del control o un teclado USB/Bluetooth. Atrás vuelve al menú.",15,
            Color.rgb(167,167,180),false);
        tips.setPadding(0,dp(25),0,0);menu.addView(tips);
        menu.setFocusable(false);
    }
    private void refresh(){
        retry.setEnabled(false);
        files.refresh(new TvAssetStore.Listener(){
            @Override public void status(String kind,long received,long total,String phase){
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
                if(total>0)progress.setProgress(pct); else progress.setProgress(0);
                open.setEnabled(files.has("presentation"));
            }
            @Override public void complete(boolean playable,String message){
                notice.setText(message);
                retry.setEnabled(true);
                open.setEnabled(playable);
                if(playable)open.requestFocus();
            }
        });
    }
    private void openPlayer(){
        if(!files.has("presentation"))return;
        inPlayer=true;
        menu.setVisibility(View.GONE);
        player.setVisibility(View.VISIBLE);
        player.loadUrl(LOCAL+"index.html");
        player.requestFocus();
    }
    private void returnMenu(){
        hideCustom();
        inPlayer=false;
        player.loadUrl("about:blank");
        player.setVisibility(View.GONE);
        menu.setVisibility(View.VISIBLE);
        open.requestFocus();
    }
    @Override public void onBackPressed(){
        if(inPlayer)returnMenu();
        else super.onBackPressed();
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event){
        if(inPlayer){
            int code=event.getKeyCode();
            if(code==KeyEvent.KEYCODE_BACK){
                if(event.getAction()==KeyEvent.ACTION_UP)returnMenu();
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
    @Override protected void onDestroy(){
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
                   path.equals("/tv/tv.js") ||
                   path.equals("/tv/presentation-media.js") ||
                   path.equals("/tv/presentation-timing.js")){
                    String filename=path.substring(4);
                    InputStream in=getAssets().open(filename);
                    String mime=filename.endsWith(".html")?"text/html":
                        filename.endsWith(".css")?"text/css":"application/javascript";
                    return response(200,"OK",mime,in,0,-1,-1);
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
