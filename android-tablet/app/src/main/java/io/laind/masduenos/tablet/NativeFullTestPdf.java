package io.laind.masduenos.tablet;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.pdf.PdfDocument;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Native printable reproduction of the CRM's HTML report:
 * h1 / generation-date / section-title / summary-box / info-item / conclusion.
 *
 * No WebView screenshot, guessed screenshot midpoint or bitmaps. Content is
 * laid out from the ACTUAL DOM sections into a complete Letter PDF, before
 * PdfComposer places its two pages onto one A4 sheet.
 */
final class NativeFullTestPdf {
    static final int W=612,H=792;
    static final float LEFT=22, RIGHT=W-LEFT, TOP=23, BOTTOM=H-27;
    static final int RED=Color.rgb(252,68,48),INK=Color.rgb(51,51,51);
    private static final Typeface REGULAR=Typeface.create("sans-serif",Typeface.NORMAL);
    private static final Typeface BOLD=Typeface.create("sans-serif",Typeface.BOLD);
    private final PdfDocument pdf=new PdfDocument();
    private Canvas canvas;
    private int pageCount=0;
    private float y=TOP;
    private String reportTitle;

    static File write(JSONObject report,File output) throws IOException {
        if(report==null||!report.optBoolean("ok"))
            throw new IOException("No se pudo leer el Full-test original.");
        JSONArray sections=report.optJSONArray("sections");
        String title=report.optString("title","");
        if(!title.startsWith("Test del Dueño")||sections==null||sections.length()<7)
            throw new IOException("El CRM no entregó todas las secciones del Full-test.");
        NativeFullTestPdf writer=new NativeFullTestPdf();
        try{
            writer.reportTitle=title;
            writer.newPage();
            writer.header(report);
            for(int i=0;i<sections.length();i++){
                JSONObject section=sections.optJSONObject(i);
                if(section==null||section.optString("heading").trim().isEmpty())
                    throw new IOException("Se encontró una sección incompleta.");
                writer.section(section);
            }
            writer.finishPage();
            // The CRM workflow expects two original pages; preserve the second
            // sheet when unusually short reports would otherwise use one.
            if(writer.pageCount==1){
                writer.newPage();
                writer.finishPage();
            }
            if(writer.pageCount!=2)
                throw new IOException("El test necesita "+writer.pageCount+
                    " páginas. No se reducirá su letra ni se perderá información.");
            try(FileOutputStream stream=new FileOutputStream(output)){
                writer.pdf.writeTo(stream);
            }
            if(output.length()<2000)throw new IOException("El informe PDF generado está incompleto.");
            return output;
        }catch(Exception error){
            output.delete();
            if(error instanceof IOException)throw (IOException)error;
            throw new IOException("Error al preparar el test: "+error.getMessage(),error);
        }finally{writer.pdf.close();}
    }

