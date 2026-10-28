package io.laind.masduenos.tablet;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.util.function.Consumer;

/** Salón-style, system-dialog-free feedback and action sheets. */
final class UiSheets {
    private static GradientDrawable surface(Activity a){
        GradientDrawable bg=new GradientDrawable();
        bg.setColor(Color.WHITE);
        float r=Ui.dp(a,23);
        bg.setCornerRadii(new float[]{r,r,r,r,0,0,0,0});
        return bg;
    }
    private static LinearLayout section(Activity a,String title,String description){
        LinearLayout panel=Ui.column(a,21);
        panel.setBackground(surface(a));
        View grip=new View(a);grip.setBackground(Ui.bg(a,Color.rgb(208,208,208),4,0));
        LinearLayout.LayoutParams hp=new LinearLayout.LayoutParams(Ui.dp(a,42),Ui.dp(a,4));
        hp.gravity=Gravity.CENTER_HORIZONTAL;hp.bottomMargin=Ui.dp(a,16);
        panel.addView(grip,hp);
        TextView heading=Ui.label(a,title,22,true);
        panel.addView(heading);
        if(description!=null&&!description.trim().isEmpty()){
            TextView detail=Ui.label(a,description,14,false);
            detail.setTextColor(Ui.MUTED);
            detail.setLineSpacing(Ui.dp(a,3),1f);
            panel.addView(detail,Ui.spaced(a,9));
        }
        return panel;
    }
    static Dialog open(Activity a,String title,String message,View extra,
                       String cancel,String accept,Runnable action){
        if(a.isFinishing()||a.isDestroyed())return null;
        Dialog dialog=new Dialog(a);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout panel=section(a,title,message);
        if(extra!=null){
            if(extra.getParent() instanceof ViewGroup)
                ((ViewGroup)extra.getParent()).removeView(extra);
            panel.addView(extra,Ui.spaced(a,15));
        }
        LinearLayout buttons=new LinearLayout(a);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        if(cancel!=null){
            Button back=Ui.button(a,cancel,false);
            back.setOnClickListener(v->dialog.dismiss());
            buttons.addView(back,new LinearLayout.LayoutParams(0,Ui.dp(a,52),1));
        }
        if(accept!=null){
            Button ok=Ui.button(a,accept,true);
            ok.setOnClickListener(v->{dialog.dismiss();if(action!=null)action.run();});
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,Ui.dp(a,52),1.15f);
            if(cancel!=null)lp.leftMargin=Ui.dp(a,9);
            buttons.addView(ok,lp);
        }
        panel.addView(buttons,Ui.spaced(a,19));
        ScrollView scroll=new ScrollView(a);
        scroll.setFillViewport(false);scroll.setClipToPadding(false);
        scroll.addView(panel);
        dialog.setContentView(scroll);
        dialog.getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
        dialog.getWindow().setDimAmount(.35f);
        dialog.show();
        Window window=dialog.getWindow();
        window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);
        window.setGravity(Gravity.BOTTOM);
        window.setNavigationBarColor(Color.WHITE);
        window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        return dialog;
    }
    static void info(Activity a,String title,String message){
        open(a,title,message,null,null,"Entendido",null);
    }
    static void confirm(Activity a,String title,String message,String negative,String affirmative,Runnable action){
        open(a,title,message,null,negative,affirmative,action);
    }
    static void options(Activity a,String title,String[] labels,Consumer<Integer> selected){
        if(a.isFinishing()||a.isDestroyed())return;
        Dialog dialog=new Dialog(a);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout panel=section(a,title,"Seleccioná una acción para continuar.");
        for(int i=0;i<labels.length;i++){
            int index=i;
            Button choice=Ui.button(a,labels[i],false);
            choice.setOnClickListener(v->{dialog.dismiss();selected.accept(index);});
            panel.addView(choice,Ui.spaced(a,9));
        }
        Button dismiss=Ui.button(a,"Cancelar",false);
        dismiss.setOnClickListener(v->dialog.dismiss());
        panel.addView(dismiss,Ui.spaced(a,14));
        ScrollView scroll=new ScrollView(a);
        scroll.addView(panel);
        dialog.setContentView(scroll);
        dialog.show();
        Window w=dialog.getWindow();
        w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);w.setDimAmount(.35f);
        w.setLayout(-1,-2);w.setGravity(Gravity.BOTTOM);
        w.setNavigationBarColor(Color.WHITE);
    }
    /** Light in-app status banner. No Android Toast or default system dialog. */
    static void notice(Activity a,String message,boolean error){
        if(a.isFinishing()||a.isDestroyed())return;
        FrameLayout decor=a.findViewById(android.R.id.content);
        if(decor==null)return;
        TextView banner=Ui.label(a,message,13,true);
        banner.setTextColor(error?Color.rgb(133,31,26):Color.rgb(23,100,71));
        banner.setBackground(Ui.bg(a,error?Color.rgb(255,237,234):Color.rgb(233,249,240),14,
            error?Color.rgb(250,194,188):Color.rgb(174,223,198)));
        banner.setPadding(Ui.dp(a,15),Ui.dp(a,13),Ui.dp(a,15),Ui.dp(a,13));
        banner.setElevation(Ui.dp(a,7));
        FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(-1,-2,Gravity.TOP);
        params.setMargins(Ui.dp(a,15),Ui.dp(a,37),Ui.dp(a,15),0);
        decor.addView(banner,params);
        banner.setAlpha(0);banner.setTranslationY(-Ui.dp(a,15));
        banner.animate().alpha(1).translationY(0).setDuration(180).start();
        new Handler(Looper.getMainLooper()).postDelayed(()->{
            if(banner.getParent()==decor)
                banner.animate().alpha(0).translationY(-Ui.dp(a,12)).setDuration(180)
                    .withEndAction(()->{if(banner.getParent()==decor)decor.removeView(banner);}).start();
        },3200);
    }
    private UiSheets(){}
}
