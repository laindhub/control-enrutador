package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/** Opaque native mask: the working WebView stays mounted, never visible. */
final class LoadingScreen extends LinearLayout {
    private final ProgressBar spinner;
    private final TextView title,detail;
    private final Button retry;
    LoadingScreen(Activity activity){
        super(activity);setOrientation(VERTICAL);setGravity(Gravity.CENTER);
        setBackgroundColor(Color.WHITE);int pad=Ui.dp(activity,24);setPadding(pad,pad,pad,pad);
        setClickable(true);setFocusable(true);
        spinner=new ProgressBar(activity);spinner.setIndeterminateTintList(ColorStateList.valueOf(Ui.RED));
        addView(spinner,new LinearLayout.LayoutParams(Ui.dp(activity,40),Ui.dp(activity,40)));
        title=Ui.label(activity,"Cargando…",21,true);title.setGravity(Gravity.CENTER);
        title.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);addView(title,Ui.spaced(activity,23));
        detail=Ui.label(activity,"Un momento, por favor.",14,false);detail.setTextColor(Ui.MUTED);
        detail.setGravity(Gravity.CENTER);detail.setLineSpacing(Ui.dp(activity,3),1f);addView(detail,Ui.spaced(activity,9));
        retry=Ui.button(activity,"Reintentar",true);addView(retry,Ui.spaced(activity,22));retry.setVisibility(GONE);
    }
    void loading(String heading,String message){
        title.setText(heading);detail.setText(message);spinner.setVisibility(VISIBLE);retry.setVisibility(GONE);setVisibility(VISIBLE);
    }
    void error(String heading,String message,Runnable action){
        title.setText(heading);detail.setText(message);spinner.setVisibility(GONE);retry.setVisibility(VISIBLE);
        retry.setOnClickListener(v->action.run());setVisibility(VISIBLE);
    }
}
