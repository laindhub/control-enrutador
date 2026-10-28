package io.laind.masduenos.tablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.Locale;

/** Main tablet workspace. Every talk models 4x3 seats; one UUID per seat.
 * A blank seat launches the Host Atendidas picker as a dialog on tablets.
 * Existing v0.5.x leads remain accessible in the unseated section.
 */
public final class DashboardActivity extends Activity {
    private static final int PICK_HOST=111;
    private LeadStore store;
    private TalkStore chats;
    private ArrayList<TalkStore.Talk> talks=new ArrayList<>();
    private ArrayList<LeadStore.Lead> current=new ArrayList<>();
    private String selectedTalkId="",pendingTalkId="";
    private int pendingSeat=-1;
    private boolean showHistory=false,initialised=false;
    private LinearLayout tabs,body;
    private TextView summary,dayCaption;
    private Button historyButton;
    private ScrollView scroll;

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.statusBars(this);
        store=new LeadStore(this);chats=new TalkStore(this);
        if(saved!=null){
            selectedTalkId=saved.getString("talk_id","");
            pendingTalkId=saved.getString("pending_talk_id","");
            pendingSeat=saved.getInt("pending_seat",-1);
        }
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(Ui.dp(this,15),Ui.dp(this,13),Ui.dp(this,15),0);
        root.setBackgroundColor(Color.WHITE);
        NavigationShell.install(this,root,NavigationShell.BOARD);

        LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout headText=new LinearLayout(this);headText.setOrientation(LinearLayout.VERTICAL);
        TextView title=Ui.label(this,"Charlas de hoy",26,true);headText.addView(title);
        dayCaption=Ui.label(this,"12 sillas por charla · 4 × 3",12,false);
        dayCaption.setTextColor(Ui.MUTED);headText.addView(dayCaption,Ui.spaced(this,4));
        heading.addView(headText,new LinearLayout.LayoutParams(0,-2,1));
        Button add=Ui.button(this,"+ Charla",true);
        add.setOnClickListener(v->createChat());
        heading.addView(add,new LinearLayout.LayoutParams(Ui.dp(this,106),Ui.dp(this,48)));
        root.addView(heading,Ui.spaced(this,6));

        HorizontalScrollView horizontal=new HorizontalScrollView(this);
        horizontal.setHorizontalScrollBarEnabled(false);
        tabs=new LinearLayout(this);tabs.setGravity(Gravity.CENTER_VERTICAL);
        horizontal.addView(tabs);
        root.addView(horizontal,Ui.spaced(this,16));

        summary=Ui.label(this,"Personas en gestión · Por imprimir · Por confirmar",12,false);
        summary.setTextColor(Ui.MUTED);
        root.addView(summary,Ui.spaced(this,9));

        scroll=new ScrollView(this);scroll.setFillViewport(true);
        body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(body);
        root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout foot=new LinearLayout(this);foot.setGravity(Gravity.CENTER_VERTICAL);
        historyButton=Ui.button(this,"Historial",false);
        historyButton.setOnClickListener(v->{
            showHistory=!showHistory;selectedTalkId="";
            historyButton.setText(showHistory?"Volver a hoy":"Historial");refresh();
        });
        foot.addView(historyButton,new LinearLayout.LayoutParams(Ui.dp(this,120),Ui.dp(this,45)));
        TextView notice=Ui.label(this,"Las sillas no modifican el CRM original",11,false);
        notice.setTextColor(Ui.MUTED);notice.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams np=new LinearLayout.LayoutParams(0,-1,1);np.leftMargin=Ui.dp(this,10);
        foot.addView(notice,np);
        root.addView(foot,Ui.spaced(this,7));
        foot.setPadding(0,Ui.dp(this,4),0,Ui.dp(this,9));

