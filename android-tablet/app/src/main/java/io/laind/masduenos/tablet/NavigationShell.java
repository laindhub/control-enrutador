package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Persistent responsive navigation: bottom bar on phones, left dock on tablets. */
final class NavigationShell {
    static final int BOARD=0,HOST=1,ROUTER=2;
    static void install(Activity activity,View content,int active){
        boolean tablet=activity.getResources().getConfiguration().smallestScreenWidthDp>=600;
        LinearLayout shell=new LinearLayout(activity);
        shell.setOrientation(tablet?LinearLayout.HORIZONTAL:LinearLayout.VERTICAL);
        shell.setBackgroundColor(Color.WHITE);
        LinearLayout dock=new LinearLayout(activity);
        dock.setOrientation(tablet?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
        dock.setGravity(tablet?Gravity.TOP:Gravity.CENTER);
        dock.setPadding(Ui.dp(activity,tablet?8:5),Ui.dp(activity,tablet?18:5),
            Ui.dp(activity,tablet?8:5),Ui.dp(activity,tablet?8:5));
        dock.setBackgroundColor(Color.rgb(250,250,250));
        if(tablet){
            TextView mark=Ui.label(activity,"MD",20,true);
            mark.setTextColor(Ui.RED);mark.setGravity(Gravity.CENTER);
            dock.addView(mark,new LinearLayout.LayoutParams(-1,Ui.dp(activity,65)));
        }
        int[] ids={BOARD,HOST,ROUTER};
        String[] icons={"▦","⌕","⇄"};
        String[] labels={"Tablero","Atendidas","Enrutador"};
        for(int i=0;i<ids.length;i++){
            final int destination=ids[i];
            LinearLayout item=new LinearLayout(activity);
            item.setOrientation(LinearLayout.VERTICAL);item.setGravity(Gravity.CENTER);
            item.setBackground(Ui.bg(activity,i==active?Color.rgb(252,235,233):Color.TRANSPARENT,14,0));
            TextView icon=Ui.label(activity,icons[i],tablet?25:21,false);
            icon.setTextColor(i==active?Ui.RED:Ui.MUTED);icon.setGravity(Gravity.CENTER);item.addView(icon);
            TextView label=Ui.label(activity,labels[i],tablet?12:11,i==active);
            label.setTextColor(i==active?Ui.RED:Ui.MUTED);label.setGravity(Gravity.CENTER);item.addView(label);
            item.setContentDescription(labels[i]);
            item.setOnClickListener(v->navigate(activity,destination));
            if(tablet){
                LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,Ui.dp(activity,77));lp.bottomMargin=Ui.dp(activity,9);
                dock.addView(item,lp);
            }else{
                dock.addView(item,new LinearLayout.LayoutParams(0,Ui.dp(activity,64),1));
            }
        }
        if(tablet){
            shell.addView(dock,new LinearLayout.LayoutParams(Ui.dp(activity,104),-1));
            View sep=new View(activity);sep.setBackgroundColor(Ui.LINE);
            shell.addView(sep,new LinearLayout.LayoutParams(Ui.dp(activity,1),-1));
            shell.addView(content,new LinearLayout.LayoutParams(0,-1,1));
        }else{
            shell.addView(content,new LinearLayout.LayoutParams(-1,0,1));
            View sep=new View(activity);sep.setBackgroundColor(Ui.LINE);
            shell.addView(sep,new LinearLayout.LayoutParams(-1,Ui.dp(activity,1)));
            shell.addView(dock,new LinearLayout.LayoutParams(-1,Ui.dp(activity,80)));
        }
        activity.setContentView(shell);
    }
    private static void navigate(Activity context,int screen){
        Class<? extends Activity> destination=screen==HOST?HostLookupActivity.class:
            screen==ROUTER?RouterActivity.class:DashboardActivity.class;
        if(context.getClass()==destination)return;
        Intent intent=new Intent(context,destination);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        context.startActivity(intent);
        if(context instanceof HostLookupActivity||context instanceof RouterActivity)context.finish();
    }
    private NavigationShell(){}
}
