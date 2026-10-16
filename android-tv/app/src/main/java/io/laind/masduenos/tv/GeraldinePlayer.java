package io.laind.masduenos.tv;

import android.graphics.Matrix;
import android.graphics.SurfaceTexture;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.util.Log;
import android.util.Xml;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.widget.FrameLayout;

import org.xmlpull.v1.XmlPullParser;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Plays the embedded slide-21 MP4 using Android's native decoder, OVER the
 * existing PPTX slide. Never changes the deck or sends a 35 MB PPTX to a
 * second renderer. Files are read exclusively from app-private storage.
 */
final class GeraldinePlayer {
    interface Listener { void finished(String error); }

    private static final String TAG="MasDuenosTV";
    private static final long MAX_VIDEO_BYTES=200L*1024*1024;
    private final TvActivity activity;
    private final FrameLayout frame;
    private final Listener listener;
    private FrameLayout layer;
    private TextureView texture;
    private Surface surface;
    private MediaPlayer media;
    private boolean active;
    private int generation;
    private int videoWidth,videoHeight;
    private double x,y,w,h;

    GeraldinePlayer(TvActivity activity,FrameLayout frame,Listener listener){
        this.activity=activity;
        this.frame=frame;
        this.listener=listener;
    }

    boolean isActive(){return active;}

    void play(File pptx,String sha,double x,double y,double w,double h){
        if(active)return;
        if(!pptx.isFile()||pptx.length()<12){
            listener.finished("El PowerPoint no está guardado.");
            return;
        }
        if(!Double.isFinite(x)||!Double.isFinite(y)||
           !Double.isFinite(w)||!Double.isFinite(h)||
           x<0||y<0||w<=0||h<=0||x+w>1.01||y+h>1.01){
            listener.finished("Área del video fuera de la diapositiva.");
            return;
        }
        active=true;
        final int sequence=++generation;
        this.x=x;this.y=y;this.w=w;this.h=h;
        final File deck=pptx;
        final String fingerprint=sha!=null&&sha.matches("[0-9a-f]{64}")
            ?sha.substring(0,24):Long.toHexString(deck.length())+"-"+Long.toHexString(deck.lastModified());
        new Thread(()->{
            try{
                File clip=extractVideo(deck,fingerprint);
                activity.runOnUiThread(()->{
                    if(active&&sequence==generation)attach(clip);
                });
            }catch(Exception error){
                Log.e(TAG,"Video de Geraldine no disponible dentro del PPTX",error);
                activity.runOnUiThread(()->{
                    if(active&&sequence==generation)stop(true,"No se pudo extraer el video de Geraldine.");
                });
            }
        },"tv-geraldine-extractor").start();
    }

