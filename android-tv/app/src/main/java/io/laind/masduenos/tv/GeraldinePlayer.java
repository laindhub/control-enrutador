package io.laind.masduenos.tv;

import android.graphics.Matrix;
import android.view.animation.DecelerateInterpolator;
import android.graphics.SurfaceTexture;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.widget.ImageView;
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
    private FrameLayout previewLayer;
    private ImageView previewImage;
    private TextureView texture;
    private Bitmap poster;
    private String posterKey="";
    private boolean warming=false;
    private boolean previewRequested=false;
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

    private String key(File pptx,String sha){
        return sha!=null&&sha.matches("[0-9a-f]{64}")
            ?sha.substring(0,24)
            :Long.toHexString(pptx.length())+"-"+Long.toHexString(pptx.lastModified());
    }

    // Start well before slide 21, not when PageDown is pressed. The real
    // first video frame is used as a still preview instead of the deck's
    // black fallback rectangle. No generated imagery or PPTX modifications.
    void warm(File pptx,String sha){
        if(!pptx.isFile())return;
        final String fingerprint=key(pptx,sha);
        if(warming || (fingerprint.equals(posterKey)&&poster!=null))return;
        warming=true;
        new Thread(()->{
            Bitmap frameBitmap=null;
            try{
                File clip=extractVideo(pptx,fingerprint);
                MediaMetadataRetriever retriever=new MediaMetadataRetriever();
                try{
                    retriever.setDataSource(clip.getAbsolutePath());
                    frameBitmap=retriever.getFrameAtTime(0,MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
                }finally{retriever.release();}
                if(frameBitmap==null)throw new java.io.IOException("No se pudo leer el primer fotograma");
            }catch(Exception e){
                Log.w(TAG,"No se pudo precargar imagen de Geraldine",e);
            }
            final Bitmap ready=frameBitmap;
            activity.runOnUiThread(()->{
                warming=false;
                if(ready!=null){
                    if(poster!=null&&poster!=ready&&!poster.isRecycled())poster.recycle();
                    poster=ready;posterKey=fingerprint;
                    if(previewRequested)showPreview();
                }
            });
        },"tv-geraldine-prewarm").start();
    }

    void preview(File pptx,String sha,double x,double y,double w,double h){
        if(!validBounds(x,y,w,h))return;
        this.x=x;this.y=y;this.w=w;this.h=h;
        previewRequested=true;
        if(poster!=null&&key(pptx,sha).equals(posterKey))showPreview();
        else warm(pptx,sha);
    }

    private boolean validBounds(double x,double y,double w,double h){
        return Double.isFinite(x)&&Double.isFinite(y)&&
          Double.isFinite(w)&&Double.isFinite(h)&&
          x>=0&&y>=0&&w>0&&h>0&&x+w<=1.01&&y+h<=1.01;
    }

    private void showPreview(){
        if(!previewRequested||poster==null||poster.isRecycled())return;
        if(previewLayer==null){
            previewLayer=new FrameLayout(activity);
            previewLayer.setBackgroundColor(Color.TRANSPARENT);
            previewLayer.setFocusable(false);
            previewImage=new ImageView(activity);
            previewImage.setFocusable(false);
            previewImage.setScaleType(ImageView.ScaleType.FIT_CENTER);
            previewLayer.addView(previewImage,new FrameLayout.LayoutParams(-1,-1));
            frame.addView(previewLayer);
        }
        previewImage.setImageBitmap(poster);
        reposition();
        if(layer!=null)layer.bringToFront();
    }

    void dismiss(){
        previewRequested=false;
        stop(false,null);
        if(previewLayer!=null){
            frame.removeView(previewLayer);
            previewLayer=null;previewImage=null;
        }
    }

    void play(File pptx,String sha,double x,double y,double w,double h){
        if(active)return;
        if(!pptx.isFile()||pptx.length()<12){
            listener.finished("El PowerPoint no está guardado.");
            return;
        }
        if(!validBounds(x,y,w,h)){
            listener.finished("Área del video fuera de la diapositiva.");
            return;
        }
        active=true;
        final int sequence=++generation;
        this.x=x;this.y=y;this.w=w;this.h=h;
        final File deck=pptx;
        final String fingerprint=key(deck,sha);
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
    private synchronized File extractVideo(File pptx,String fingerprint)throws Exception{
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
        // Keep the decoded still visible until the first real video frame.
        layer.setBackgroundColor(Color.TRANSPARENT);
        layer.setFocusable(false);
        texture=new TextureView(activity);
        texture.setAlpha(0f);
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
        if(layer==null&&previewLayer==null)return;
        int totalW=frame.getWidth(),totalH=frame.getHeight();
        if(totalW<=0||totalH<=0)return;
        int left=(int)Math.round(x*totalW),top=(int)Math.round(y*totalH);
        int width=Math.min(totalW-left,Math.max(1,(int)Math.round(w*totalW)));
        int height=Math.min(totalH-top,Math.max(1,(int)Math.round(h*totalH)));
        FrameLayout.LayoutParams layout=new FrameLayout.LayoutParams(width,height,Gravity.TOP|Gravity.LEFT);
        layout.leftMargin=left;layout.topMargin=top;
        if(previewLayer!=null){
            FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(width,height,Gravity.TOP|Gravity.LEFT);
            p.leftMargin=left;p.topMargin=top;
            previewLayer.setLayoutParams(p);
        }
        if(layer!=null)layer.setLayoutParams(layout);
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
                if(what==MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START){
                    Log.i(TAG,"Primer cuadro de Geraldine renderizado");
                    if(active&&texture!=null)texture.animate()
                        .alpha(1f).setDuration(185)
                        .setInterpolator(new DecelerateInterpolator()).start();
                }
                return false;
            });
            engine.setOnCompletionListener(player->{
                if(player!=media)return;
                // The already-visible preview sits behind this native surface.
                // Dissolve back to the same real frame rather than abruptly
                // removing the TextureView at completion.
                if(previewLayer!=null&&layer!=null){
                    final int sequence=generation;
                    layer.animate().alpha(0f).setDuration(170)
                        .setInterpolator(new DecelerateInterpolator())
                        .withEndAction(()->{
                            if(active&&generation==sequence)stop(true,"");
                        }).start();
                }else stop(true,"");
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
        if(texture!=null){
            texture.animate().cancel();
            texture.setSurfaceTextureListener(null);
            texture=null;
        }
        if(layer!=null){
            layer.animate().cancel();
            frame.removeView(layer);
            layer=null;
        }
        videoWidth=videoHeight=0;
        if(notifyWeb)listener.finished(error==null?"":error);
    }
}