    private void newPage() throws IOException {
        if(pageCount>=2)throw new IOException("El Full-test excede dos páginas Carta; no se imprimirá recortado.");
        pageCount++;
        PdfDocument.PageInfo info=new PdfDocument.PageInfo.Builder(W,H,pageCount).create();
        activePage=pdf.startPage(info);
        canvas=activePage.getCanvas();
        canvas.drawColor(Color.WHITE);
        y=TOP;
    }
    private PdfDocument.Page activePage;
    private void finishPage(){
        if(activePage==null)return;
        // Page counter is drawn in content coordinates, not the printer's
        // default margin, to match the original printout's pagination.
        drawRight(pageCount+"/2",RIGHT,H-11,6.6f,INK,false);
        pdf.finishPage(activePage);
        activePage=null;canvas=null;
    }
    private Paint paint(float size,int color,boolean bold){
        Paint p=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.SUBPIXEL_TEXT_FLAG);
        p.setTypeface(bold?BOLD:REGULAR);
        p.setTextSize(size);p.setColor(color);
        return p;
    }
    private void draw(String text,float x,float baseline,float size,int color,boolean bold){
        canvas.drawText(text,x,baseline,paint(size,color,bold));
    }
    private void drawRight(String text,float x,float baseline,float size,int color,boolean bold){
        Paint p=paint(size,color,bold);
        canvas.drawText(text,x-p.measureText(text),baseline,p);
    }
    private void center(String text,float baseline,float size,int color,boolean bold){
        Paint p=paint(size,color,bold);
        canvas.drawText(text,(W-p.measureText(text))/2f,baseline,p);
    }
    private void header(JSONObject report) throws IOException {
        String host=report.optString("host","");
        if(!host.isEmpty())drawRight("Host: "+host,RIGHT,y+4,7f,Color.DKGRAY,false);
        y+=24;
        for(String line:wrap(reportTitle,paint(16f,RED,true),W-2*LEFT)){
            center(line,y,16f,RED,true);y+=19;
        }
        String date=report.optString("generated","");
        if(!date.isEmpty())center(date,y+2,6f,INK,false);
        y+=23;
    }
    private static List<String> wrap(String raw,Paint paint,float width){
        ArrayList<String> lines=new ArrayList<>();
        String text=raw==null?"":raw.trim().replace('\r',' ').replace('\t',' ');
        if(text.isEmpty())return lines;
        for(String logical:text.split("\n",-1)){
            if(logical.trim().isEmpty()){lines.add("");continue;}
            StringBuilder line=new StringBuilder();
            for(String word:logical.trim().split("\\s+")){
                String next=line.length()==0?word:line+" "+word;
                if(paint.measureText(next)>width&&line.length()>0){
                    lines.add(line.toString());line.setLength(0);
                }
                // Bound a single oversized token without truncating content.
                if(paint.measureText(word)>width){
                    StringBuilder piece=new StringBuilder();
                    for(char ch:word.toCharArray()){
                        if(paint.measureText(piece.toString()+ch)>width&&piece.length()>0){
                            if(line.length()>0){lines.add(line.toString());line.setLength(0);}
                            lines.add(piece.toString());piece.setLength(0);
                        }
                        piece.append(ch);
                    }
                    line.append(piece);
                }else if(line.length()==0)line.append(word);
                else line.append(' ').append(word);
            }
            if(line.length()>0)lines.add(line.toString());
        }
        return lines;
    }
    private float rowHeight(JSONObject row){
        float maxLabel=155f,valueWidth=RIGHT-(LEFT+168)-9;
        Paint labels=paint(8f,INK,true),values=paint(8f,INK,false);
        int a=Math.max(1,wrap(row.optString("label",""),labels,maxLabel).size());
        int b=Math.max(1,wrap(row.optString("value",""),values,valueWidth).size());
        return Math.max(a,b)*10.4f+2;
    }
    private void section(JSONObject section) throws IOException {
        JSONArray rows=section.optJSONArray("rows");
        String message=section.optString("message","").trim();
        float cardHeight=0;
        if(rows!=null&&rows.length()>0){
            cardHeight=14;
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.optJSONObject(i);
                if(row!=null)cardHeight+=rowHeight(row);
            }
            cardHeight+=3;
        }
        if(!message.isEmpty()){
            cardHeight+=Math.max(1,wrap(message,paint(8.4f,RED,true),W-2*LEFT-32).size())*11+20;
        }
        final float headingH=24,spacing=9;
        final float needed=headingH+cardHeight+spacing;
        if(y+needed>BOTTOM && pageCount<2){
            finishPage();newPage();
        }
        if(y+needed>BOTTOM)throw new IOException(
            "El contenido del test es demasiado largo para dos páginas Carta.");
        y+=6;
        draw(section.optString("heading"),LEFT,y+7,11,RED,true);
        Paint redLine=new Paint(Paint.ANTI_ALIAS_FLAG);redLine.setColor(RED);redLine.setStrokeWidth(.65f);
        canvas.drawLine(LEFT,y+11,RIGHT,y+11,redLine);
        y+=17;
        if(rows!=null&&rows.length()>0){
            float top=y,height=cardHeight-(message.isEmpty()?0:Math.max(1,wrap(message,paint(8.4f,RED,true),W-2*LEFT-32).size())*11+20);
            Paint border=new Paint(Paint.ANTI_ALIAS_FLAG);border.setColor(Color.rgb(240,240,240));border.setStyle(Paint.Style.STROKE);border.setStrokeWidth(.7f);
            canvas.drawRoundRect(LEFT,top,RIGHT,top+height,3,3,border);
            float lineY=top+13f;
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.optJSONObject(i);if(row==null)continue;
                List<String> key=wrap(row.optString("label",""),paint(8f,INK,true),155f);
                List<String> val=wrap(row.optString("value",""),paint(8f,INK,false),RIGHT-(LEFT+168)-9);
                int total=Math.max(Math.max(key.size(),val.size()),1);
                for(int j=0;j<total;j++){
                    if(j<key.size())draw(key.get(j),LEFT+9,lineY,8f,INK,true);
                    if(j<val.size())draw(val.get(j),LEFT+168,lineY,8f,INK,false);
                    lineY+=10.4f;
                }
                lineY+=2f;
            }
            y=top+height+6f;
        }
        if(!message.isEmpty()){
            List<String> lines=wrap(message,paint(8.4f,RED,true),W-2*LEFT-32);
            float height=lines.size()*11+16f;
            Paint border=new Paint(Paint.ANTI_ALIAS_FLAG);
            border.setColor(RED);border.setStrokeWidth(.7f);
            border.setStyle(Paint.Style.STROKE);
            border.setPathEffect(new DashPathEffect(new float[]{3f,2f},0));
            canvas.drawRect(LEFT+4,y,RIGHT-4,y+height,border);
            for(int i=0;i<lines.size();i++)
                center(lines.get(i),y+11f+i*11f,8.4f,RED,true);
            y+=height+6f;
        }
        y+=4f;
    }
    private NativeFullTestPdf(){}
}