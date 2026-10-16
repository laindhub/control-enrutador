package io.laind.masduenos.tv;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Atomic, checksum-verified storage for exactly two fixed Hostinger assets.
 * A failed, partial, or interrupted update never replaces the old working copy.
 */
public final class TvAssetStore {
    public static final String BASE = "https://masduenos.laind.io";
    private static final String MANIFEST = BASE + "/tv/manifest.json";
    private final Context context;
    private final SharedPreferences saved;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private volatile boolean updating;

    public interface Listener {
        void status(String name, long received, long total, String phase);
        void complete(boolean playable, String message);
    }
    public TvAssetStore(Context context) {
        this.context=context.getApplicationContext();
        saved=this.context.getSharedPreferences("tv-files-v1",Context.MODE_PRIVATE);
    }
    public File file(String kind){
        if("presentation".equals(kind))return new File(context.getFilesDir(),"liniers.pptx");
        if("introduction".equals(kind))return new File(context.getFilesDir(),"introduccion.mp4");
        throw new IllegalArgumentException("Tipo no permitido");
    }
    public boolean has(String kind) {
        File target=file(kind);
        return target.isFile() && target.length()>12 &&
            target.length()==saved.getLong(kind+".size",-1) &&
            saved.getString(kind+".sha","").matches("[0-9a-f]{64}");
    }
    private void report(Listener l,String kind,long received,long total,String phase) {
        ui.post(()->l.status(kind,received,total,phase));
    }
    private void finish(Listener l,String message) {
        ui.post(()->l.complete(has("presentation"),message));
    }
    public synchronized void refresh(Listener listener){
        if(updating)return;
        updating=true;
        new Thread(()->{
            String message="Actualizado";
            try {
                report(listener,"presentation",0,0,"comprobando");
                report(listener,"introduction",0,0,"comprobando");
                // The special large APK ships both SHA-256-pinned media assets.
                // Restore them before any network access, so a new TV can start
                // presenting immediately, including entirely offline.
                if(restoreBundledAssets(listener)&&has("presentation")&&has("introduction")){
                    finish(listener,"Presentación e introducción incluidas: listas sin conexión.");
                }
                // Keep the existing Hostinger update protocol intact: after
                // the initial local-ready callback, check for newer assets.
                JSONObject manifest=readJson(MANIFEST);
                if(manifest.getInt("version")!=1)throw new IOException("Versión de manifiesto desconocida");
                String[] kinds={"presentation","introduction"};
                for(String kind:kinds){
                    JSONObject info=manifest.optJSONObject(kind);
                    if(info==null){
                        report(listener,kind,0,0,has(kind)?"guardado":"no-disponible");
                        continue;
                    }
                    String digest=info.getString("sha256").toLowerCase(Locale.ROOT);
                    long size=info.getLong("size");
                    String url=info.getString("url");
                    if(!digest.matches("[0-9a-f]{64}"))throw new IOException("Huella inválida: "+kind);
                    if(size<12||size>maxBytes(kind))throw new IOException("Tamaño inválido: "+kind);
                    if(!url.equals("presentation".equals(kind)?
                      "/tv/media/presentation.pptx":"/tv/media/introduccion.mp4"))
                        throw new IOException("Ruta de archivo inesperada");
                    if(has(kind) && digest.equals(saved.getString(kind+".sha","")) &&
                       size==file(kind).length()){
                        report(listener,kind,size,size,"guardado");
                        continue;
                    }
                    try { download(kind,BASE+url,digest,size,listener); }
                    catch(Exception e){
                        if(!has(kind))throw e;
                        report(listener,kind,0,0,"anterior");
                        message="No se pudo actualizar "+kind+"; se conserva la versión anterior.";
                    }
                }
            }catch(Exception e){
                message=has("presentation")?
                    "Sin conexión o error de descarga; se conservaron los archivos guardados.":
                    "No se pudo preparar la presentación: "+e.getMessage();
            }finally{
                updating=false;
                finish(listener,message);
            }
        },"tv-assets-updater").start();
    }