    /**
     * Slide 21 owns the video relationship; never guess the first arbitrary
     * MP4 in the ZIP. The relationship path is constrained to ppt/media/.
     * The output is cached by the verified PPTX SHA-256.
     */
    private File extractVideo(File pptx,String fingerprint)throws Exception{
        File out=new File(activity.getCacheDir(),"geraldine-"+fingerprint+".mp4");
        if(out.isFile()&&out.length()>12)return out;
        File tmp=new File(activity.getCacheDir(),"geraldine-"+fingerprint+".part");
        if(tmp.exists()&&!tmp.delete())throw new java.io.IOException("No se pudo limpiar el archivo parcial");
        try(ZipFile zip=new ZipFile(pptx)){
            ZipEntry rels=zip.getEntry("ppt/slides/_rels/slide21.xml.rels");
            if(rels==null)throw new java.io.IOException("La diapositiva 21 no tiene relaciones");
            String target=null;
            try(InputStream input=zip.getInputStream(rels)){
                XmlPullParser parser=Xml.newPullParser();
                parser.setInput(input,"UTF-8");
                int event;
                while((event=parser.next())!=XmlPullParser.END_DOCUMENT){
                    if(event!=XmlPullParser.START_TAG||!"Relationship".equals(parser.getName()))continue;
                    String type=parser.getAttributeValue(null,"Type");
                    String mode=parser.getAttributeValue(null,"TargetMode");
                    if(type!=null&&type.endsWith("/video")&&!"External".equalsIgnoreCase(mode)){
                        target=parser.getAttributeValue(null,"Target");
                        break;
                    }
                }
            }
            if(target==null)throw new java.io.IOException("La diapositiva 21 no incluye un video local");
            String name=Paths.get("ppt/slides").resolve(target).normalize()
                .toString().replace('\\','/');
            if(!name.startsWith("ppt/media/")||!name.toLowerCase(Locale.ROOT).endsWith(".mp4"))
                throw new java.io.IOException("Ruta de video no permitida");
            ZipEntry entry=zip.getEntry(name);
            if(entry==null||entry.getSize()>MAX_VIDEO_BYTES)
                throw new java.io.IOException("Video no disponible o demasiado grande");
            long length=0;
            try(InputStream in=new BufferedInputStream(zip.getInputStream(entry));
                FileOutputStream sink=new FileOutputStream(tmp);
                BufferedOutputStream output=new BufferedOutputStream(sink)){
                byte[] bytes=new byte[64*1024];
                int n;
                while((n=in.read(bytes))!=-1){
                    length+=n;
                    if(length>MAX_VIDEO_BYTES)throw new java.io.IOException("Video demasiado grande");
                    output.write(bytes,0,n);
                }
            }
            if(length<12)throw new java.io.IOException("Video vacío");
            try(java.io.RandomAccessFile video=new java.io.RandomAccessFile(tmp,"r")){
                video.seek(4);
                byte[] sig=new byte[4];
                video.readFully(sig);
                if(!"ftyp".equals(new String(sig,"US-ASCII")))
                    throw new java.io.IOException("Video no es MP4");
            }
            try{Files.move(tmp.toPath(),out.toPath(),
                StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
            catch(Exception notAtomic){Files.move(tmp.toPath(),out.toPath(),StandardCopyOption.REPLACE_EXISTING);}
            Log.i(TAG,"Video Geraldine extraído desde "+name+", "+length+" bytes");
            return out;
        }finally{
            if(tmp.exists())tmp.delete();
        }
    }

    private void attach(File clip){
        if(!active)return;
        layer=new FrameLayout(activity);
        layer.setBackgroundColor(Color.BLACK);
        layer.setFocusable(false);
        texture=new TextureView(activity);
        texture.setFocusable(false);
        layer.addView(texture,new FrameLayout.LayoutParams(-1,-1));
        reposition();
        frame.addView(layer);
        layer.bringToFront();
        // Keep keyboard focus on the slideshow, not on the video surface.
        texture.setSurfaceTextureListener(new TextureView.SurfaceTextureListener(){
            @Override public void onSurfaceTextureAvailable(SurfaceTexture s,int width,int height){
                if(active)prepare(clip,s);
            }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture s,int width,int height){fit();}
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture s){
                if(active)stop(true,"Se perdió la superficie de video.");
                return true;
            }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture s){}
        });
    }

    void reposition(){
        if(layer==null)return;
        int totalW=frame.getWidth(),totalH=frame.getHeight();
        if(totalW<=0||totalH<=0)return;
        int left=(int)Math.round(x*totalW),top=(int)Math.round(y*totalH);
        int width=Math.min(totalW-left,Math.max(1,(int)Math.round(w*totalW)));
        int height=Math.min(totalH-top,Math.max(1,(int)Math.round(h*totalH)));
        FrameLayout.LayoutParams layout=new FrameLayout.LayoutParams(width,height,Gravity.TOP|Gravity.LEFT);
        layout.leftMargin=left;layout.topMargin=top;
        layer.setLayoutParams(layout);
        fit();
    }

    private void fit(){
        if(texture==null||videoWidth<=0||videoHeight<=0)return;
        float width=texture.getWidth(),height=texture.getHeight();
        if(width<=0||height<=0)return;
        float videoRatio=(float)videoWidth/videoHeight,boxRatio=width/height;
        float scaleX=1f,scaleY=1f;
        if(videoRatio>boxRatio)scaleY=boxRatio/videoRatio;
        else scaleX=videoRatio/boxRatio;
        Matrix m=new Matrix();
        m.setScale(scaleX,scaleY,width/2f,height/2f);
        texture.setTransform(m);
    }

    private void prepare(File clip,SurfaceTexture surfaceTexture){
        try{
            surface=new Surface(surfaceTexture);
            MediaPlayer engine=new MediaPlayer();
            media=engine;
            engine.setSurface(surface);
            engine.setAudioStreamType(android.media.AudioManager.STREAM_MUSIC);
            engine.setOnPreparedListener(player->{
                if(!active||player!=media)return;
                videoWidth=player.getVideoWidth();videoHeight=player.getVideoHeight();
                fit();player.start();
            });
            engine.setOnVideoSizeChangedListener((player,width,height)->{
                if(active&&player==media){videoWidth=width;videoHeight=height;fit();}
            });
            engine.setOnInfoListener((player,what,extra)->{
                if(what==MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START)
                    Log.i(TAG,"Primer cuadro de Geraldine renderizado");
                return false;
            });
            engine.setOnCompletionListener(player->{
                if(player==media)stop(true,"");
            });
            engine.setOnErrorListener((player,what,extra)->{
                Log.e(TAG,"Error de decoder Geraldine: "+what+", "+extra);
                if(player==media)stop(true,"No se pudo reproducir Geraldine ("+what+", "+extra+").");
                return true;
            });
            engine.setDataSource(clip.getAbsolutePath());
            engine.prepareAsync();
        }catch(Exception ex){
            Log.e(TAG,"Error preparando Geraldine",ex);
            stop(true,"El reproductor nativo no pudo iniciar Geraldine.");
        }
    }

    void stop(boolean notifyWeb,String error){
        if(!active&&layer==null)return;
        active=false;generation++;
        MediaPlayer engine=media;media=null;
        if(engine!=null){
            engine.setOnPreparedListener(null);
            engine.setOnCompletionListener(null);
            engine.setOnErrorListener(null);
            engine.setOnVideoSizeChangedListener(null);
            engine.setOnInfoListener(null);
            try{engine.release();}catch(Exception ignored){}
        }
        if(surface!=null){surface.release();surface=null;}
        if(texture!=null){texture.setSurfaceTextureListener(null);texture=null;}
        if(layer!=null){frame.removeView(layer);layer=null;}
        videoWidth=videoHeight=0;
        if(notifyWeb)listener.finished(error==null?"":error);
    }
}
