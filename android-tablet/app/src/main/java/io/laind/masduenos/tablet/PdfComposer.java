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
import java.util.ArrayList;
import java.util.List;

/**
 * STRICT source-preserving imposition: the original two PDF pages occupy
 * precisely the full two slots of A4 portrait, like Edge 2.3.1. Unlike older
 * releases, NO new top header, gutter, outer margins or proportional shrink
 * is introduced. Three supplemental routing fields are drawn ONLY in the
 * unused white space to the right of the original page-two content.
 *
 * This does NOT fix a non-original upstream source PDF. The source capture
 * must use the actual CRM print layout, never a guessed reconstructed form.
 */
public final class PdfComposer {
    static final int A4_WIDTH=595,A4_HEIGHT=842;
    static final float SHEET_MARGIN=0f;
    static final float GUTTER=0f;
    public static File compose(File original,File output,
                               String presenter,String advisor,String description) throws IOException {
        if(original==null||!original.isFile())
            throw new IOException("Falta el PDF original del Full-test.");
        PdfDocument result=new PdfDocument();
        try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(original,ParcelFileDescriptor.MODE_READ_ONLY);
            PdfRenderer renderer=new PdfRenderer(fd)){
            if(renderer.getPageCount()!=2)
                throw new IOException("El Full-test debe conservar sus dos páginas originales.");
            PdfDocument.PageInfo paper=new PdfDocument.PageInfo.Builder(A4_WIDTH,A4_HEIGHT,1).create();
            PdfDocument.Page sheet=result.startPage(paper);
            Canvas canvas=sheet.getCanvas();
            canvas.drawColor(Color.WHITE);
            final float slotH=(A4_HEIGHT-2*SHEET_MARGIN-GUTTER)/2f;
            for(int i=0;i<2;i++){
                try(PdfRenderer.Page page=renderer.openPage(i)){
                    final int factor=3;
                    Bitmap image=Bitmap.createBitmap(
                        page.getWidth()*factor,page.getHeight()*factor,Bitmap.Config.ARGB_8888);
                    try{
                        image.eraseColor(Color.WHITE);
                        page.render(image,null,null,PdfRenderer.Page.RENDER_MODE_FOR_PRINT);
                        // Extension 2.3.1: page 1 bottom, page 2 top,
                        // rotated 90 degrees in the output PDF.
                        final float slotTop=i==0?SHEET_MARGIN+slotH+GUTTER:SHEET_MARGIN;
                        drawLikeEdge(canvas,image,slotTop,slotH);
                    }finally{image.recycle();}
                }
            }
            // IMPORTANT: this is NOT a header. No original page moves.
            drawThreeFieldsInWhitespace(canvas,presenter,advisor,description);
            result.finishPage(sheet);
            try(FileOutputStream stream=new FileOutputStream(output)){result.writeTo(stream);}
        }finally{result.close();}
        return output;
    }
    private static void drawLikeEdge(Canvas canvas,Bitmap image,float slotTop,float slotHeight){
        float rotatedW=image.getHeight(),rotatedH=image.getWidth();
        float slotWidth=A4_WIDTH-2*SHEET_MARGIN;
        float scale=Math.min(slotWidth/rotatedW,slotHeight/rotatedH);
        float centerX=A4_WIDTH/2f;
        float centerY=slotTop+slotHeight/2f;
        Paint quality=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
        canvas.save();
        canvas.clipRect(SHEET_MARGIN,slotTop,A4_WIDTH-SHEET_MARGIN,slotTop+slotHeight);
        canvas.translate(centerX,centerY);
        canvas.rotate(-90f);
        canvas.scale(scale,scale);
        canvas.drawBitmap(image,-image.getWidth()/2f,-image.getHeight()/2f,quality);
        canvas.restore();
    }
    private static void drawThreeFieldsInWhitespace(Canvas canvas,
                         String presenter,String advisor,String description) throws IOException {
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
        paint.setTypeface(android.graphics.Typeface.create("sans-serif",android.graphics.Typeface.NORMAL));
        paint.setColor(Color.rgb(38,38,38));
        paint.setTextSize(9.5f);
        String[] entries={
            "Charla de: "+clean(presenter),
            "Derivado a: "+clean(advisor),
            "Descripción: "+clean(description)
        };
        int row=0;
        for(String entry:entries){
            for(String line:wrap(entry,paint,305f)){
                if(row>=9)throw new IOException("Los tres datos no caben sin alterar el Full-test.");
                // Corresponds to the empty area visible to the right of the
                // upper source page in the original two-up extension output.
                // The text follows the same orientation as report contents.
                canvas.save();
                canvas.translate(245f+row*16f,355f);
                canvas.rotate(-90f);
                canvas.drawText(line,0f,0f,paint);
                canvas.restore();
                row++;
            }
        }
    }
    private static List<String> wrap(String s,Paint p,float maxWidth){
        List<String> result=new ArrayList<>();
        StringBuilder line=new StringBuilder();
        for(String part:s.split(" ")){
            String candidate=line.length()==0?part:line+" "+part;
            if(p.measureText(candidate)>maxWidth&&line.length()>0){
                result.add(line.toString());
                line.setLength(0);
            }
            if(line.length()>0)line.append(' ');
            line.append(part);
        }
        if(line.length()>0)result.add(line.toString());
        return result;
    }
    private static String clean(String text){
        String value=text==null?"":text.replaceAll("[\\r\\n\\t]+"," ").trim();
        return value.isEmpty()?"Sin especificar":value;
    }
    private PdfComposer(){}
}