    /**
     * Preloaded large APKs contain assets/bundle/manifest.json and the two
     * ORIGINAL byte-for-byte Hostinger resources. Normal slim APKs have no
     * bundle manifest and continue to work exactly as before.
     *
     * The APK itself is trusted via Android's pinned release signature; every
     * extracted resource is also streamed through SHA-256 and length checks
     * before being atomically published to app-private storage.
     */
    private boolean restoreBundledAssets(Listener listener)throws Exception {
        JSONObject manifest;
        try(InputStream source=context.getAssets().open("bundle/manifest.json")){
            ByteArrayOutputStream buf=new ByteArrayOutputStream();
            byte[] chunk=new byte[4096];
            int n;
            while((n=source.read(chunk))!=-1){
                if(buf.size()+n>16*1024)throw new IOException("Manifiesto incorporado demasiado grande");
                buf.write(chunk,0,n);
            }
            manifest=new JSONObject(buf.toString("UTF-8"));
        }catch(java.io.FileNotFoundException absent){
            return false; // Standard lean release has no bundled media.
        }
        if(manifest.optInt("version")!=1)
            throw new IOException("Versión de paquete multimedia desconocida");
        for(String kind:new String[]{"presentation","introduction"}){
            JSONObject item=manifest.getJSONObject(kind);
            String expectedSha=item.getString("sha256").toLowerCase(Locale.ROOT);
            long expectedSize=item.getLong("size");
            String asset="bundle/"+("presentation".equals(kind)?"presentation.pptx":"introduccion.mp4");
            if(!expectedSha.matches("[0-9a-f]{64}")||
               expectedSize<12||expectedSize>maxBytes(kind))
                throw new IOException("Metadatos multimedia inválidos: "+kind);
            // A newer cached version is valid too; never downgrade it merely
            // because this APK was packaged with an older copy.
            if(has(kind)){
                long current=file(kind).length();
                report(listener,kind,current,current,"guardado");
                continue;
            }
            File original=file(kind);
            File tmp=new File(context.getFilesDir(),"bundle-"+kind+".part");
            if(tmp.exists()&&!tmp.delete())throw new IOException("No se pudo limpiar paquete parcial");
            MessageDigest hash=MessageDigest.getInstance("SHA-256");
            long written=0;
            try(InputStream input=new BufferedInputStream(context.getAssets().open(asset));
                FileOutputStream stream=new FileOutputStream(tmp);
                BufferedOutputStream output=new BufferedOutputStream(stream)){
                byte[] bytes=new byte[128*1024];
                int n;
                while((n=input.read(bytes))!=-1){
                    written+=n;
                    if(written>expectedSize||written>maxBytes(kind))
                        throw new IOException("Datos incorporados exceden el tamaño declarado");
                    output.write(bytes,0,n);
                    hash.update(bytes,0,n);
                    report(listener,kind,written,expectedSize,"guardando");
                }
            }catch(Exception e){
                tmp.delete();
                throw e;
            }
            StringBuilder digest=new StringBuilder(64);
            for(byte b:hash.digest())digest.append(String.format(Locale.ROOT,"%02x",b&0xff));
            if(written!=expectedSize||!expectedSha.equals(digest.toString())){
                tmp.delete();
                throw new IOException("SHA-256 del paquete incorporado incorrecto: "+kind);
            }
            try(RandomAccessFile probe=new RandomAccessFile(tmp,"r")){
                byte[] sig=new byte[4];
                if("presentation".equals(kind)){
                    probe.readFully(sig);
                    if(sig[0]!=0x50||sig[1]!=0x4b||sig[2]!=3||sig[3]!=4)
                        throw new IOException("PPTX incorporado inválido");
                }else{
                    probe.seek(4);probe.readFully(sig);
                    if(!"ftyp".equals(new String(sig,"US-ASCII")))
                        throw new IOException("MP4 incorporado inválido");
                }
            }
            try{Files.move(tmp.toPath(),original.toPath(),
                StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
            catch(java.nio.file.AtomicMoveNotSupportedException e){
                Files.move(tmp.toPath(),original.toPath(),StandardCopyOption.REPLACE_EXISTING);
            }
            saved.edit().putLong(kind+".size",expectedSize)
                .putString(kind+".sha",expectedSha).commit();
            report(listener,kind,written,written,"guardado");
        }
        return true;
    }
    private static long maxBytes(String kind){
        return "presentation".equals(kind)?250L*1024*1024:1024L*1024*1024;
    }
    private static HttpURLConnection connect(String fullUrl,String method)throws IOException {
        URL url=new URL(fullUrl);
        if(!"https".equals(url.getProtocol()) ||
            !"masduenos.laind.io".equals(url.getHost()))
            throw new IOException("Host no permitido");
        HttpURLConnection conn=(HttpURLConnection)url.openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(60000);
        conn.setRequestMethod(method);
        conn.setRequestProperty("Accept-Encoding","identity");
        int code=conn.getResponseCode();
        if(code!=200 && code!=206){
            conn.disconnect();
            throw new IOException("Hostinger devolvió HTTP "+code);
        }
        return conn;
    }
    private static JSONObject readJson(String url)throws Exception{
        HttpURLConnection connection=connect(url,"GET");
        try(InputStream in=connection.getInputStream()){
            ByteArrayOutputStream out=new ByteArrayOutputStream();
            byte[] buffer=new byte[4096]; int n;
            while((n=in.read(buffer))!=-1){
                out.write(buffer,0,n);
                if(out.size()>64*1024)throw new IOException("Manifiesto demasiado grande");
            }
            return new JSONObject(out.toString("UTF-8"));
        }finally{connection.disconnect();}
    }
    private void download(String kind,String url,String expectedSha,long expectedSize,Listener l)
      throws Exception{
        File original=file(kind);
        File tmp=new File(context.getFilesDir(),kind+"-"+expectedSha+".part");
        // Incomplete files are intentionally discarded. The stable file remains
        // available until the replacement passes the full SHA-256 check.
        if(tmp.exists()&&!tmp.delete())throw new IOException("No se pudo limpiar una descarga anterior");
        HttpURLConnection conn=connect(url,"GET");
        try {
            String contentType=conn.getContentType();
            String wanted="presentation".equals(kind)?
              "application/vnd.openxmlformats-officedocument.presentationml.presentation":"video/mp4";
            if(contentType==null||!wanted.equals(contentType.split(";")[0].trim().toLowerCase(Locale.ROOT)))
                throw new IOException("Hostinger no devolvió el tipo correcto de "+kind);
            long declared=conn.getContentLengthLong();
            if(declared>=0 && declared!=expectedSize)throw new IOException("Archivo cambiado durante la descarga");
            MessageDigest sha=MessageDigest.getInstance("SHA-256");
            byte[] bytes=new byte[128*1024];
            long total=0;
            try(InputStream in=new BufferedInputStream(conn.getInputStream());
                OutputStream out=new BufferedOutputStream(new FileOutputStream(tmp))){
                int n;
                while((n=in.read(bytes))!=-1){
                    total+=n;
                    if(total>expectedSize||total>maxBytes(kind))throw new IOException("Descarga excedida");
                    out.write(bytes,0,n);
                    sha.update(bytes,0,n);
                    report(l,kind,total,expectedSize,"descargando");
                }
            }
            if(total!=expectedSize)throw new IOException("Descarga incompleta");
            StringBuilder digest=new StringBuilder();
            for(byte value:sha.digest())digest.append(String.format(Locale.ROOT,"%02x",value&0xff));
            if(!digest.toString().equals(expectedSha))throw new IOException("SHA-256 diferente al manifiesto");
            // Verify the actual file type independently of Content-Type.
            try(RandomAccessFile probe=new RandomAccessFile(tmp,"r")){
                byte[] sig=new byte[4];
                if("presentation".equals(kind)){
                    probe.readFully(sig);
                    if(sig[0]!=0x50||sig[1]!=0x4b||sig[2]!=3||sig[3]!=4)
                        throw new IOException("El PPTX no es un archivo ZIP válido");
                }else{
                    probe.seek(4);probe.readFully(sig);
                    if(!"ftyp".equals(new String(sig,"US-ASCII")))
                        throw new IOException("La introducción no es MP4");
                }
            }
            report(l,kind,total,total,"guardando");
            try{Files.move(tmp.toPath(),original.toPath(),
                StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
            catch(Exception atomicUnsupported){
                Files.move(tmp.toPath(),original.toPath(),StandardCopyOption.REPLACE_EXISTING);
            }
            saved.edit().putLong(kind+".size",expectedSize).putString(kind+".sha",expectedSha).commit();
            report(l,kind,total,total,"guardado");
        }finally{
            conn.disconnect();
            if(tmp.exists())tmp.delete();
        }
    }
}
