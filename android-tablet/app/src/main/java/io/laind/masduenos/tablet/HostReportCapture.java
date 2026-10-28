package io.laind.masduenos.tablet;

import android.app.Activity;
import android.graphics.pdf.PdfRenderer;
import android.graphics.pdf.PdfDocument;
import android.graphics.Picture;
import android.graphics.Canvas;
import android.graphics.Color;
import java.io.FileOutputStream;
import android.os.Message;
import android.os.ParcelFileDescriptor;
import android.widget.FrameLayout;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.io.File;
import java.util.function.Consumer;

/** Captures the original CRM report popup locally, using Android's WebView PDF engine.
 * It never reads PINs or cookies and never sends a report to our server.
 */
final class HostReportCapture {
    private final Activity activity;
    private final FrameLayout container;
    private WebView popup;
    private int checks;
    private boolean armed,writing;
    private Consumer<File> success;
    private Consumer<String> failure;
    HostReportCapture(Activity activity,FrameLayout container) {
        this.activity=activity;this.container=container;
    }
    void arm(Consumer<File> success,Consumer<String> failure) {
        this.success=success;this.failure=failure;this.armed=true;
        this.writing=false;this.checks=0;
        destroyPopup();
    }
    WebChromeClient chrome() {
        return new WebChromeClient(){
            @Override public boolean onCreateWindow(WebView parent,boolean dialog,boolean userGesture,Message msg){
                if(!armed || popup!=null)return false;
                popup=new WebView(activity);
                WebSettings settings=popup.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setAllowFileAccess(false);
                settings.setAllowContentAccess(false);
                // Document is written into about:blank by the CRM itself.
                settings.setSupportMultipleWindows(false);
                popup.setAlpha(0.01f);
                container.addView(popup,0,new FrameLayout.LayoutParams(-1,-1));
                popup.setWebChromeClient(new WebChromeClient(){
                    @Override public void onCloseWindow(WebView view){
                        // Do not destroy the document until PDF write finishes.
                    }
                });
                WebView.WebViewTransport transport=(WebView.WebViewTransport)msg.obj;
                transport.setWebView(popup);
                msg.sendToTarget();
                popup.postDelayed(()->pollReport(),300);
                return true;
            }
        };
    }
    private void pollReport() {
        if(popup==null||!armed||writing)return;
        if(++checks>70){fail("No apareció el reporte del Full-test. Probá otra vez desde la ficha.");return;}
        popup.evaluateJavascript("(()=>{try{return !!document.querySelector('.report-container')&&/^Test del Dueño/i.test(document.title)}catch(_){return false}})()",value->{
            if(popup==null||!armed||writing)return;
            if("true".equals(value)) {
                popup.postDelayed(this::writeReport,350);
            }else popup.postDelayed(this::pollReport,300);
        });
    }
    private void writeReport() {
        if(popup==null||!armed||writing)return;
        writing=true;
        File output=new File(activity.getCacheDir(),"crm-fulltest-original.pdf");
        try{
            // Android's PrintDocumentAdapter callbacks have package-private
            // constructors: direct onLayout/onWrite is not available to apps.
            // Record the original HTML drawing into a private PDF instead.
            Picture picture=popup.capturePicture();
            if(picture==null||picture.getWidth()<100||picture.getHeight()<400)
                throw new IllegalStateException("El reporte no terminó de dibujarse.");
            PdfDocument document=new PdfDocument();
            try{
                final int sourceWidth=picture.getWidth(),sourceHeight=picture.getHeight();
                final float segmentHeight=sourceHeight/2f;
                for(int index=0;index<2;index++){
                    PdfDocument.PageInfo size=new PdfDocument.PageInfo.Builder(612,792,index+1).create();
                    PdfDocument.Page page=document.startPage(size);
                    Canvas canvas=page.getCanvas();
                    canvas.drawColor(Color.WHITE);
                    final float margin=19f;
                    final float scale=Math.min((612f-2*margin)/sourceWidth,(792f-2*margin)/segmentHeight);
                    canvas.save();
                    canvas.clipRect(margin,margin,612f-margin,792f-margin);
                    canvas.translate(margin,margin);
                    canvas.scale(scale,scale);
                    canvas.translate(0,-index*segmentHeight);
                    picture.draw(canvas);
                    canvas.restore();
                    document.finishPage(page);
                }
                try(FileOutputStream destination=new FileOutputStream(output)){document.writeTo(destination);}
            }finally{document.close();}
            validate(output);
        }catch(Exception e){output.delete();fail("No se pudo convertir el reporte HTML: "+e.getMessage());}
    }
    private void validate(File pdf) {
        try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(pdf,ParcelFileDescriptor.MODE_READ_ONLY);
            PdfRenderer renderer=new PdfRenderer(fd)){
            if(renderer.getPageCount()!=2)throw new IllegalStateException("El CRM generó "+renderer.getPageCount()+" páginas, no 2.");
            if(pdf.length()<2048||pdf.length()>15000000)throw new IllegalStateException("Tamaño del PDF inesperado.");
            armed=false;writing=false;
            if(success!=null)success.accept(pdf);
            destroyPopup();
        }catch(Exception error){pdf.delete();fail(error.getMessage());}
    }
    private void fail(String message) {
        armed=false;writing=false;destroyPopup();
        if(failure!=null)failure.accept(message);
    }
    void dispose(){armed=false;writing=false;destroyPopup();}
    private void destroyPopup(){
        if(popup==null)return;
        container.removeView(popup);popup.destroy();popup=null;
    }
}
