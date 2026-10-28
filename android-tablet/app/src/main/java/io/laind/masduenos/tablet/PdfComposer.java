package io.laind.masduenos.tablet;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.pdf.PdfDocument;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/** Local-only two-up A4 portrait archive sheet based on Impresión Más Dueños 2.3.1. */
public final class PdfComposer {
    static final int A4_WIDTH=595,A4_HEIGHT=842;
    public static File compose(File original,File output,String presenter,String advisor,String description) throws IOException {
        if(original==null||!original.isFile())throw new IOException("Primero seleccioná el PDF original.");
        try(ParcelFileDescriptor descriptor=ParcelFileDescriptor.open(original,ParcelFileDescriptor.MODE_READ_ONLY);
            PdfRenderer renderer=new PdfRenderer(descriptor);
            PdfDocument result=new PdfDocument()){
            if(renderer.getPageCount()!=2)throw new IOException("Esta versión requiere un Full-test original de 2 páginas. No se omitirá ninguna página.");
            PdfDocument.PageInfo info=new PdfDocument.PageInfo.Builder(595,842,1).create();
            PdfDocument.Page sheet=result.startPage(info);
            Canvas canvas=sheet.getCanvas();canvas.drawColor(Color.WHITE);
            drawHeader(canvas,presenter,advisor,description);
            final float top=71f,gutter=5f,slotHeight=(842f-top-gutter)/2f;
            for(int sourceIndex=0;sourceIndex<2;sourceIndex++){
                try(PdfRenderer.Page page=renderer.openPage(sourceIndex)){
                    // At ~216 DPI the A4 preview stays sharp without exhausting Tab A8 RAM.
                    final int factor=3;
                    Bitmap image=Bitmap.createBitmap(page.getWidth()*factor,page.getHeight()*factor,Bitmap.Config.ARGB_8888);
                    try{
                        image.eraseColor(Color.WHITE);
                        page.render(image,null,null,PdfRenderer.Page.RENDER_MODE_FOR_PRINT);
                        // Same orientation and reading order as the Edge extension:
                        // original first page at the bottom, second at the top.
                        float slotY=top+(sourceIndex==0?slotHeight+gutter:0);
                        drawRotated(canvas,image,slotY,slotHeight);
                    }finally{image.recycle();}
                }
            }
            result.finishPage(sheet);
            try(FileOutputStream stream=new FileOutputStream(output)){result.writeTo(stream);}
        }
        return output;
    }
    private static void drawRotated(Canvas canvas,Bitmap bitmap,float slotY,float slotH){
        float margin=8f;
        float rotatedWidth=bitmap.getHeight(),rotatedHeight=bitmap.getWidth();
        float scale=Math.min((595f-2*margin)/rotatedWidth,(slotH-5f)/rotatedHeight);
        float cx=595f/2f,cy=slotY+slotH/2f;
        Paint bitmapPaint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
        canvas.save();
        canvas.translate(cx,cy);
        canvas.rotate(90f);
        canvas.scale(scale,scale);
        canvas.drawBitmap(bitmap,-bitmap.getWidth()/2f,-bitmap.getHeight()/2f,bitmapPaint);
        canvas.restore();
    }
    private static void drawHeader(Canvas canvas,String presenter,String advisor,String description){
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(Color.rgb(30,30,30));
        paint.setTextSize(11f);paint.setFakeBoldText(true);
        canvas.drawText("HOJA DE ARCHIVO · MÁS DUEÑOS",16f,17f,paint);
        paint.setFakeBoldText(false);paint.setTextSize(10f);
        canvas.drawText(clip(paint,"Charla de: "+safe(presenter),272f),16f,34f,paint);
        canvas.drawText(clip(paint,"Derivado a: "+safe(advisor),280f),309f,34f,paint);
        paint.setTextSize(9.5f);
        String note="Descripción: "+safe(description);
        canvas.drawText(clip(paint,note,565f),16f,49f,paint);
        String second=remaining(paint,note,565f);
        if(!second.isEmpty())canvas.drawText(clip(paint,second,565f),16f,61f,paint);
        paint.setColor(Color.rgb(220,41,30));paint.setStrokeWidth(0.8f);
        canvas.drawLine(16f,67f,579f,67f,paint);
    }
    private static String safe(String value){String s=value==null?"":value.replaceAll("[\\r\\n\\t]+"," ").trim();return s.isEmpty()?"Sin especificar":s;}
    private static String clip(Paint paint,String text,float max){
        String s=text;
        while(s.length()>1&&paint.measureText(s)>max)s=s.substring(0,s.length()-1);
        return s;
    }
    private static String remaining(Paint paint,String text,float width){
        String first=clip(paint,text,width);return text.substring(Math.min(first.length(),text.length())).trim();
    }
    private PdfComposer(){}
}
