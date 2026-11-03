package io.laind.masduenos.tablet;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.text.Editable;
import android.text.TextWatcher;
import android.os.Handler;
import android.os.Looper;
import android.widget.AdapterView;
import android.widget.Toast;
import android.widget.ArrayAdapter;
import android.widget.AutoCompleteTextView;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.util.Arrays;

/**
 * First stage: tablet-first preparation, private PDF composition and printing.
 * The CRM is the source of truth; its final derivation stays manual until a
 * verified write integration is available.
 */
public final class MainActivity extends Activity {
    private static final int HOST_REPORT=72;
    private static final String[] PRESENTERS={"Keren Botini","Nicolas Espinosa","Nicole Laquinta",
        "Thomas Núñez","Katherine Puppo","Priscila Zajama"};
    private EditText name,phone,arrival,description,printerIp;
    private AutoCompleteTextView presenter,advisor;
    private Spinner outcome,product;
    private TextView pdfStatus,operationStatus,directoryStatus;
    private AdvisorDirectory advisorDirectory;
    private Button printDirect,printAndroid,complete;
    private File originalPdf;
    private File outputPdf;
    private boolean printAttempted=false;
    private String leadCrmPath="";
    private LeadStore store;
    private LeadStore.Lead draft;
    private final Handler autosave=new Handler(Looper.getMainLooper());
    private boolean editingReady=false,crmOpened=false,printBusy=false;
    private boolean pendingPrintDirect=false;
    private Button paperButton,markDoneButton,removeButton;
    private final LinearLayout[] stages=new LinearLayout[3];
    private final TextView[] stageTabs=new TextView[3];
    private int stage=0;
    private final Runnable delayedSave=()->saveDraft();
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.statusBars(this);
        store=new LeadStore(this);
        advisorDirectory=new AdvisorDirectory(this);
        String id=getIntent().getStringExtra("lead_id");
        try{draft=id==null?null:store.get(id);}catch(Exception error){draft=null;}
        if(draft==null){
            UiSheets.notice(this,"Abrí una persona desde el tablero.",true);
            finish();return;
        }
        LinearLayout screen=Ui.column(this,0);screen.setBackgroundColor(Color.WHITE);
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(Ui.dp(this,12),Ui.dp(this,9),Ui.dp(this,20),Ui.dp(this,9));
        TextView back=Ui.label(this,"‹",32,false);back.setGravity(Gravity.CENTER);
        back.setBackground(Ui.ripple(this,Color.WHITE,14,0));back.setContentDescription("Volver al tablero");
        back.setOnClickListener(v->onBackPressed());bar.addView(back,new LinearLayout.LayoutParams(Ui.dp(this,44),Ui.dp(this,48)));
        TextView title=Ui.label(this,"Derivación",24,true);bar.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        screen.addView(bar);
        LinearLayout progressTabs=new LinearLayout(this);
        progressTabs.setPadding(Ui.dp(this,16),0,Ui.dp(this,16),Ui.dp(this,10));
        String[] labels={"1  Datos","2  Hoja","3  Confirmar"};
        for(int i=0;i<labels.length;i++){
            final int index=i;TextView tab=Ui.label(this,labels[i],12,true);
            tab.setGravity(Gravity.CENTER);tab.setPadding(0,Ui.dp(this,12),0,Ui.dp(this,12));
            tab.setOnClickListener(v->requestStage(index));stageTabs[i]=tab;
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);if(i>0)lp.leftMargin=Ui.dp(this,6);
            progressTabs.addView(tab,lp);
        }
        screen.addView(progressTabs);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);
        LinearLayout holder=Ui.column(this,18);holder.setBackgroundColor(Color.WHITE);scroll.addView(holder);
        screen.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        NavigationShell.install(this,screen,NavigationShell.BOARD);
        for(int i=0;i<stages.length;i++){stages[i]=Ui.column(this,0);holder.addView(stages[i],new LinearLayout.LayoutParams(-1,-2));}
        LinearLayout content=stages[0];

        LinearLayout identity=new LinearLayout(this);
        identity.setOrientation(LinearLayout.VERTICAL);
        identity.setGravity(Gravity.CENTER_VERTICAL);
        identity.setBackground(Ui.bg(this,Color.rgb(247,247,247),16,Ui.LINE));
        identity.setPadding(Ui.dp(this,13),Ui.dp(this,10),Ui.dp(this,11),Ui.dp(this,10));
        LinearLayout nameRow=new LinearLayout(this);
        name=identityField(nameRow,"PERSONA · VERIFICADA EN HOST","Nombre",1f);name.setTextSize(19);
        identity.addView(nameRow,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout details=new LinearLayout(this);
        phone=identityField(details,"Teléfono","Teléfono",1.7f);
        arrival=identityField(details,"Llegó","Hora",.9f);
        identity.addView(details,Ui.spaced(this,8));
        content.addView(identity,Ui.spaced(this,11));

        section(content,"Datos de la derivación");
        presenter=autocomplete(content,"Charla de · Presentador",PRESENTERS);
        if(!draft.talkId.isEmpty()){
            TextView inherited=Ui.label(this,
                "Se completa según el presentador asignado a esta charla.",12,false);
            inherited.setTextColor(Ui.MUTED);
            content.addView(inherited,Ui.spaced(this,4));
        }
        advisor=autocomplete(content,"Derivado a · Asesor",advisorDirectory.current().names());
        directoryStatus=Ui.label(this,"Lista guardada de asesores",12,false);
        directoryStatus.setTextColor(Ui.MUTED);content.addView(directoryStatus,Ui.spaced(this,4));
        Button refreshAdvisors=Ui.button(this,"Actualizar lista de asesores",false);
        refreshAdvisors.setTextSize(12);refreshAdvisors.setMinHeight(Ui.dp(this,38));
        refreshAdvisors.setOnClickListener(v->refreshAdvisors());
        content.addView(refreshAdvisors,Ui.spaced(this,5));
        description=field(content,"Descripción · Referencia visual","Ej.: campera azul, lentes, está cerca de recepción",true);
        TextView internal=Ui.label(this,"La descripción es un dato interno de este dispositivo y de la hoja impresa. No se agrega al CRM.",12,false);
        internal.setTextColor(Ui.MUTED);content.addView(internal,Ui.spaced(this,6));

        Ui.addLabel(this,content,"¿Cómo le fue en la charla?",14);
        outcome=spinner(content,new String[]{"La vio entera","La vio entera, pero no se deriva","Se fue en medio de la charla","No se quedó"});
        Ui.addLabel(this,content,"¿Qué producto?",14);
        product=spinner(content,new String[]{"PAI","Pozo"});

        Button next=Ui.button(this,"Continuar a impresión  ›",true);
        next.setOnClickListener(v->requestStage(1));content.addView(next,Ui.spaced(this,22));
        content=stages[1];
        section(content,"Hoja de archivo");
        TextView printHelp=Ui.label(this,"El test se obtiene desde Host automáticamente al imprimir. Una hoja A4, una copia.",13,false);
        printHelp.setTextColor(Ui.MUTED);content.addView(printHelp,Ui.spaced(this,8));
        pdfStatus=Ui.label(this,"Comprobando documento original…",12,false);
        pdfStatus.setTextColor(Ui.MUTED);content.addView(pdfStatus,Ui.spaced(this,7));
        Button printerSettings=Ui.button(this,"Brother · Ajustar conexión",false);
        content.addView(printerSettings,Ui.spaced(this,9));
        LinearLayout printerPanel=Ui.column(this,5);
        printerIp=field(printerPanel,"Dirección de la Brother","192.168.2.33",false);
        printerIp.setText(getPreferences(MODE_PRIVATE).getString("printer_ip","192.168.2.33"));
        printerIp.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        printerPanel.setVisibility(View.GONE);
        content.addView(printerPanel);
        printerSettings.setOnClickListener(v->printerPanel.setVisibility(
            printerPanel.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));
        printDirect=Ui.button(this,"Imprimir directo en Brother",true);
        printDirect.setOnClickListener(v->preparePrint(true));
        content.addView(printDirect,Ui.spaced(this,14));
        printAndroid=Ui.button(this,"Imprimir con Android (respaldo)",false);
        printAndroid.setOnClickListener(v->preparePrint(false));
        content.addView(printAndroid,Ui.spaced(this,9));

        paperButton=Ui.button(this,"Ya retiré la hoja · Continuar",true);
        paperButton.setOnClickListener(v->confirmPaper());
        content.addView(paperButton,Ui.spaced(this,20));
        content=stages[2];
        section(content,"Confirmar derivación");
        TextView finalInfo=Ui.label(this,"Retirá la hoja y verificá sus datos antes de confirmar la derivación en el CRM.",13,false);
        finalInfo.setTextColor(Ui.MUTED);content.addView(finalInfo,Ui.spaced(this,8));
        complete=Ui.button(this,"Completar derivación · CRM",true);
        complete.setOnClickListener(v->confirmHandoff());
        content.addView(complete,Ui.spaced(this,9));
        markDoneButton=Ui.button(this,"Ya guardé la derivación en el CRM",false);
        markDoneButton.setOnClickListener(v->markRegistered());
        content.addView(markDoneButton,Ui.spaced(this,9));
        operationStatus=Ui.label(this,"Comprobando estado de esta persona…",12,false);
        operationStatus.setTextColor(Ui.MUTED);holder.addView(operationStatus,Ui.spaced(this,14));
        removeButton=Ui.button(this,"Quitar persona del tablero",false);
        removeButton.setOnClickListener(v->clearLead());content.addView(removeButton,Ui.spaced(this,22));
        restoreDraft();installDraftListeners();updateStatus();
        int initial=LeadStore.SENT.equals(draft.status)?1:
            (LeadStore.PAPER.equals(draft.status)||LeadStore.DONE.equals(draft.status)?2:0);
        showStage(saved==null?initial:saved.getInt("editor_stage",initial));
    }
    private void requestStage(int index){
        if(index==1&&!LeadStore.DONE.equals(draft.status)&&!validate())return;
        if(index==2&&!LeadStore.PAPER.equals(draft.status)&&!LeadStore.DONE.equals(draft.status)){
            UiSheets.notice(this,"Primero imprimí y confirmá que retiraste la hoja.",false);return;
        }
        saveDraft();showStage(index);
    }
    private void showStage(int index){
        stage=Math.max(0,Math.min(2,index));
        for(int i=0;i<stages.length;i++){
            stages[i].setVisibility(i==stage?View.VISIBLE:View.GONE);
            stageTabs[i].setBackground(Ui.ripple(this,i==stage?Color.rgb(253,239,237):Color.rgb(247,247,248),12,0));
            stageTabs[i].setTextColor(i==stage?Ui.RED:Ui.MUTED);stageTabs[i].setSelected(i==stage);
        }
    }
    @Override protected void onSaveInstanceState(Bundle state){
        state.putInt("editor_stage",stage);super.onSaveInstanceState(state);
    }
    @Override public void onBackPressed(){
        if(stage>0){showStage(stage-1);return;}
        saveDraft();super.onBackPressed();
    }
    @Override protected void onResume(){
        super.onResume();
        if(advisor!=null)refreshAdvisors();
    }
    private void refreshAdvisors(){
        directoryStatus.setText("Actualizando asesores…");
        advisorDirectory.refresh((data,online)->{
            if(isFinishing()||isDestroyed())return;
            advisor.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_dropdown_item_1line,data.names()));
            // Correct only drafts that have no issued sheet. Never rewrite history
            // or silently change the advisor the operator has already selected.
            if(LeadStore.NEW.equals(draft.status)||LeadStore.READY.equals(draft.status)){
                String before=value(advisor),corrected=data.canonical(before);
                if(!before.equals(corrected))advisor.setText(corrected,false);
            }
            directoryStatus.setText(online?"Asesores actualizados":"Sin conexión · se usa la lista guardada");
        });
    }
    private void section(LinearLayout content,String title){
        TextView item=Ui.label(this,title,13,true);item.setTextColor(Ui.RED);
        content.addView(item,Ui.spaced(this,19));
        View line=new View(this);line.setBackgroundColor(Ui.LINE);
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,Ui.dp(this,1));lp.topMargin=Ui.dp(this,7);
        content.addView(line,lp);
    }
    private EditText identityField(LinearLayout row,String label,String hint,float weight){
        LinearLayout cell=new LinearLayout(this);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setPadding(Ui.dp(this,5),0,Ui.dp(this,5),0);
        TextView caption=Ui.label(this,label,11,true);
        caption.setTextColor(Ui.MUTED);
        cell.addView(caption);
        EditText value=new EditText(this);
        value.setSingleLine(true);value.setTextSize(14);
        value.setTextColor(Ui.INK);value.setHint(hint);
        value.setBackground(null);value.setPadding(0,Ui.dp(this,4),0,0);
        value.setKeyListener(null);
        value.setFocusable(false);value.setClickable(false);
        value.setEllipsize(android.text.TextUtils.TruncateAt.END);
        cell.addView(value,new LinearLayout.LayoutParams(-1,-2));
        row.addView(cell,new LinearLayout.LayoutParams(0,-2,weight));
        return value;
    }
    private EditText field(LinearLayout target,String label,String hint,boolean longText){
        Ui.addLabel(this,target,label,14);
        EditText input=new EditText(this);
        input.setTextSize(16);input.setTextColor(Ui.INK);input.setHint(hint);
        input.setBackground(Ui.bg(this,Color.WHITE,13,Ui.LINE));
        input.setPadding(Ui.dp(this,14),Ui.dp(this,11),Ui.dp(this,14),Ui.dp(this,11));
        if(longText){input.setMinLines(2);input.setMaxLines(3);input.setGravity(Gravity.TOP);}
        else input.setSingleLine(true);
        target.addView(input,Ui.spaced(this,7));return input;
    }
    private AutoCompleteTextView autocomplete(LinearLayout target,String label,String[] values){
        Ui.addLabel(this,target,label,14);
        AutoCompleteTextView input=new AutoCompleteTextView(this);
        input.setSingleLine(true);input.setTextSize(16);input.setHint("Buscar o escribir nombre");
        input.setTextColor(Ui.INK);input.setThreshold(1);
        input.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_dropdown_item_1line,values));
        input.setBackground(Ui.bg(this,Color.WHITE,13,Ui.LINE));
        input.setPadding(Ui.dp(this,14),Ui.dp(this,12),Ui.dp(this,14),Ui.dp(this,12));
        target.addView(input,Ui.spaced(this,7));return input;
    }
    private Spinner spinner(LinearLayout target,String[] values){
        Spinner input=new Spinner(this);
        input.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,values));
        target.addView(input,Ui.spaced(this,8));return input;
    }
    private String value(EditText e){return e.getText().toString().trim();}
    private boolean validate(){
        if(value(name).length()<2){name.setError("Elegí un lead del día.");name.requestFocus();return false;}
        if(value(presenter).length()<3){presenter.setError("Elegí quién dio la charla.");presenter.requestFocus();return false;}
        if(value(advisor).length()<3){advisor.setError("Elegí el asesor.");advisor.requestFocus();return false;}
        if(value(description).isEmpty()){description.setError("Ingresá una referencia visual.");description.requestFocus();return false;}
        return true;
    }
    private void restoreDraft(){
        editingReady=false;
        name.setText(draft.name);phone.setText(draft.phone);arrival.setText(draft.arrival);
        String talkPresenter="";
        if(!draft.talkId.isEmpty()){
            try{
                for(TalkStore.Talk talk:new TalkStore(this).all()){
                    if(draft.talkId.equals(talk.id)){
                        talkPresenter=talk.presenter;break;
                    }
                }
            }catch(Exception ignored){}
        }
        if(!talkPresenter.isEmpty())draft.presenter=talkPresenter;
        presenter.setText(draft.presenter,false);advisor.setText(draft.advisor,false);
        description.setText(draft.description);
        for(int i=0;i<outcome.getCount();i++)if(draft.outcome.equals(outcome.getItemAtPosition(i)))outcome.setSelection(i);
        for(int i=0;i<product.getCount();i++)if(draft.product.equals(product.getItemAtPosition(i)))product.setSelection(i);
        originalPdf=store.sourceFile(draft);
        outputPdf=store.archiveFile(draft);
        printAttempted=LeadStore.SENT.equals(draft.status)||LeadStore.PAPER.equals(draft.status)
            ||LeadStore.DONE.equals(draft.status);
        pdfStatus.setText(originalPdf.isFile()?"Full-test capturado desde Host · "+(originalPdf.length()/1024)+" KB":
            "El Full-test se capturará automáticamente cuando elijas imprimir.");
        boolean locked=LeadStore.DONE.equals(draft.status);
        presenter.setEnabled(!locked&&draft.talkId.isEmpty());
        advisor.setEnabled(!locked);description.setEnabled(!locked);
        outcome.setEnabled(!locked);product.setEnabled(!locked);
        editingReady=true;
    }
    private void installDraftListeners(){
        TextWatcher watcher=new TextWatcher(){
            public void beforeTextChanged(CharSequence text,int start,int count,int after){}
            public void onTextChanged(CharSequence text,int start,int before,int count){changed();}
            public void afterTextChanged(Editable text){}
        };
        presenter.addTextChangedListener(watcher);
        advisor.addTextChangedListener(watcher);
        description.addTextChangedListener(watcher);
        AdapterView.OnItemSelectedListener selector=new AdapterView.OnItemSelectedListener(){
            public void onItemSelected(AdapterView<?> parent,View view,int pos,long id){changed();}
            public void onNothingSelected(AdapterView<?> parent){}
        };
        outcome.setOnItemSelectedListener(selector);product.setOnItemSelectedListener(selector);
    }
    private void changed(){
        if(!editingReady||LeadStore.DONE.equals(draft.status))return;
        draft.status=prepared()?LeadStore.READY:LeadStore.NEW;
        printAttempted=false;crmOpened=false;
        autosave.removeCallbacks(delayedSave);autosave.postDelayed(delayedSave,350);
        updateStatus();
    }
    private boolean prepared(){
        return value(presenter).length()>=3&&value(advisor).length()>=3
            &&!value(description).isEmpty();
    }
    private void saveDraft(){
        if(!editingReady||draft==null)return;
        draft.presenter=value(presenter);draft.advisor=value(advisor);
        // LeadStore.save enforces the presenter's talk assignment once more.
        // This remains editable only for legacy unseated leads.
        draft.description=value(description);
        draft.outcome=String.valueOf(outcome.getSelectedItem());
        draft.product=String.valueOf(product.getSelectedItem());
        try{store.save(draft);}
        catch(Exception error){UiSheets.notice(this,"No se guardaron los cambios de esta persona.",true);}
    }
    @Override protected void onPause(){
        autosave.removeCallbacks(delayedSave);saveDraft();super.onPause();
    }
    private void updateStatus(){
        if(draft==null)return;
        boolean done=LeadStore.DONE.equals(draft.status);
        boolean sent=LeadStore.SENT.equals(draft.status);
        boolean verified=LeadStore.PAPER.equals(draft.status);
        boolean validPdf=originalPdf!=null&&originalPdf.isFile();
        printDirect.setEnabled(!done&&!printBusy);
        printAndroid.setEnabled(!done&&!printBusy);
        printDirect.setText(validPdf?"Imprimir directo en Brother":"Obtener test e imprimir en Brother");
        printAndroid.setText(validPdf?"Imprimir con Android (respaldo)":"Obtener test e imprimir con Android");
        paperButton.setVisibility(sent?View.VISIBLE:View.GONE);
        complete.setEnabled(verified);
        complete.setAlpha(verified?1f:.45f);
        markDoneButton.setVisibility(verified&&crmOpened?View.VISIBLE:View.GONE);
        if(done)operationStatus.setText("Registrada según tu confirmación. La app no consulta el estado del CRM.");
        else if(verified)operationStatus.setText("Hoja verificada. Continuá en el CRM de Enrutador; el guardado oficial es manual.");
        else if(sent)operationStatus.setText("Trabajo enviado a impresión. Confirmá que retiraste la hoja antes de derivar.");
        else operationStatus.setText(prepared()?"Preparación lista: verificá los datos e imprimí la hoja de archivo."
            :"Completá presentador, asesor y descripción. Podés abrir otros leads desde el tablero sin perder esta ficha.");
    }
    private void invalidatePrint(){
        printAttempted=false;crmOpened=false;
        if(!LeadStore.DONE.equals(draft.status))draft.status=prepared()?LeadStore.READY:LeadStore.NEW;
        updateStatus();
    }
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=HOST_REPORT||result!=RESULT_OK||data==null)return;
        try{
            String raw=data.getStringExtra("pdfPath");
            String linkedPath=data.getStringExtra("crmPath");
            if(raw==null||!draft.crmPath.equals(linkedPath))
                throw new java.io.IOException("El Full-test devuelto no corresponde a este lead.");
            File file=new File(raw);
            String root=getCacheDir().getCanonicalPath()+File.separator;
            if(!file.getCanonicalPath().startsWith(root))
                throw new java.io.IOException("El archivo no pertenece a la sesión local.");
            store.attachPdf(draft.id,file);
            draft=store.get(draft.id);
            originalPdf=store.sourceFile(draft);
            outputPdf=store.archiveFile(draft);
            pdfStatus.setText("Full-test original obtenido de Host · "+(originalPdf.length()/1024)+" KB");
            updateStatus();
            preparePrint(pendingPrintDirect);
        }catch(Exception e){
            pdfStatus.setText("No se pudo obtener el PDF del CRM. Volvé a intentar la impresión.");
            updateStatus();
        }
    }
    private void preparePrint(boolean direct){
        if(!validate())return;
        if(originalPdf==null||!originalPdf.isFile()){
            // The report is fetched only when needed. Go directly to the
            // selected CRM visit; never require another lead search.
            pendingPrintDirect=direct;
            saveDraft();
            Intent capture=new Intent(this,HostActivity.class);
            capture.putExtra("crmPath",draft.crmPath);
            capture.putExtra("expectedName",draft.name);
            startActivityForResult(capture,HOST_REPORT);
            pdfStatus.setText("Obteniendo Full-test de esta persona desde Host…");
            return;
        }
        if(direct&&!PrintController.isPrivateIPv4(value(printerIp))){
            printerIp.setError("La IP debe estar en la red local.");return;
        }
        doPrint(direct);
    }
    private void doPrint(boolean direct){
        try{
            outputPdf=PdfComposer.compose(originalPdf,store.archiveFile(draft),
                value(presenter),value(advisor),value(description));
            saveDraft();
            // Never send an unreviewed new layout to the salon printer.
            previewBeforePrinting(direct);
        }catch(Exception error){
            operationStatus.setText("No se pudo preparar la hoja: "+error.getMessage());
            invalidatePrint();
        }
    }
    private void previewBeforePrinting(boolean direct) throws Exception {
        android.graphics.Bitmap bitmap;
        try(android.os.ParcelFileDescriptor fd=android.os.ParcelFileDescriptor.open(
                outputPdf,android.os.ParcelFileDescriptor.MODE_READ_ONLY);
            android.graphics.pdf.PdfRenderer renderer=new android.graphics.pdf.PdfRenderer(fd)){
            if(renderer.getPageCount()!=1)
                throw new java.io.IOException("El archivo final no tiene una única hoja A4.");
            try(android.graphics.pdf.PdfRenderer.Page page=renderer.openPage(0)){
                bitmap=android.graphics.Bitmap.createBitmap(page.getWidth()*2,
                    page.getHeight()*2,android.graphics.Bitmap.Config.ARGB_8888);
                bitmap.eraseColor(android.graphics.Color.WHITE);
                page.render(bitmap,null,null,android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            }
        }
        android.widget.ImageView image=new android.widget.ImageView(this);
        image.setImageBitmap(bitmap);
        image.setAdjustViewBounds(true);
        image.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
        image.setContentDescription("Vista previa de la hoja A4 con ambas páginas del Full-test");
        android.widget.ScrollView scroll=new android.widget.ScrollView(this);
        int pad=Ui.dp(this,8);
        scroll.setPadding(pad,pad,pad,pad);
        scroll.addView(image,new android.widget.ScrollView.LayoutParams(-1,-2));
        final android.app.Dialog confirm=UiSheets.open(this,"Vista previa · A4",
            "Revisá que ambas páginas estén completas y legibles. Se enviará una sola hoja.",
            scroll,"Cancelar","Imprimir 1 hoja",()->sendPreparedPrint(direct));
        if(confirm!=null)confirm.setOnDismissListener(d->bitmap.recycle());
        else bitmap.recycle();
    }
    private void sendPreparedPrint(boolean direct){
        if(outputPdf==null||!outputPdf.isFile())return;
        if(direct){
            String ip=value(printerIp);
            getPreferences(MODE_PRIVATE).edit().putString("printer_ip",ip).apply();
            printBusy=true;updateStatus();
            operationStatus.setText("Enviando una copia a la Brother "+ip+"…");
            PrintController.direct(ip,outputPdf,result->runOnUiThread(()->{
                printBusy=false;
                if(result.ok){
                    printAttempted=true;draft.status=LeadStore.SENT;saveDraft();
                }else{
                    draft.status=LeadStore.READY;printAttempted=false;saveDraft();
                }
                updateStatus();
                operationStatus.setText(result.message+"\\nEl CRM todavía no registra una derivación.");
            }));
        }else{
            try{
                PrintController.androidPrint(this,outputPdf);
                printAttempted=true;draft.status=LeadStore.SENT;saveDraft();updateStatus();
                operationStatus.setText("Se abrió el diálogo de impresión Android. Confirmá la hoja solamente si salió físicamente.");
            }catch(Exception e){operationStatus.setText("No se pudo abrir la impresión: "+e.getMessage());}
        }
    }
    private void confirmPaper(){
        if(!LeadStore.SENT.equals(draft.status))return;
        draft.status=LeadStore.PAPER;saveDraft();updateStatus();showStage(2);
    }
    private void confirmHandoff(){
        if(!LeadStore.PAPER.equals(draft.status)||outputPdf==null)return;
        UiSheets.confirm(this,"Confirmar datos",
            "Persona: "+value(name)+"\nCharla de: "+value(presenter)+"\nAsesor: "+value(advisor)+
                "\nResultado: "+outcome.getSelectedItem()+" · "+product.getSelectedItem()+
                "\n\nSe abrirá el CRM de Enrutador para registrar la derivación oficialmente.",
            "Revisar","Abrir CRM",()->{
                crmOpened=true;
                Intent next=new Intent(this,RouterActivity.class);
                next.putExtra("crmPath",draft.crmPath);next.putExtra("lead_id",draft.id);
                NavigationShell.open(this,next);
                finish();
            });
    }
    private void markRegistered(){
        if(!LeadStore.PAPER.equals(draft.status)||!crmOpened)return;
        UiSheets.confirm(this,"¿Registrada en el CRM?",
            "Confirmá solo cuando hayas guardado la derivación en Liniers. La tarjeta cambiará su estado local; no registra automáticamente en el CRM.",
            "Todavía no","Sí, registrada",()->{
                draft.status=LeadStore.DONE;saveDraft();restoreDraft();updateStatus();
                UiSheets.notice(this,"Derivación marcada como registrada.",false);
            });
    }
    private void clearLead(){
        UiSheets.confirm(this,"Quitar del tablero",
            "Se borrará el borrador y el PDF privado del dispositivo. El CRM original no se modificará.",
            "Cancelar","Quitar",()->{
                autosave.removeCallbacks(delayedSave);editingReady=false;
                try{store.remove(draft.id);finish();}
                catch(Exception error){UiSheets.notice(this,"No se pudo quitar el registro.",true);}
            });
    }
}
