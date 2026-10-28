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

/**
 * SAME 2-up geometry as Impresión Más Dueños 2.3.1:
 * A4 portrait, original first page in bottom slot and second in upper slot,
 * both rotated 90 degrees counterclockwise; one archive sheet, one copy.
 *
 * The only intentional difference from the Edge extension is a narrow
 * top-level archive header with presentador/asesor/description.
 */
public final class PdfComposer {
    static final int A4_WIDTH=595,A4_HEIGHT=842;
    static final float HEADER=53f;
    static final float SHEET_MARGIN=0f;
    static final float GUTTER=0f;
    public static File compose(File original,File output,String presenter,String advisor,String description) throws IOException {
        if(original==null||!original.isFile())throw new IOException("Falta el Full-test original.");
        PdfDocument result=new PdfDocument();
        try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(original,ParcelFileDescriptor.MODE_READ_ONLY);
            PdfRenderer renderer=new PdfRenderer(fd)){
            if(renderer.getPageCount()!=2)
                throw new IOException("El informe no tiene las dos páginas originales; no se imprimirá incompleto.");
            PdfDocument.PageInfo paper=new PdfDocument.PageInfo.Builder(A4_WIDTH,A4_HEIGHT,1).create();
            PdfDocument.Page sheet=result.startPage(paper);
            Canvas canvas=sheet.getCanvas();canvas.drawColor(Color.WHITE);
            drawHeader(canvas,presenter,advisor,description);
            final float slotH=(A4_HEIGHT-HEADER-GUTTER)/2f;
            for(int i=0;i<2;i++){
                try(PdfRenderer.Page page=renderer.openPage(i)){
                    int factor=3;
                    Bitmap image=Bitmap.createBitmap(
                        page.getWidth()*factor,page.getHeight()*factor,Bitmap.Config.ARGB_8888);
                    try{
                        image.eraseColor(Color.WHITE);
                        page.render(image,null,null,PdfRenderer.Page.RENDER_MODE_FOR_PRINT);
                        // PDF coords are bottom-up; Android Canvas is top-down.
                        // The Edge extension's source page 1 is in bottom slot.
                        float slotY=HEADER+(i==0?slotH+GUTTER:0);
                        drawLikeEdge(canvas,image,slotY,slotH);
                    }finally{image.recycle();}
                }
            }
            result.finishPage(sheet);
            try(FileOutputStream stream=new FileOutputStream(output)){result.writeTo(stream);}
        }finally{result.close();}
        return output;
    }
    private static void drawLikeEdge(Canvas canvas,Bitmap image,float slotTop,float slotHeight){
        float rotatedW=image.getHeight(),rotatedH=image.getWidth();
        float scale=Math.min((A4_WIDTH-2*SHEET_MARGIN)/rotatedW,
                            slotHeight/rotatedH);
        float drawnWidth=rotatedW*scale,drawnHeight=rotatedH*scale;
        float centerX=A4_WIDTH/2f;
        float centerY=slotTop+(slotHeight-drawnHeight)/2f+drawnHeight/2f;
        Paint quality=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
        canvas.save();
        canvas.clipRect(SHEET_MARGIN,slotTop,A4_WIDTH-SHEET_MARGIN,slotTop+slotHeight);
        canvas.translate(centerX,centerY);
        // The extension rotates +90 in PDF's Y-up coordinates. In the native
        // Android Y-down canvas, identical visual orientation uses -90.
        canvas.rotate(-90f);
        canvas.scale(scale,scale);
        canvas.drawBitmap(image,-image.getWidth()/2f,-image.getHeight()/2f,quality);
        canvas.restore();
    }
    private static void drawHeader(Canvas canvas,String presenter,String advisor,String description){
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.rgb(30,30,30));paint.setTextSize(10f);
        paint.setFakeBoldText(true);
        canvas.drawText("HOJA DE ARCHIVO · MÁS DUEÑOS",14,13,paint);
        paint.setFakeBoldText(false);paint.setTextSize(9.5f);
        canvas.drawText(shorten(paint,"Charla de: "+clean(presenter),260f),14,29,paint);
        canvas.drawText(shorten(paint,"Derivado a: "+clean(advisor),292f),292,29,paint);
        paint.setTextSize(9f);
        canvas.drawText(shorten(paint,"Descripción: "+clean(description),A4_WIDTH-28),14,43,paint);
        paint.setColor(Color.rgb(130,130,130));paint.setStrokeWidth(.5f);
        canvas.drawLine(14,48,A4_WIDTH-14,48,paint);
    }
    private static String clean(String text){
        String value=text==null?"":text.replaceAll("[\\r\\n\\t]+"," ").trim();
        return value.isEmpty()?"Sin especificar":value;
    }
    private static String shorten(Paint paint,String text,float width){
        if(paint.measureText(text)<=width)return text;
        String ellipsis="…";int end=text.length();
        while(end>0&&paint.measureText(text.substring(0,end)+ellipsis)>width)end--;
        return text.substring(0,end)+ellipsis;
    }
    private PdfComposer(){}
}
