package io.laind.masduenos.tablet;

import android.app.Activity;
import android.graphics.pdf.PdfRenderer;
import android.os.Message;
import android.os.ParcelFileDescriptor;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.function.Consumer;

/**
 * The original CRM builds its printable report via document.write() into a
 * new window. Read only the actual report's section-title / summary-box /
 * info-item DOM and construct native vector PDF Letter pages.
 *
 * The previous image snapshots were not a print renderer: on smaller
 * devices it rendered the report as narrow bands with immense blank areas.
 * There are now NO screenshots or arbitrary cuts in this path.
 */
final class HostReportCapture {
    private final Activity activity;
    private final FrameLayout container;
    private WebView popup;
    private int attempts;
    private boolean armed,writing;
    private Consumer<File> success;
    private Consumer<String> failure;

    HostReportCapture(Activity activity,FrameLayout container){
        this.activity=activity;this.container=container;
    }
    void arm(Consumer<File> success,Consumer<String> failure){
        this.success=success;this.failure=failure;
        armed=true;writing=false;attempts=0;
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
                options.setSupportMultipleWindows(false);
                // Allow the CRM to write its HTML into the report window.
                // Native PDF is generated directly from the finished DOM,
                // independent of CSS viewport and the device's pixel density.
                container.addView(popup,0,new FrameLayout.LayoutParams(2,2));
                popup.setWebChromeClient(new WebChromeClient(){
                    @Override public void onCloseWindow(WebView view){
                        // Preserve popup until the native PDF has been written.
                    }
                });
                WebView.WebViewTransport transport=(WebView.WebViewTransport)message.obj;
                transport.setWebView(popup);message.sendToTarget();
                popup.postDelayed(()->pollReport(),350);
                return true;
            }
        };
    }
    private void pollReport(){
        if(popup==null||!armed||writing)return;
        if(++attempts>70){fail("El CRM no abrió el reporte original.");return;}
        popup.evaluateJavascript(
            "(()=>{try{return /^Test del Dueño/i.test(document.title) && " +
            "!!document.querySelector('.report-container .section-title')}" +
            "catch(e){return false}})()",
            answer->{
                if(popup==null||!armed||writing)return;
                if("true".equals(answer)){
                    popup.postDelayed(this::extractReport,250);
                }else popup.postDelayed(this::pollReport,300);
            });
    }
    private void extractReport(){
        if(popup==null||!armed||writing)return;
        writing=true;
        // No auth state, cookies, PIN or other forms are captured. The output
        // is restricted to the standalone Full-test's printable DOM.
        String js="(()=>{"+
            "const root=document.querySelector('.report-container');"+
            "if(!root||!/^Test del Dueño/i.test(document.title))return JSON.stringify({ok:false});"+
            "const clean=t=>(t||'').replace(/\\s+/g,' ').trim();"+
            "const sections=[...root.querySelectorAll('.section-title')].map(h=>{"+
            "let next=h.nextElementSibling;const rows=[];let message='';"+
            "while(next&&!next.classList.contains('section-title')){"+
            "if(next.classList.contains('summary-box')){"+
            "for(const row of next.querySelectorAll('.info-item')){"+
            "const label=clean(row.querySelector('strong')?.textContent||'');"+
            "const value=clean(row.querySelector('span')?.textContent||'');"+
            "if(label||value)rows.push({label,value});"+
            "}"+
            "}else if(next.classList.contains('conclusion-message'))message=clean(next.textContent);"+
            "else {const value=clean(next.textContent);if(value)rows.push({label:'',value});}"+
            "next=next.nextElementSibling;"+
            "}"+
            "return {heading:clean(h.textContent),rows,message};"+
            "});"+
            "return JSON.stringify({ok:sections.length>=7,"+
            "title:clean(root.querySelector('h1')?.textContent||document.title),"+
            "host:clean(root.querySelector('.host-info')?.textContent||'').replace(/^Host:\\s*/i,''),"+
            "generated:clean(root.querySelector('.generation-date')?.textContent||''),"+
            "sections});"+
            "})()";
        popup.evaluateJavascript(js,value->{
            if(popup==null||!armed)return;
            try{
                String encoded=new JSONArray("["+value+"]").getString(0);
                JSONObject report=new JSONObject(encoded);
                if(!report.optBoolean("ok"))throw new IllegalStateException("Faltan secciones del test.");
                JSONArray sections=report.getJSONArray("sections");
                int rows=0;
                for(int i=0;i<sections.length();i++){
                    JSONObject section=sections.getJSONObject(i);
                    rows+=section.optJSONArray("rows")==null?0:section.getJSONArray("rows").length();
                }
                if(rows<12)throw new IllegalStateException("El reporte tiene campos insuficientes.");
                File output=new File(activity.getCacheDir(),"crm-fulltest-original.pdf");
                NativeFullTestPdf.write(report,output);
                validate(output);
            }catch(Exception error){fail("No se pudo reconstruir el Full-test completo: "+error.getMessage());}
        });
    }
    private void validate(File file){
        try(ParcelFileDescriptor descriptor=ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);
            PdfRenderer pages=new PdfRenderer(descriptor)){
            if(pages.getPageCount()!=2)throw new IllegalStateException("Falta una página del Full-test.");
            if(file.length()<2000||file.length()>15000000)
                throw new IllegalStateException("El tamaño del PDF es inesperado.");
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
