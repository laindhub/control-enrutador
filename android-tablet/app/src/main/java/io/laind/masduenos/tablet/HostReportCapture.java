package io.laind.masduenos.tablet;

import android.app.Activity;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Message;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.view.View;
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
        PrintAttributes attributes=new PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.NA_LETTER)
            .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
            .setMinMargins(new PrintAttributes.Margins(250,250,250,250)).build();
        PrintDocumentAdapter adapter=popup.createPrintDocumentAdapter("Test del Dueño");
        adapter.onStart();
        adapter.onLayout(null,attributes,new CancellationSignal(),new PrintDocumentAdapter.LayoutResultCallback(){
            @Override public void onLayoutFinished(PrintDocumentInfo info,boolean changed){
                try{
                    ParcelFileDescriptor destination=ParcelFileDescriptor.open(output,
                        ParcelFileDescriptor.MODE_CREATE|ParcelFileDescriptor.MODE_TRUNCATE|ParcelFileDescriptor.MODE_READ_WRITE);
                    adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES},destination,new CancellationSignal(),
                        new PrintDocumentAdapter.WriteResultCallback(){
                            @Override public void onWriteFinished(PageRange[] pages){
                                try{destination.close();adapter.onFinish();validate(output);}
                                catch(Exception e){fail("No se pudo validar la impresión generada.");}
                            }
                            @Override public void onWriteFailed(CharSequence error){
                                try{destination.close();}catch(Exception ignored){}
                                adapter.onFinish();fail("WebView no pudo generar el PDF del Full-test.");
                            }
                            @Override public void onWriteCancelled(){
                                try{destination.close();}catch(Exception ignored){}
                                adapter.onFinish();fail("La captura del Full-test se canceló.");
                            }
                        });
                }catch(Exception e){adapter.onFinish();fail("No se pudo crear el PDF temporal.");}
            }
            @Override public void onLayoutFailed(CharSequence message){adapter.onFinish();fail("El reporte no tiene un diseño imprimible.");}
            @Override public void onLayoutCancelled(){adapter.onFinish();fail("Se canceló la preparación del documento.");}
        },new Bundle());
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