        initialised=true;refresh();
    }
    @Override protected void onSaveInstanceState(Bundle state){
        state.putString("talk_id",selectedTalkId);
        state.putString("pending_talk_id",pendingTalkId);
        state.putInt("pending_seat",pendingSeat);
        super.onSaveInstanceState(state);
    }
    @Override protected void onResume(){super.onResume();if(initialised)refresh();}
    private void alert(String title,String message){
        if(isFinishing())return;
        UiSheets.info(this,title,message);
    }
    private void refresh(){
        if(!initialised)return;
        try{
            talks=showHistory?chats.all():chats.today();
            current.clear();
            for(LeadStore.Lead lead:store.all()){
                if(showHistory||LeadStore.today().equals(lead.date))current.add(lead);
            }
            boolean selected=false;
            for(TalkStore.Talk t:talks)if(t.id.equals(selectedTalkId))selected=true;
            if(!selected)selectedTalkId=talks.isEmpty()?"":talks.get(0).id;
            draw();
        }catch(Exception ex){alert("No se pudo abrir el tablero","No se modificó ningún registro. "+ex.getMessage());}
    }
    private void createChat(){
        if(showHistory){showHistory=false;historyButton.setText("Historial");}
        try{
            TalkStore.Talk created=chats.createToday();
            selectedTalkId=created.id;refresh();
        }catch(Exception e){alert("Error al crear charla",e.getMessage());}
    }
    private TalkStore.Talk selected(){
        for(TalkStore.Talk t:talks)if(t.id.equals(selectedTalkId))return t;
        return null;
    }
    private void draw(){
        tabs.removeAllViews();body.removeAllViews();
        int pending=0,printing=0,management=0;
        for(LeadStore.Lead l:current){
            if(!LeadStore.DONE.equals(l.status))management++;
            if(l.prepared()&&!LeadStore.DONE.equals(l.status)&&!LeadStore.PAPER.equals(l.status))printing++;
            if(LeadStore.SENT.equals(l.status)||LeadStore.PAPER.equals(l.status))pending++;
        }
        summary.setText("Personas en gestión: "+management+"   ·   Por imprimir: "+printing+"   ·   Por confirmar: "+pending);
        dayCaption.setText((showHistory?"Todas las fechas":"Hoy, "+LeadStore.today())+"   ·   4 × 3 sillas por charla");
        for(TalkStore.Talk t:talks){
            int occupied=0;
            for(LeadStore.Lead l:current)if(t.id.equals(l.talkId))occupied++;
            final TextView tab=Ui.label(this,t.display()+"   "+occupied+"/12",13,t.id.equals(selectedTalkId));
            tab.setPadding(Ui.dp(this,14),Ui.dp(this,13),Ui.dp(this,14),Ui.dp(this,13));
            boolean active=t.id.equals(selectedTalkId);
            tab.setTextColor(active?Ui.RED:Ui.INK);
            tab.setBackground(Ui.bg(this,active?Color.rgb(253,239,237):Color.rgb(248,248,248),13,
                active?Ui.RED:Ui.LINE));
            tab.setOnClickListener(v->{selectedTalkId=t.id;draw();});
            tab.setOnLongClickListener(v->{showChatOptions(t);return true;});
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-2,-2);
            lp.rightMargin=Ui.dp(this,8);tabs.addView(tab,lp);
        }
        TalkStore.Talk talk=selected();
        if(talk==null){
            TextView empty=Ui.label(this,"No hay charlas en este período.",17,false);
            body.addView(empty,Ui.spaced(this,24));return;
        }
        LinearLayout titleRow=new LinearLayout(this);titleRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout titleBox=new LinearLayout(this);titleBox.setOrientation(LinearLayout.VERTICAL);
        TextView label=Ui.label(this,talk.display(),20,true);titleBox.addView(label);
        TextView hint=Ui.label(this,"Tocá una silla libre para elegir de Atendidas",12,false);
        hint.setTextColor(Ui.MUTED);titleBox.addView(hint,Ui.spaced(this,4));
        titleRow.addView(titleBox,new LinearLayout.LayoutParams(0,-2,1));
        Button rename=Ui.button(this,"Editar",false);
        rename.setOnClickListener(v->showChatOptions(talk));
        titleRow.addView(rename,new LinearLayout.LayoutParams(Ui.dp(this,82),Ui.dp(this,44)));
        body.addView(titleRow,Ui.spaced(this,17));

        LinearLayout room=Ui.column(this,9);
        room.setBackground(Ui.bg(this,Color.rgb(250,250,250),18,Ui.LINE));
        TextView front=Ui.label(this,"FRENTE DE LA CHARLA",11,true);
        front.setLetterSpacing(.13f);front.setGravity(Gravity.CENTER);
        front.setTextColor(Ui.MUTED);
        room.addView(front,Ui.spaced(this,3));

        for(int r=0;r<TalkStore.ROWS;r++){
            LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);
            for(int c=0;c<TalkStore.COLS;c++){
                final int chair=r*TalkStore.COLS+c;
                LeadStore.Lead occupant=null;
                for(LeadStore.Lead item:current)if(talk.id.equals(item.talkId)&&item.seatIndex==chair){
                    occupant=item;break;
                }
                LinearLayout tile=seat(talk,chair,occupant);
                LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,Ui.dp(this,
                    getResources().getConfiguration().smallestScreenWidthDp>=600?112:95),1);
                if(c!=0)lp.leftMargin=Ui.dp(this,7);
                row.addView(tile,lp);
            }
            room.addView(row,Ui.spaced(this,7));
        }
        TextView rear=Ui.label(this,"FONDO",10,true);
        rear.setGravity(Gravity.CENTER);rear.setTextColor(Ui.MUTED);
        room.addView(rear,Ui.spaced(this,8));
        body.addView(room,Ui.spaced(this,13));

        int occupied=0,done=0;
        for(LeadStore.Lead l:current)if(talk.id.equals(l.talkId)){
            occupied++;if(LeadStore.DONE.equals(l.status))done++;
        }
        TextView counter=Ui.label(this,occupied+" de 12 sillas ocupadas   ·   "+
            (12-occupied)+" libres   ·   "+done+" derivaciones registradas",13,false);
        counter.setTextColor(Ui.MUTED);body.addView(counter,Ui.spaced(this,10));

        ArrayList<LeadStore.Lead> unseated=new ArrayList<>();
        for(LeadStore.Lead l:current)if(l.talkId.isEmpty())unseated.add(l);
        if(!unseated.isEmpty()){
            TextView heading=Ui.label(this,"Personas sin silla · "+unseated.size(),16,true);
            body.addView(heading,Ui.spaced(this,22));
            TextView sub=Ui.label(this,"Fichas anteriores conservadas. Podés ubicarlas en cualquier silla libre.",12,false);
            sub.setTextColor(Ui.MUTED);body.addView(sub,Ui.spaced(this,5));
            for(LeadStore.Lead l:unseated){
                LinearLayout item=Ui.column(this,12);
                item.setBackground(Ui.bg(this,Color.WHITE,13,Ui.LINE));
                TextView n=Ui.label(this,l.name+" · "+l.label(),14,true);item.addView(n);
                TextView assign=Ui.label(this,"Tocar para asignar silla   ·   Mantener para abrir ficha",12,false);
                assign.setTextColor(Ui.RED);item.addView(assign,Ui.spaced(this,6));
                item.setOnClickListener(v->showMoveDialog(l));
                item.setOnLongClickListener(v->{openLead(l);return true;});
                body.addView(item,Ui.spaced(this,8));
            }
        }
        View gap=new View(this);body.addView(gap,new LinearLayout.LayoutParams(-1,Ui.dp(this,20)));
    }
    private LinearLayout seat(TalkStore.Talk talk,int index,LeadStore.Lead occupant){
        boolean filled=occupant!=null;
        boolean done=filled&&LeadStore.DONE.equals(occupant.status);
        int background=!filled?Color.WHITE:done?Color.rgb(231,248,238):Color.rgb(254,245,237);
        int stroke=!filled?Ui.LINE:done?Color.rgb(42,145,96):Color.rgb(218,126,85);
        LinearLayout tile=Ui.column(this,8);
        tile.setGravity(Gravity.CENTER);
        tile.setMinimumWidth(0);
        tile.setBackground(Ui.bg(this,background,13,stroke));
        String seatNumber=String.format(Locale.ROOT,"%02d",index+1);
        TextView num=Ui.label(this,"SILLA "+seatNumber+(filled?" · ⋯":""),10,true);
        num.setTextColor(filled?Ui.INK:Ui.MUTED);num.setGravity(Gravity.CENTER);
        tile.addView(num);
        TextView center=Ui.label(this,filled?occupant.name:"＋",filled?12:27,filled);
        center.setGravity(Gravity.CENTER);center.setMaxLines(2);
        center.setEllipsize(android.text.TextUtils.TruncateAt.END);
        center.setTextColor(filled?Ui.INK:Ui.RED);
        tile.addView(center,Ui.spaced(this,3));
        TextView state=Ui.label(this,filled?(done?"Derivado":occupant.prepared()?"Listo":"En gestión"):"Libre",10,false);
        state.setTextColor(done?Color.rgb(22,116,76):Ui.MUTED);
        state.setGravity(Gravity.CENTER);tile.addView(state,Ui.spaced(this,3));
        tile.setContentDescription("Silla "+(index+1)+", "+(filled?occupant.name+", "+occupant.label():"libre"));
        if(filled){
            LeadStore.Lead selectedLead=occupant;
            tile.setOnClickListener(v->showSeatOptions(selectedLead));
            tile.setOnLongClickListener(v->{showSeatOptions(selectedLead);return true;});
        }else tile.setOnClickListener(v->pickSeat(talk,index));
        return tile;
    }
    private void pickSeat(TalkStore.Talk t,int seat){
        if(showHistory&&!LeadStore.today().equals(t.date)){
            alert("Charla anterior","Solo se pueden ocupar sillas del día actual.");return;
        }
        pendingTalkId=t.id;pendingSeat=seat;
        Intent picker=new Intent(this,HostLookupActivity.class);
        picker.putExtra("seat_picker",true);
        picker.putExtra("seat_number",seat+1);
        picker.putExtra("talk_name",t.name);
        startActivityForResult(picker,PICK_HOST);
    }
    private void openLead(LeadStore.Lead lead){
        Intent editor=new Intent(this,MainActivity.class);
        editor.putExtra("lead_id",lead.id);startActivity(editor);
    }
    private void showChatOptions(TalkStore.Talk talk){
        String[] choices={"Cambiar nombre y hora","Eliminar charla vacía"};
        UiSheets.options(this,talk.display(),choices,index->{
                if(index==0)renameTalk(talk);
                else UiSheets.confirm(this,"Eliminar charla vacía",
                    "Solo se eliminará si no tiene personas asignadas.","Cancelar","Eliminar",()->{
                        try{chats.removeEmpty(talk,store);selectedTalkId="";refresh();}
                        catch(Exception e){alert("No se pudo eliminar",e.getMessage());}
                    });
            });
    }
    private void renameTalk(TalkStore.Talk talk){
        LinearLayout form=Ui.column(this,13);
        EditText name=new EditText(this);name.setSingleLine(true);
        name.setHint("Nombre de la charla");name.setText(talk.name);
        form.addView(name);
        EditText time=new EditText(this);time.setSingleLine(true);
        time.setHint("Hora (ej. 11:00)");time.setText(talk.time);
        time.setInputType(InputType.TYPE_CLASS_DATETIME|InputType.TYPE_DATETIME_VARIATION_TIME);
        form.addView(time);
        UiSheets.open(this,"Editar charla","Cambiá el nombre y la hora de esta charla.",
            form,"Cancelar","Guardar",()->{
                try{chats.rename(talk,name.getText().toString(),time.getText().toString());refresh();}
                catch(Exception e){alert("No se pudo guardar",e.getMessage());}
            });
    }
    private void showSeatOptions(LeadStore.Lead lead){
        String[] options={"Abrir derivación","Mover a otra silla","Liberar silla · Se retiró"};
        UiSheets.options(this,lead.name+" · Silla "+(lead.seatIndex+1),options,position->{
                if(position==0)openLead(lead);
                else if(position==1)showMoveDialog(lead);
                else UiSheets.confirm(this,"Liberar silla",
                    "La silla volverá a quedar libre. La ficha, descripción, impresión e historial se conservarán. Esta acción no cambia el estado en el CRM.",
                    "Cancelar","Liberar",()->{
                        try{store.unseat(lead.id);refresh();}
                        catch(Exception e){alert("No se pudo liberar",e.getMessage());}
                    });
            });
    }
    private void showMoveDialog(LeadStore.Lead lead){
        if(LeadStore.DONE.equals(lead.status)){
            openLead(lead);return;
        }
        ArrayList<String> labels=new ArrayList<>(),talkIds=new ArrayList<>();
        ArrayList<Integer> indices=new ArrayList<>();
        for(TalkStore.Talk t:talks){
            if(!t.date.equals(LeadStore.today()))continue;
            for(int seat=0;seat<TalkStore.CAPACITY;seat++){
                boolean occupied=false;
                for(LeadStore.Lead other:current)if(!other.id.equals(lead.id)&&t.id.equals(other.talkId)&&other.seatIndex==seat){
                    occupied=true;break;
                }
                if(!occupied){
                    labels.add(t.name+" · Silla "+(seat+1));
                    talkIds.add(t.id);indices.add(seat);
                }
            }
        }
        if(labels.isEmpty()){alert("Sin lugar","Creá otra charla para disponer de más sillas.");return;}
        UiSheets.options(this,"Ubicar a "+lead.name,labels.toArray(new String[0]),pos->{
            try{
                store.moveToSeat(lead.id,talkIds.get(pos),indices.get(pos));
                selectedTalkId=talkIds.get(pos);refresh();
            }catch(Exception e){alert("No se pudo mover",e.getMessage());}
        });
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=PICK_HOST)return;
        if(result!=RESULT_OK||data==null){pendingTalkId="";pendingSeat=-1;return;}
        final String talkId=pendingTalkId;final int seat=pendingSeat;
        pendingTalkId="";pendingSeat=-1;
        if(seat<0||talkId.isEmpty())return;
        try{
            String name=data.getStringExtra("leadName"),path=data.getStringExtra("crmPath");
            String phone=data.getStringExtra("leadPhone"),arrival=data.getStringExtra("arrival");
            LeadStore.Lead lead=store.placeFromHost(name,phone,arrival,path,talkId,seat);
            selectedTalkId=talkId;refresh();
            openLead(lead);
        }catch(Exception error){
            final String uuid=visitKey(data.getStringExtra("crmPath"));
            LeadStore.Lead existing=null;
            try{
                for(LeadStore.Lead lead:store.all())
                    if(lead.date.equals(LeadStore.today())&&uuid.equals(visitKey(lead.crmPath))){existing=lead;break;}
            }catch(Exception ignored){}
            if(existing!=null&&!LeadStore.DONE.equals(existing.status)){
                LeadStore.Lead found=existing;
                UiSheets.confirm(this,"Esta persona ya tiene silla",
                    "Está ubicada en otra posición. ¿Querés moverla a la silla "+(seat+1)+" de esta charla?",
                    "Conservar","Mover",()->{
                        try{store.moveToSeat(found.id,talkId,seat);selectedTalkId=talkId;refresh();openLead(found);}
                        catch(Exception err){alert("No se pudo mover",err.getMessage());}
                    });
            }else alert("No se pudo asignar",error.getMessage());
        }
    }
    private static String visitKey(String path){
        if(path==null)return "";
        java.util.regex.Matcher m=java.util.regex.Pattern.compile(
            "^/floor/visits/([a-fA-F0-9-]{36})(?:/full-test)?$").matcher(path);
        return m.matches()?m.group(1).toLowerCase(Locale.ROOT):"";
    }
}
