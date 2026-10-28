package io.laind.masduenos.tablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.File;
import java.util.ArrayList;
import java.util.Locale;

/** The tablet's primary workspace: a local board, not a duplicate CRM.
 * Each user-selected lead comes from the authorized Host Atendidas list.
 * No fictional or stale "live CRM" counters are displayed.
 */
public final class DashboardActivity extends Activity {
    private static final int PICK_HOST=111;
    private static final String[] FILTERS={"Todos","En gestión","Por imprimir","Por confirmar","Registrados"};
    private final ArrayList<LeadStore.Lead> current=new ArrayList<>();
    private LeadStore store;
    private LinearLayout list,filterBar;
    private TextView countMain,countPrint,countPending,empty;
    private EditText search;
    private String filter=FILTERS[0];
    private boolean showHistory=false;
    private TextView historyToggle;
    private boolean initialized=false;

    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.statusBars(this);
        store=new LeadStore(this);
        LinearLayout root=new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.WHITE);
        root.setPadding(Ui.dp(this,18),Ui.dp(this,12),Ui.dp(this,18),0);
        setContentView(root);
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand=Ui.label(this,"Control Enrutador",25,true);header.addView(brand,new LinearLayout.LayoutParams(0,-2,1));
        TextView label=Ui.label(this,"LINIERS · TAB A8",11,true);label.setTextColor(Ui.RED);header.addView(label);
        root.addView(header,Ui.spaced(this,6));
        TextView subtitle=Ui.label(this,"Personas de hoy · Gestión local de tu charla",13,false);
        subtitle.setTextColor(Ui.MUTED);root.addView(subtitle,Ui.spaced(this,7));
        LinearLayout actions=new LinearLayout(this);
        Button add=Ui.button(this,"+ Buscar en Atendidas",true);
        add.setOnClickListener(v->startActivityForResult(new Intent(this,HostLookupActivity.class),PICK_HOST));
        actions.addView(add,new LinearLayout.LayoutParams(0,Ui.dp(this,49),1));
        Button router=Ui.button(this,"CRM Enrutador",false);
        router.setOnClickListener(v->startActivity(new Intent(this,RouterActivity.class)));
        LinearLayout.LayoutParams routerParams=new LinearLayout.LayoutParams(0,Ui.dp(this,49),1);
        routerParams.leftMargin=Ui.dp(this,8);actions.addView(router,routerParams);
        root.addView(actions,Ui.spaced(this,15));

        LinearLayout metrics=new LinearLayout(this);
        countMain=metric(metrics,"En gestión");
        countPrint=metric(metrics,"Por imprimir");
        countPending=metric(metrics,"Por confirmar");
        root.addView(metrics,Ui.spaced(this,16));

        search=new EditText(this);
        search.setSingleLine(true);search.setTextSize(15);
        search.setHint("Buscar nombre, referencia, asesor…");
        search.setBackground(Ui.bg(this,Color.WHITE,14,Ui.LINE));
        search.setPadding(Ui.dp(this,15),Ui.dp(this,12),Ui.dp(this,15),Ui.dp(this,12));
        root.addView(search,Ui.spaced(this,16));
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence s,int start,int count,int after){}
            public void onTextChanged(CharSequence s,int start,int before,int count){draw();}
            public void afterTextChanged(Editable e){}
        });
        HorizontalScrollView horizontal=new HorizontalScrollView(this);
        horizontal.setHorizontalScrollBarEnabled(false);horizontal.setFillViewport(false);
        filterBar=new LinearLayout(this);filterBar.setOrientation(LinearLayout.HORIZONTAL);
        horizontal.addView(filterBar);root.addView(horizontal,Ui.spaced(this,12));

        ScrollView scroller=new ScrollView(this);
        scroller.setFillViewport(true);
        list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);
        scroller.addView(list,new ScrollView.LayoutParams(-1,-2));
        root.addView(scroller,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout footer=new LinearLayout(this);
        footer.setGravity(Gravity.CENTER_VERTICAL);
        historyToggle=Ui.label(this,"Ver días anteriores",13,false);
        historyToggle.setTextColor(Ui.MUTED);
        historyToggle.setOnClickListener(v->{showHistory=!showHistory;historyToggle.setText(showHistory?"Mostrar solo hoy":"Ver días anteriores");refresh();});
        footer.addView(historyToggle,new LinearLayout.LayoutParams(0,-2,1));
        TextView note=Ui.label(this,"CRM oficial sin modificaciones",11,false);
        note.setTextColor(Ui.MUTED);footer.addView(note);
        root.addView(footer,Ui.spaced(this,8));footer.setPadding(0,Ui.dp(this,5),0,Ui.dp(this,16));
        initialized=true;refresh();
    }
    private TextView metric(LinearLayout metrics,String label){
        LinearLayout tile=Ui.column(this,10);
        tile.setBackground(Ui.bg(this,Color.rgb(249,249,249),14,Ui.LINE));
        TextView num=Ui.label(this,"0",24,true);tile.addView(num);
        TextView caption=Ui.label(this,label,11,false);caption.setTextColor(Ui.MUTED);
        tile.addView(caption,Ui.spaced(this,2));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,Ui.dp(this,78),1);
        if(metrics.getChildCount()>0)p.leftMargin=Ui.dp(this,8);
        metrics.addView(tile,p);return num;
    }
    private void refresh(){
        if(!initialized)return;
        try{
            current.clear();
            for(LeadStore.Lead lead:store.all()){
                if(showHistory||LeadStore.today().equals(lead.date))current.add(lead);
            }
            draw();
        }catch(Exception e){
            Toast.makeText(this,"No se pudo abrir el tablero cifrado. No se modificaron los datos.",Toast.LENGTH_LONG).show();
        }
    }
    @Override protected void onResume(){super.onResume();refresh();}
    private void draw(){
        if(!initialized)return;
        int management=0,printing=0,pending=0;
        for(LeadStore.Lead lead:current){
            if(!LeadStore.DONE.equals(lead.status))management++;
            if(lead.prepared()&&!LeadStore.PAPER.equals(lead.status)&&!LeadStore.DONE.equals(lead.status))printing++;
            if(LeadStore.SENT.equals(lead.status)||LeadStore.PAPER.equals(lead.status))pending++;
        }
        countMain.setText(String.valueOf(management));countPrint.setText(String.valueOf(printing));
        countPending.setText(String.valueOf(pending));
        filterBar.removeAllViews();
        for(String item:FILTERS){
            TextView tab=Ui.label(this,item,13,item.equals(filter));
            tab.setPadding(Ui.dp(this,13),Ui.dp(this,11),Ui.dp(this,13),Ui.dp(this,11));
            tab.setBackground(Ui.bg(this,item.equals(filter)?Color.rgb(251,235,234):Color.WHITE,18,
                item.equals(filter)?Ui.RED:Ui.LINE));
            if(item.equals(filter))tab.setTextColor(Ui.RED);else tab.setTextColor(Ui.MUTED);
            tab.setOnClickListener(v->{filter=item;draw();});
            LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-2,-2);p.rightMargin=Ui.dp(this,8);
            filterBar.addView(tab,p);
        }
        list.removeAllViews();
        ArrayList<LeadStore.Lead> visible=new ArrayList<>();
        String q=search.getText().toString().trim().toLowerCase(Locale.ROOT);
        for(LeadStore.Lead lead:current){
            if(!matchesFilter(lead))continue;
            String haystack=(lead.name+" "+lead.phone+" "+lead.description+" "+lead.presenter+" "+lead.advisor+" "+lead.arrival)
                .toLowerCase(Locale.ROOT);
            if(!q.isEmpty()&&!haystack.contains(q))continue;
            visible.add(lead);
        }
        TextView heading=Ui.label(this,"Personas en gestión · "+visible.size(),16,true);
        list.addView(heading,Ui.spaced(this,19));
        if(visible.isEmpty()){
            LinearLayout blank=Ui.column(this,22);
            blank.setBackground(Ui.bg(this,Color.rgb(250,250,250),18,Ui.LINE));
            TextView title=Ui.label(this,current.isEmpty()?"Todavía no hay personas en tu tablero":"No hay resultados",18,true);
            blank.addView(title);
            TextView detail=Ui.label(this,current.isEmpty()
                ?"Buscá una persona en Atendidas desde la tablet. No necesitás abrir ni imprimir su Full-test para agregarla."
                :"Probá otro filtro o buscá por nombre, descripción, horario o asesor.",14,false);
            detail.setTextColor(Ui.MUTED);blank.addView(detail,Ui.spaced(this,10));
            list.addView(blank,Ui.spaced(this,14));return;
        }
        boolean twoColumns=getResources().getConfiguration().orientation==android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        for(int i=0;i<visible.size();i+=(twoColumns?2:1)){
            LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);
            int finish=Math.min(visible.size(),i+(twoColumns?2:1));
            for(int j=i;j<finish;j++){
                LinearLayout tile=card(visible.get(j));
                LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);
                if(j>i)lp.leftMargin=Ui.dp(this,11);
                row.addView(tile,lp);
            }
            if(twoColumns&&finish-i==1){
                View filler=new View(this);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,1,1);
                lp.leftMargin=Ui.dp(this,11);row.addView(filler,lp);
            }
            list.addView(row,Ui.spaced(this,11));
        }
        View padding=new View(this);list.addView(padding,new LinearLayout.LayoutParams(-1,Ui.dp(this,14)));
    }
    private boolean matchesFilter(LeadStore.Lead lead){
        if(filter.equals("En gestión"))return !LeadStore.DONE.equals(lead.status);
        if(filter.equals("Por imprimir"))return lead.prepared()&&!LeadStore.PAPER.equals(lead.status)&&!LeadStore.DONE.equals(lead.status);
        if(filter.equals("Por confirmar"))return LeadStore.SENT.equals(lead.status)||LeadStore.PAPER.equals(lead.status);
        if(filter.equals("Registrados"))return LeadStore.DONE.equals(lead.status);
        return true;
    }
    private LinearLayout card(LeadStore.Lead lead){
        LinearLayout card=Ui.column(this,16);
        card.setBackground(Ui.bg(this,Color.WHITE,18,Ui.LINE));
        card.setMinimumHeight(Ui.dp(this,145));
        LinearLayout first=new LinearLayout(this);
        first.setGravity(Gravity.CENTER_VERTICAL);
        TextView name=Ui.label(this,lead.name,17,true);name.setMaxLines(2);
        first.addView(name,new LinearLayout.LayoutParams(0,-2,1));
        TextView label=Ui.label(this,lead.label(),11,true);
        boolean complete=LeadStore.DONE.equals(lead.status);
        label.setTextColor(complete?Color.rgb(22,121,78):Ui.RED);
        label.setBackground(Ui.bg(this,complete?Color.rgb(234,248,240):Color.rgb(253,238,236),12,0));
        label.setPadding(Ui.dp(this,9),Ui.dp(this,7),Ui.dp(this,9),Ui.dp(this,7));
        first.addView(label);card.addView(first);
        String secondary="Llegó "+(lead.arrival.isEmpty()?"—":lead.arrival);
        if(!lead.description.trim().isEmpty())secondary+="  ·  "+lead.description.trim();
        TextView reference=Ui.label(this,secondary,13,false);reference.setMaxLines(2);
        reference.setTextColor(Ui.MUTED);card.addView(reference,Ui.spaced(this,11));
        TextView advisors=Ui.label(this,
            "Charla: "+(lead.presenter.isEmpty()?"Pendiente":lead.presenter)
             +"   ·   Asesor: "+(lead.advisor.isEmpty()?"Pendiente":lead.advisor),12,false);
        advisors.setMaxLines(2);card.addView(advisors,Ui.spaced(this,10));
        TextView action=Ui.label(this,complete?"Ver registro →":"Abrir gestión →",13,true);
        action.setTextColor(Ui.RED);card.addView(action,Ui.spaced(this,12));
        card.setOnClickListener(v->{
            Intent next=new Intent(this,MainActivity.class);
            next.putExtra("lead_id",lead.id);
            startActivity(next);
        });
        return card;
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=PICK_HOST||result!=RESULT_OK||data==null)return;
        try{
            String name=data.getStringExtra("leadName"),path=data.getStringExtra("crmPath");
            String phone=data.getStringExtra("leadPhone"),arrival=data.getStringExtra("arrival");
            LeadStore.Lead lead=store.addFromHostMetadata(name,phone,arrival,path);
            Intent editor=new Intent(this,MainActivity.class);editor.putExtra("lead_id",lead.id);startActivity(editor);
        }catch(Exception error){
            new AlertDialog.Builder(this).setTitle("No se pudo agregar el lead")
                .setMessage("No se pudo incorporar la ficha. Revisá que corresponda a Atendidas de hoy.")
                .setPositiveButton("Entendido",(d,w)->{}).show();
        }
    }
}
