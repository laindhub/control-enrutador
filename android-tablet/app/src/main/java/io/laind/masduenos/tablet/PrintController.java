package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.Context;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.print.PageRange;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.function.Consumer;

/** IPP Print-Job with PDF payload; fallback remains Android's print service. */
public final class PrintController {
    public static boolean isPrivateIPv4(String text){
        if(text==null||!text.matches("(?:\\d{1,3}\\.){3}\\d{1,3}"))return false;
        String[] part=text.split("\\.");
        int[] n=new int[4];
        for(int i=0;i<4;i++){n[i]=Integer.parseInt(part[i]);if(n[i]>255)return false;}
        return n[0]==10||(n[0]==172&&n[1]>=16&&n[1]<=31)||(n[0]==192&&n[1]==168);
    }
    public static final class Result {
        public final boolean ok;
        public final String message;
        Result(boolean ok,String message){this.ok=ok;this.message=message;}
    }
    public static void direct(String printerIp,File pdf,Consumer<Result> callback){
        new Thread(()->{
            Result result;
            try{sendIpp(printerIp,pdf);result=new Result(true,
                "La Brother aceptó el trabajo. Verificá que haya salido físicamente la hoja.");}
            catch(Exception ex){result=new Result(false,
                "No se aceptó el trabajo en IPP. Usá «Imprimir con Android» como respaldo.");}
            callback.accept(result);
        },"local-ipp-printer").start();
    }
    private static void attr(ByteArrayOutputStream out,int tag,String name,String value)throws IOException{
        byte[] n=name.getBytes(StandardCharsets.US_ASCII),v=value.getBytes(StandardCharsets.UTF_8);
        out.write(tag);out.write(0);out.write(n.length);out.write(n);out.write((v.length>>8)&255);out.write(v.length&255);out.write(v);
    }
    static void sendIpp(String ip,File pdf)throws IOException{
        if(!isPrivateIPv4(ip))throw new IOException("La dirección de la impresora debe ser una IP privada.");
        if(!pdf.isFile()||pdf.length()==0||pdf.length()>25_000_000)throw new IOException("El documento PDF es inválido o demasiado grande.");
        ByteArrayOutputStream ipp=new ByteArrayOutputStream();
        // IPP/1.1 Print-Job: 0x0002; request-id 1.
        ipp.write(new byte[]{1,1,0,2,0,0,0,1,1});
        attr(ipp,0x47,"attributes-charset","utf-8");
        attr(ipp,0x48,"attributes-natural-language","es");
        attr(ipp,0x45,"printer-uri","ipp://"+ip+"/ipp/print");
        attr(ipp,0x42,"requesting-user-name","Mas Duenos Tablet");
        attr(ipp,0x49,"document-format","application/pdf");
        ipp.write(2); // job-attributes-tag
        attr(ipp,0x42,"job-name","Full-test archivo");
        attr(ipp,0x44,"media","iso_a4_210x297mm");
        attr(ipp,0x44,"sides","one-sided");
        attr(ipp,0x21,"copies","\u0000\u0000\u0000\u0001");
        ipp.write(3); // end-of-attributes
        URL url=new URL("http://"+ip+":631/ipp/print");
        HttpURLConnection conn=(HttpURLConnection)url.openConnection();
        conn.setConnectTimeout(3500);conn.setReadTimeout(11000);
        conn.setRequestMethod("POST");conn.setRequestProperty("Content-Type","application/ipp");
        conn.setDoOutput(true);
        conn.setFixedLengthStreamingMode(ipp.size()+pdf.length());
        try{
            try(java.io.OutputStream output=conn.getOutputStream();FileInputStream in=new FileInputStream(pdf)){
                ipp.writeTo(output);
                byte[] buffer=new byte[16384];int read;
                while((read=in.read(buffer))!=-1)output.write(buffer,0,read);
            }
            int http=conn.getResponseCode();
            if(http!=200)throw new IOException("HTTP "+http);
            byte[] header=new byte[8];
            try(java.io.InputStream input=conn.getInputStream()){
                int at=0,n;
                while(at<header.length&&(n=input.read(header,at,header.length-at))>0)at+=n;
                if(at!=8)throw new IOException("Respuesta IPP incompleta.");
            }
            int ippStatus=(header[2]&255)*256+(header[3]&255);
            if(ippStatus>=0x0100)throw new IOException("Respuesta IPP 0x"+Integer.toHexString(ippStatus));
        }finally{conn.disconnect();}
    }
    public static void androidPrint(Activity activity,File pdf){
        PrintManager manager=(PrintManager)activity.getSystemService(Context.PRINT_SERVICE);
        PrintAttributes attrs=new PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
            .setDuplexMode(PrintAttributes.DUPLEX_MODE_NONE).build();
        manager.print("Más Dueños - hoja de archivo",new PdfAdapter(pdf),attrs);
    }
    private static final class PdfAdapter extends PrintDocumentAdapter{
        private final File pdf;
        PdfAdapter(File pdf){this.pdf=pdf;}
        @Override public void onLayout(PrintAttributes oldAttributes,PrintAttributes newAttributes,
            CancellationSignal cancellation,LayoutResultCallback callback,android.os.Bundle extras){
            if(cancellation.isCanceled()){callback.onLayoutCancelled();return;}
            callback.onLayoutFinished(new PrintDocumentInfo.Builder("Full-test-archivo.pdf")
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(1).build(),true);
        }
        @Override public void onWrite(PageRange[] pages,ParcelFileDescriptor destination,
            CancellationSignal cancellation,WriteResultCallback callback){
            new Thread(()->{
                try(FileInputStream input=new FileInputStream(pdf);
                    FileOutputStream output=new FileOutputStream(destination.getFileDescriptor())){
                    byte[] chunk=new byte[16384];int count;
                    while((count=input.read(chunk))!=-1){
                        if(cancellation.isCanceled()){callback.onWriteCancelled();return;}
                        output.write(chunk,0,count);
                    }
                    callback.onWriteFinished(new PageRange[]{PageRange.ALL_PAGES});
                }catch(Exception e){callback.onWriteFailed("No se pudo preparar el PDF.");}
            },"android-print-spool").start();
        }
    }
    private PrintController(){}
}
