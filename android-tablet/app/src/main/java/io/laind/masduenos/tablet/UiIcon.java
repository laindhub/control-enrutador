package io.laind.masduenos.tablet;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.View;

/** Crisp 24-unit line icons, independent of the phone's emoji font. */
final class UiIcon extends View {
    static final int HOME=0,ROUTE=1,ACTIVITY=2,USER=3;
    private final int kind;
    private int ink;
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    UiIcon(Context context,int kind,int ink){super(context);this.kind=kind;this.ink=ink;setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);}
    void color(int value){ink=value;invalidate();}
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);canvas.save();
        float size=Math.min(getWidth(),getHeight());
        canvas.translate((getWidth()-size)/2,(getHeight()-size)/2);canvas.scale(size/24f,size/24f);
        paint.setColor(ink);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1.65f);
        paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
        Path p=new Path();
        if(kind==HOME){
            p.moveTo(3,10);p.lineTo(12,3);p.lineTo(21,10);p.moveTo(5,9);p.lineTo(5,21);p.lineTo(19,21);p.lineTo(19,9);
            p.moveTo(9,21);p.lineTo(9,14);p.lineTo(15,14);p.lineTo(15,21);canvas.drawPath(p,paint);
        }else if(kind==ROUTE){
            canvas.drawCircle(5,6,2.2f,paint);canvas.drawCircle(19,18,2.2f,paint);
            p.moveTo(7.5f,6);p.lineTo(15,6);p.cubicTo(22,6,22,12,15,12);p.lineTo(9,12);p.cubicTo(2,12,2,18,9,18);p.lineTo(16.5f,18);canvas.drawPath(p,paint);
        }else if(kind==ACTIVITY){
            canvas.drawRoundRect(new RectF(4,4,20,21),3,3,paint);
            canvas.drawLine(8,2,8,6,paint);canvas.drawLine(16,2,16,6,paint);canvas.drawLine(4,9,20,9,paint);
            p.moveTo(8,15);p.lineTo(11,18);p.lineTo(16,12);canvas.drawPath(p,paint);
        }else{
            canvas.drawCircle(12,7.5f,4,paint);
            p.moveTo(4,21);p.lineTo(4,19);p.cubicTo(4,12,20,12,20,19);p.lineTo(20,21);canvas.drawPath(p,paint);
        }
        canvas.restore();
    }
}
