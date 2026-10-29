package io.laind.masduenos.tablet;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.os.Bundle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

/** Presenters first, then their talks for today. 2x2 tile grid on phones and tablets. */
public final class CharlasActivity extends Activity {
    private TalkStore talks;
    private LeadStore leads;
    private LinearLayout contents;
    private String selectedPresenter="";
    private ArrayList<TalkStore.Talk> today=new ArrayList<>();
    @Override public void onCreate(Bundle state){
        super.onCreate(state);Ui.statusBars(this);
        talks=new TalkStore(this);leads=new LeadStore(this);
        if(state!=null)selectedPresenter=state.getString("presenter","");
        LinearLayout root=Ui.column(this,16);
        root.setBackgroundColor(Color.WHITE);
        NavigationShell.install(this,root,NavigationShell.HOST);
        LinearLayout heading=new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView title=Ui.label(this,"Charlas",25,true);
        heading.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button add=Ui.button(this,"+ Iniciar",true);
        add.setOnClickListener(v->newTalk(selectedPresenter));
        heading.addView(add,new LinearLayout.LayoutParams(Ui.dp(this,113),Ui.dp(this,49)));
        root.addView(heading,Ui.spaced(this,8));
        ScrollView scroll=new ScrollView(this);
        contents=new LinearLayout(this);contents.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(contents);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        refresh();
    }
    @Override protected void onResume(){super.onResume();if(contents!=null)refresh();}
    @Override protected void onSaveInstanceState(Bundle state){
        state.putString("presenter",selectedPresenter);super.onSaveInstanceState(state);
    }
    private void refresh(){
        try{today=talks.today();render();}
        catch(Exception e){UiSheets.info(this,"No se pudieron leer las charlas",e.getMessage());}
    }
    private void newTalk(String selected){
        TalkPrompts.create(this,talks,"Sin asignar".equals(selected)?"":selected,t->{
            selectedPresenter=t.presenter;openTalk(t);
        });
    }
    private void openTalk(TalkStore.Talk t){
        Intent intent=new Intent(this,DashboardActivity.class);
        intent.putExtra("talk_id",t.id);
        intent.putExtra("presenter_filter",t.presenter);
        startActivity(intent);
    }
    private void render(){
        contents.removeAllViews();
        if(selectedPresenter.isEmpty())drawPresenters();
        else drawTalks();
    }
    private void drawPresenters(){
        TextView hint=Ui.label(this,
            "Elegí un presentador para ver todas sus charlas de hoy.",14,false);
        hint.setTextColor(Ui.MUTED);
        contents.addView(hint,Ui.spaced(this,10));
        LinkedHashMap<String,ArrayList<TalkStore.Talk>> grouped=new LinkedHashMap<>();
        for(TalkStore.Talk t:today){
            String key=t.presenter.isEmpty()?"Sin asignar":t.presenter;
            if(!grouped.containsKey(key))grouped.put(key,new ArrayList<>());
            grouped.get(key).add(t);
        }
        if(grouped.isEmpty()){
            TextView empty=Ui.label(this,"Todavía no empezaste ninguna charla hoy.",17,true);
            contents.addView(empty,Ui.spaced(this,27));
            Button first=Ui.button(this,"Iniciar primera charla",true);
            first.setOnClickListener(v->newTalk(""));
            contents.addView(first,Ui.spaced(this,13));
            return;
        }
        ArrayList<Map.Entry<String,ArrayList<TalkStore.Talk>>> presenters=
            new ArrayList<>(grouped.entrySet());
        // Exactly four positions per block (two columns by two rows).
        int blocks=(presenters.size()+3)/4;
        for(int block=0;block<blocks;block++){
            for(int row=0;row<2;row++){
                LinearLayout line=new LinearLayout(this);
                line.setOrientation(LinearLayout.HORIZONTAL);
                for(int col=0;col<2;col++){
                    int index=block*4+row*2+col;
                    LinearLayout card;
                    if(index<presenters.size()){
                        Map.Entry<String,ArrayList<TalkStore.Talk>> entry=presenters.get(index);
                        card=presenterCard(entry.getKey(),entry.getValue());
                    }else{
                        card=Ui.column(this,10);
                        card.setBackground(Ui.bg(this,Color.rgb(251,251,251),17,Ui.LINE));
                        TextView placeholder=Ui.label(this,"＋",27,false);
                        placeholder.setTextColor(Ui.MUTED);card.addView(placeholder);
                        TextView helper=Ui.label(this,"Nueva charla",12,false);
                        helper.setTextColor(Ui.MUTED);card.addView(helper);
                        card.setOnClickListener(v->newTalk(""));
                    }
                    LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(0,Ui.dp(this,142),1);
                    if(col==1)params.leftMargin=Ui.dp(this,10);
                    line.addView(card,params);
                }
                contents.addView(line,Ui.spaced(this,10));
            }
        }
    }
    private LinearLayout presenterCard(String presenter,ArrayList<TalkStore.Talk> owned){
        LinearLayout card=Ui.column(this,13);
        card.setBackground(Ui.bg(this,Color.rgb(251,244,243),18,Ui.LINE));
        TextView icon=Ui.label(this,"◉",22,true);
        icon.setTextColor(Ui.RED);card.addView(icon);
        TextView name=Ui.label(this,presenter,16,true);
        name.setMaxLines(2);card.addView(name,Ui.spaced(this,5));
        int present=0;
        for(TalkStore.Talk t:owned){
            present++;
        }
        TextView count=Ui.label(this,present+" charla"+(present==1?"":"s")+" hoy",12,false);
        count.setTextColor(Ui.MUTED);card.addView(count,Ui.spaced(this,5));
        card.setOnClickListener(v->{selectedPresenter=presenter;render();});
        return card;
    }
    private void drawTalks(){
        TextView back=Ui.label(this,"‹ Todos los presentadores",14,true);
        back.setTextColor(Ui.RED);
        back.setOnClickListener(v->{selectedPresenter="";render();});
        contents.addView(back,Ui.spaced(this,12));
        TextView heading=Ui.label(this,selectedPresenter,24,true);
        contents.addView(heading,Ui.spaced(this,18));
        ArrayList<TalkStore.Talk> matching=new ArrayList<>();
        for(TalkStore.Talk t:today){
            String owner=t.presenter.isEmpty()?"Sin asignar":t.presenter;
            if(selectedPresenter.equals(owner))matching.add(t);
        }
        TextView sub=Ui.label(this,matching.size()+" charla"+(matching.size()==1?"":"s")+
            " de hoy",13,false);
        sub.setTextColor(Ui.MUTED);contents.addView(sub,Ui.spaced(this,7));
        for(TalkStore.Talk talk:matching){
            LinearLayout row=Ui.column(this,14);
            row.setBackground(Ui.bg(this,Color.WHITE,15,Ui.LINE));
            TextView name=Ui.label(this,talk.display(),18,true);
            row.addView(name);
            int occupied=0;
            try{for(LeadStore.Lead l:leads.all())if(talk.id.equals(l.talkId))occupied++;}
            catch(Exception ignored){}
            TextView stats=Ui.label(this,occupied+" de "+TalkStore.CAPACITY+
                " sillas ocupadas · Abrir distribución ›",13,false);
            stats.setTextColor(Ui.MUTED);row.addView(stats,Ui.spaced(this,10));
            row.setOnClickListener(v->openTalk(talk));
            contents.addView(row,Ui.spaced(this,10));
            if(talk.presenter.isEmpty()){
                Button owner=Ui.button(this,"Asignar presentador a esta charla",false);
                owner.setOnClickListener(v->TalkPrompts.changePresenter(
                    this,talks,talk,leads,this::refresh));
                contents.addView(owner,Ui.spaced(this,7));
            }
        }
        Button start=Ui.button(this,"+ Iniciar otra charla de "+selectedPresenter,true);
        start.setOnClickListener(v->newTalk(selectedPresenter));
        contents.addView(start,Ui.spaced(this,21));
    }
    @Override public void onBackPressed(){
        if(!selectedPresenter.isEmpty()){selectedPresenter="";render();return;}
        super.onBackPressed();
    }
}
