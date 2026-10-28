package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

final class Ui {
    static final int INK=Color.rgb(23,23,23);
    static final int MUTED=Color.rgb(104,104,104);
    static final int RED=Color.rgb(216,37,27);
    static final int LINE=Color.rgb(232,232,232);
    static int dp(Activity a,float value){return (int)(value*a.getResources().getDisplayMetrics().density+0.5f);}
    static GradientDrawable bg(Activity a,int color,int radius,int border){
        GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(a,radius));
        if(border!=0)g.setStroke(dp(a,1),border);return g;
    }
    static LinearLayout column(Activity a,int gap){
        LinearLayout l=new LinearLayout(a);l.setOrientation(LinearLayout.VERTICAL);l.setPadding(dp(a,gap),dp(a,gap),dp(a,gap),dp(a,gap));return l;
    }
    static TextView label(Activity a,String text,int size,boolean bold){
        TextView t=new TextView(a);t.setText(text);t.setTextSize(size);t.setTextColor(INK);
        if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);
        return t;
    }
    static Button button(Activity a,String text,boolean primary){
        Button b=new Button(a);b.setText(text);b.setAllCaps(false);b.setTextSize(15);
        b.setTextColor(primary?Color.WHITE:INK);
        b.setBackground(bg(a,primary?RED:Color.WHITE,13,primary?0:LINE));
        b.setMinHeight(dp(a,54));return b;
    }
    static LinearLayout.LayoutParams spaced(Activity a,int top){
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(a,top);return lp;
    }
    static void addLabel(Activity a,LinearLayout target,String text,int marginTop){
        TextView label=label(a,text,14,true);target.addView(label,spaced(a,marginTop));
    }
    static void statusBars(Activity a){
        a.getWindow().setStatusBarColor(Color.WHITE);a.getWindow().setNavigationBarColor(Color.WHITE);
        a.getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }
    static boolean tabletLandscape(Activity a){return a.getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE;}
    private Ui(){}
}
