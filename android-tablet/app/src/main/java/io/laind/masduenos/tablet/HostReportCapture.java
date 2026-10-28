package io.laind.masduenos.tablet;

import android.app.Activity;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Picture;
import android.graphics.pdf.PdfDocument;
import android.graphics.pdf.PdfRenderer;
import android.os.Message;
import android.os.ParcelFileDescriptor;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.function.Consumer;

/**
 * Capture the ENTIRE original Full-test at real LETTER/print CSS width.
 * The old implementation bisected a phone-width screenshot in half and
 * scaled both pieces into pages. It could silently omit or shrink content.
 *
 * Here the report is laid out at a fixed 816 CSS-px (8.5in x 96dpi), then
 * divided at a real section heading. Page 1/2 use one constant scale,
 * preserving all sections and matching the CRM's two original print pages.
 */
final class HostReportCapture {
    private static final int CSS_WIDTH=816, CSS_HEIGHT=1056;
    private final Activity activity;
    private final FrameLayout container;
    private WebView popup;
    private int checks;
    private boolean armed,writing;
    private Consumer<File> success;
    private Consumer<String> failure;
    HostReportCapture(Activity activity,FrameLayout container){
        this.activity=activity;this.container=container;
    }
    void arm(Consumer<File> success,Consumer<String> failure){
        this.success=success;this.failure=failure;armed=true;writing=false;checks=0;
        destroyPopup();
    }
    WebChromeClient chrome(){
        return new WebChromeClient(){
            @Override public boolean onCreateWindow(WebView parent,boolean dialog,boolean gesture,Message message){
                if(!armed||popup!=null)return false;
                popup=new WebView(activity);
                WebSettings options=popup.getSettings();
                options.setJavaScriptEnabled(true);
                options.setDomStorageEnabled(true);
                options.setAllowFileAccess(false);
                options.setAllowContentAccess(false);
                options.setUseWideViewPort(true);
                options.setLoadWithOverviewMode(false);
                options.setTextZoom(100);
                options.setSupportMultipleWindows(false);
                // A report created by document.write has no viewport. A 390px
                // phone viewport wraps all report rows into narrow strips.
                final float density=activity.getResources().getDisplayMetrics().density;
                int width=Math.round(CSS_WIDTH*density),height=Math.round(CSS_HEIGHT*density);
                popup.setInitialScale(100);
                container.addView(popup,0,new FrameLayout.LayoutParams(width,height));
                popup.setWebChromeClient(new WebChromeClient(){
                    @Override public void onCloseWindow(WebView w){ /* Keep until PDF is committed. */ }
                });
                WebView.WebViewTransport transfer=(WebView.WebViewTransport)message.obj;
                transfer.setWebView(popup);message.sendToTarget();
                popup.postDelayed(this::pollReport,350);
                return true;
            }
        };
    }
    private void pollReport(){
        if(popup==null||!armed||writing)return;
        if(++checks>70){fail("No apareció el Full-test original.");return;}
        popup.evaluateJavascript(
            "(()=>{try{return !!document.querySelector('.report-container')&&"+
            "/^Test del Dueño/i.test(document.title)}catch(e){return false}})()",
            value->{
                if(popup==null||!armed||writing)return;
                if("true".equals(value))prepareLayout();
                else popup.postDelayed(this::pollReport,300);
            });
    }
    private void prepareLayout(){
        if(popup==null||!armed||writing)return;
        // Use the CRM's print fonts/box widths at 8.5in CSS width. No page
        // screenshot or guessed midpoint pagination is accepted.
        String style="(()=>{"+
            "let meta=document.querySelector('meta[name=viewport]');"+
            "if(!meta){meta=document.createElement('meta');meta.name='viewport';document.head.appendChild(meta);}"+
            "meta.content='width=816, initial-scale=1';"+
            "let css=document.getElementById('md-print-normalize');"+
            "if(!css){css=document.createElement('style');css.id='md-print-normalize';document.head.appendChild(css);}"+
            "css.textContent='html{width:816px!important;min-width:0!important;overflow:visible!important;}"+
            "body{box-sizing:border-box!important;width:816px!important;min-width:0!important;"+
            "margin:0!important;padding:29px!important;font-size:8pt!important;line-height:1.3!important;}"+
            ".report-container{box-sizing:border-box!important;width:100%!important;min-width:0!important;}"+
            ".section-title{break-after:avoid!important;}';"+
            "return true;})()";
        popup.evaluateJavascript(style,result->{
            if(popup==null||!armed||writing)return;
            popup.postDelayed(this::measureAndRender,450);
        });
    }
    private void measureAndRender(){
        if(popup==null||!armed||writing)return;
        String script="(()=>{"+
            "let root=document.querySelector('.report-container');if(!root)return JSON.stringify({ok:false});"+
            "let top=window.scrollY;let end=Math.ceil(root.getBoundingClientRect().bottom+top+29);"+
            "let headings=[...root.querySelectorAll('.section-title')].map(x=>({"+
            "title:(x.textContent||'').trim(),y:Math.round(x.getBoundingClientRect().top+top)}));"+
            "return JSON.stringify({ok:true,height:end,width:document.documentElement.scrollWidth,headings});"+
            "})()";
        popup.evaluateJavascript(script,raw->{
            if(popup==null||!armed||writing)return;
            try{
                JSONObject info=new JSONObject(new org.json.JSONArray("["+raw+"]").getString(0));
                if(!info.optBoolean("ok"))throw new IllegalStateException("Reporte HTML incompleto.");
                int pageWidth=info.optInt("width",0);
                int totalHeight=info.optInt("height",0);
                if(pageWidth>CSS_WIDTH+16||pageWidth<700||totalHeight<420)
                    throw new IllegalStateException("La maqueta del reporte no corresponde a Carta.");
                ArrayList<Integer> candidates=new ArrayList<>();
                org.json.JSONArray titles=info.getJSONArray("headings");
                int desired=0;
                for(int i=0;i<titles.length();i++){
                    JSONObject title=titles.getJSONObject(i);
                    int y=title.optInt("y",0);
                    if(y>150&&y<totalHeight-140){
                        candidates.add(y);
                        if(title.optString("title").toLowerCase(java.util.Locale.ROOT).contains("capacidad de pago"))
                            desired=y;
                    }
                }
                // Keep a stable heading break when possible; otherwise choose
                // the heading that best balances the two untruncated pages.
                int cut=desired;
                if(cut==0){
                    double best=Double.MAX_VALUE;
                    for(int candidate:candidates){
                        double score=Math.max(candidate,totalHeight-candidate)+
                            Math.abs(candidate-totalHeight*.55)*.03;
                        if(score<best){cut=candidate;best=score;}
                    }
                }
                if(cut<=0)throw new IllegalStateException("No se encontró un corte seguro entre secciones.");
                writing=true;
                writeReport(totalHeight,cut);
            }catch(Exception error){fail("El Full-test no se puede paginar sin perder contenido: "+error.getMessage());}
        });
    }
    private void writeReport(int height,int cut){
        File output=new File(activity.getCacheDir(),"crm-fulltest-original.pdf");
        try{
            Picture picture=popup.capturePicture();
            if(picture==null||picture.getWidth()<700||picture.getHeight()<height-50)
                throw new IllegalStateException("El documento todavía no terminó de dibujarse.");
            final int width=picture.getWidth();
            final int maxSegment=Math.max(cut,height-cut);
            final float margin=18f, contentWidth=612f-2*margin, contentHeight=792f-2*margin;
            final float scale=Math.min(contentWidth/width,contentHeight/maxSegment);
            if(scale<.44f)throw new IllegalStateException("El informe es demasiado largo para dos páginas legibles.");
            PdfDocument pdf=new PdfDocument();
            try{
                for(int index=0;index<2;index++){
                    PdfDocument.PageInfo pageInfo=new PdfDocument.PageInfo.Builder(612,792,index+1).create();
                    PdfDocument.Page page=pdf.startPage(pageInfo);
                    Canvas canvas=page.getCanvas();canvas.drawColor(Color.WHITE);
                    // Pixel-perfect position: draw the SAME picture with two
                    // vertical clip windows. Never bisect the content midway.
                    canvas.save();
                    canvas.clipRect(margin,margin,612-margin,792-margin);
                    canvas.translate(margin,margin-(index==0?0:cut)*scale);
                    canvas.scale(scale,scale);
                    picture.draw(canvas);
                    canvas.restore();
                    pdf.finishPage(page);
                }
                try(FileOutputStream stream=new FileOutputStream(output)){pdf.writeTo(stream);}
            }finally{pdf.close();}
            validate(output);
        }catch(Exception e){output.delete();fail("No se pudo generar el Full-test sin recortes: "+e.getMessage());}
    }
    private void validate(File file){
        try(ParcelFileDescriptor descriptor=ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);
            PdfRenderer renderer=new PdfRenderer(descriptor)){
            if(renderer.getPageCount()!=2)throw new IllegalStateException("El informe no tiene dos páginas completas.");
            if(file.length()<2048||file.length()>15_000_000)throw new IllegalStateException("Tamaño de PDF inesperado.");
            armed=false;writing=false;
            if(success!=null)success.accept(file);
            destroyPopup();
        }catch(Exception e){file.delete();fail(e.getMessage());}
    }
    private void fail(String message){
        armed=false;writing=false;destroyPopup();
        if(failure!=null)failure.accept(message);
    }
    void dispose(){armed=false;writing=false;destroyPopup();}
    private void destroyPopup(){
        if(popup==null)return;
        container.removeView(popup);popup.destroy();popup=null;
    }
}
