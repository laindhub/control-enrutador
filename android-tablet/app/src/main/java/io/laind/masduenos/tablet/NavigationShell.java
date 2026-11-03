package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

/** One phone-first dock shared by Salón and all native routing screens. */
final class NavigationShell {
    static final int BOARD=0,HOST=1,ROUTER=2;
    private static final String DOCK="unified_mobile_dock";
    static void install(Activity activity,View content,int active){install(activity,content,active,false);}
    static void installSalon(Activity activity,View content){install(activity,content,-1,true);}
    private static void install(Activity activity,View content,int active,boolean salon){
        LinearLayout shell=new LinearLayout(activity);shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(Color.WHITE);
        if(!salon && !(activity instanceof MainActivity) && !(activity instanceof HostActivity)){
            LinearLayout header=new LinearLayout(activity);header.setGravity(Gravity.CENTER_VERTICAL);
            header.setPadding(Ui.dp(activity,20),Ui.dp(activity,9),Ui.dp(activity,20),Ui.dp(activity,8));
            TextView brand=Ui.label(activity,"Más Dueños",18,true);
            header.addView(brand,new LinearLayout.LayoutParams(0,Ui.dp(activity,32),1));
            TextView area=Ui.label(activity,"Enrutación",12,false);area.setTextColor(Ui.MUTED);header.addView(area);
            shell.addView(header);
            LinearLayout tabs=new LinearLayout(activity);tabs.setGravity(Gravity.CENTER);
            tabs.setPadding(Ui.dp(activity,4),Ui.dp(activity,4),Ui.dp(activity,4),Ui.dp(activity,4));
            tabs.setBackground(Ui.bg(activity,Color.rgb(245,245,246),15,0));
            String[] labels={"Charlas","Sillas"};int[] screens={HOST,BOARD};
            for(int i=0;i<labels.length;i++){
                int screen=screens[i];boolean selected=active==screen;
                TextView tab=Ui.label(activity,labels[i],13,selected);tab.setGravity(Gravity.CENTER);
                tab.setTextColor(selected?Ui.INK:Ui.MUTED);
                tab.setBackground(Ui.ripple(activity,selected?Color.WHITE:Color.TRANSPARENT,11,0));
                tab.setContentDescription(labels[i]);tab.setSelected(selected);
                tab.setOnClickListener(v->navigate(activity,screen));
                tabs.addView(tab,new LinearLayout.LayoutParams(0,Ui.dp(activity,38),1));
            }
            LinearLayout.LayoutParams tl=new LinearLayout.LayoutParams(-1,-2);
            tl.setMargins(Ui.dp(activity,16),0,Ui.dp(activity,16),Ui.dp(activity,3));shell.addView(tabs,tl);
        }
        shell.addView(content,new LinearLayout.LayoutParams(-1,0,1));
        View separator=new View(activity);separator.setBackgroundColor(Ui.LINE);
        shell.addView(separator,new LinearLayout.LayoutParams(-1,Ui.dp(activity,1)));
        LinearLayout dock=new LinearLayout(activity);dock.setTag(DOCK);dock.setGravity(Gravity.CENTER);
        dock.setPadding(Ui.dp(activity,8),Ui.dp(activity,3),Ui.dp(activity,8),Ui.dp(activity,3));
        String[] labels={"Salón","Enrutar","Yo"};
        int[] iconKinds={UiIcon.HOME,UiIcon.ROUTE,UiIcon.USER};
        for(int i=0;i<labels.length;i++){
            final int tab=i;
            LinearLayout item=new LinearLayout(activity);item.setOrientation(LinearLayout.VERTICAL);item.setGravity(Gravity.CENTER);
            item.setTag("unified_tab_"+i);item.setBackground(Ui.ripple(activity,Color.WHITE,14,0));
            UiIcon icon=new UiIcon(activity,iconKinds[i],Ui.MUTED);item.addView(icon,new LinearLayout.LayoutParams(Ui.dp(activity,23),Ui.dp(activity,23)));
            TextView text=Ui.label(activity,labels[i],11,false);text.setGravity(Gravity.CENTER);text.setTextColor(Ui.MUTED);
            LinearLayout.LayoutParams caption=new LinearLayout.LayoutParams(-1,-2);caption.topMargin=Ui.dp(activity,4);item.addView(text,caption);
            item.setContentDescription(labels[i]);item.setFocusable(true);
            item.setOnClickListener(v->{if(tab==1)openRouting(activity);else openSalon(activity,tab==2?"yo":"puestos");});
            dock.addView(item,new LinearLayout.LayoutParams(0,Ui.dp(activity,60),1));
        }
        shell.addView(dock,new LinearLayout.LayoutParams(-1,-2));
        activity.setContentView(shell);selectDock(activity,salon?0:1);
        shell.setOnApplyWindowInsetsListener((view,insets)->{
            int left,top,right,bottom;boolean keyboard=false;
            if(Build.VERSION.SDK_INT>=30){
                android.graphics.Insets bars=insets.getInsets(android.view.WindowInsets.Type.systemBars()|android.view.WindowInsets.Type.displayCutout());
                left=bars.left;top=bars.top;right=bars.right;bottom=bars.bottom;
                keyboard=insets.isVisible(android.view.WindowInsets.Type.ime());
                if(keyboard)bottom=Math.max(bottom,insets.getInsets(android.view.WindowInsets.Type.ime()).bottom);
            }else{
                left=insets.getSystemWindowInsetLeft();top=insets.getSystemWindowInsetTop();right=insets.getSystemWindowInsetRight();bottom=insets.getSystemWindowInsetBottom();
                keyboard=bottom>Ui.dp(activity,150);
            }
            view.setPadding(left,top,right,bottom);
            dock.setVisibility(keyboard?View.GONE:View.VISIBLE);separator.setVisibility(keyboard?View.GONE:View.VISIBLE);
            return insets.consumeSystemWindowInsets();
        });
        shell.requestApplyInsets();
    }
    static void selectSalonTab(Activity activity,String tab){selectDock(activity,"yo".equals(tab)?2:0);}
    private static void selectDock(Activity activity,int active){
        ViewGroup root=activity.findViewById(android.R.id.content);
        if(root==null)return;
        for(int i=0;i<3;i++){
            LinearLayout item=root.findViewWithTag("unified_tab_"+i);if(item==null)continue;
            boolean selected=i==active;item.setSelected(selected);
            ((UiIcon)item.getChildAt(0)).color(selected?Ui.RED:Ui.MUTED);
            TextView label=(TextView)item.getChildAt(1);label.setTextColor(selected?Ui.RED:Ui.MUTED);
            label.setTypeface(android.graphics.Typeface.DEFAULT,selected?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL);
        }
    }
    static void openRouting(Activity activity){
        if(activity instanceof CharlasActivity)return;
        open(activity,new Intent(activity,CharlasActivity.class));
    }
    static void openSalon(Activity activity,String tab){
        if(activity instanceof RouterActivity&&"puestos".equals(tab))return;
        if(activity instanceof SalonActivity){((SalonActivity)activity).openSalonTab(tab);return;}
        Intent intent=new Intent(activity,SalonActivity.class);intent.putExtra("salon_destination",tab);open(activity,intent);
    }
    private static void navigate(Activity activity,int screen){
        Class<? extends Activity> destination=screen==HOST?CharlasActivity.class:screen==ROUTER?RouterActivity.class:DashboardActivity.class;
        if(activity.getClass()==destination)return;
        Intent intent=new Intent(activity,destination);
        if(destination==DashboardActivity.class)intent.putExtra("show_all_presenters",true);
        open(activity,intent);
    }
    static void open(Activity activity,Intent intent){
        intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        activity.startActivity(intent);activity.overridePendingTransition(0,0);
        if(activity instanceof HostActivity||activity instanceof HostLookupActivity)activity.finish();
        if(activity instanceof MainActivity && intent.getComponent()!=null &&
                !RouterActivity.class.getName().equals(intent.getComponent().getClassName()))activity.finish();
    }
    private NavigationShell(){}
}
