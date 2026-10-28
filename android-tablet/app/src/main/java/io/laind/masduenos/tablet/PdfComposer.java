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
    /**
     * Supplemental information stays inside the verified EMPTY region of the
     * original two-up A4 sheet: x=253..410, y=47..347 PDF points.
     *
     * The ORIGINAL test is rotated -90 degrees by drawLikeEdge().
     * Our annotation intentionally rotates +90 degrees (the reverse), so it
     * faces the operator standing in front of the archived sheet.
     * It does not translate, shrink, clip or reflow the original test.
     */
    private static void drawThreeFieldsInWhitespace(Canvas canvas,
                         String presenter,String advisor,String description) throws IOException {
        final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
        final int red=Color.rgb(210,38,27);
        final int ink=Color.rgb(29,30,34);
        final int gray=Color.rgb(96,100,106);
        canvas.save();
        canvas.translate(410f,47f);
        canvas.rotate(90f); // Reverse orientation relative to the Full-test itself.

        p.setColor(red);
        p.setTypeface(android.graphics.Typeface.create("sans-serif",android.graphics.Typeface.BOLD));
        p.setTextSize(11.5f);
        canvas.drawText("REFERENCIAS DE SALÓN",6f,13.5f,p);

        drawFieldCard(canvas,p,24f,0,"CHARLA DE",presenter,red,ink,gray);
        drawFieldCard(canvas,p,68f,1,"DERIVADO A",advisor,red,ink,gray);
        drawFieldCard(canvas,p,112f,2,"DESCRIPCIÓN",description,red,ink,gray);

        canvas.restore();
    }
    private static void drawFieldCard(Canvas c,Paint p,float top,int type,
                 String label,String value,int red,int ink,int gray) throws IOException {
        p.setColor(Color.rgb(249,248,247));
        p.setStyle(Paint.Style.FILL);
        c.drawRoundRect(4f,top,297f,top+40f,5.5f,5.5f,p);
        p.setColor(Color.rgb(221,223,225));
        p.setStrokeWidth(.75f);
        p.setStyle(Paint.Style.STROKE);
        c.drawRoundRect(4f,top,297f,top+40f,5.5f,5.5f,p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(red);
        c.drawRoundRect(4f,top,7f,top+40f,2f,2f,p);

        // Native Canvas vector symbols based on the two user-supplied icons:
        // presentation board for "Charla de"; person silhouette for advisor.
        // A stylized note identifies the free-text physical description.
        drawSymbol(c,p,type,15f,top+10f,red);

        p.setTypeface(android.graphics.Typeface.create("sans-serif-medium",android.graphics.Typeface.BOLD));
        p.setTextSize(8.2f);
        p.setColor(gray);
        c.drawText(label,43f,top+12.5f,p);

        p.setColor(ink);
        p.setTypeface(android.graphics.Typeface.create("sans-serif",android.graphics.Typeface.BOLD));
        p.setTextSize(11.8f);
        String cleaned=clean(value);
        List<String> lines=wrap(cleaned,p,244f);
        if(lines.size()>2)
            throw new IOException("La descripción es demasiado larga para la hoja de archivo.");
        int i=0;
        for(String line:lines){
            if(p.measureText(line)>244f)
                throw new IOException("Una referencia no cabe en la hoja de archivo.");
            c.drawText(line,43f,top+27f+i*11.5f,p);
            i++;
        }
    }
    private static void drawSymbol(Canvas c,Paint p,int kind,float x,float y,int red){
        c.save();
        c.translate(x,y);
        p.setColor(red);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(1.65f);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        if(kind==0){
            // Presentation board + play triangle (presentation.svg).
            c.drawRoundRect(0f,3f,20f,20f,2f,2f,p);
            c.drawLine(10f,0f,10f,3f,p);
            c.drawLine(7f,0f,13f,0f,p);
            c.drawLine(8f,20f,5f,24f,p);
            c.drawLine(12f,20f,15f,24f,p);
            android.graphics.Path play=new android.graphics.Path();
            play.moveTo(8f,8f);play.lineTo(14f,11.5f);
            play.lineTo(8f,15f);play.close();c.drawPath(play,p);
        }else if(kind==1){
            // Person icon (person.svg): head and shoulders.
            c.drawCircle(10f,7f,5f,p);
            c.drawArc(1f,13f,19f,26f,185f,170f,false,p);
        }else{
            c.drawRoundRect(2f,1f,18f,23f,2f,2f,p);
            c.drawLine(6f,7f,14f,7f,p);
            c.drawLine(6f,12f,14f,12f,p);
            c.drawLine(6f,17f,12f,17f,p);
        }
        p.setStyle(Paint.Style.FILL);
        c.restore();
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
