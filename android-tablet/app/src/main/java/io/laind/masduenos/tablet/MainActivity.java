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
    private static final int HOST_PICK=51;
    private static final String[] PRESENTERS={"Keren Botini","Nicolas Espinosa","Nicole Laquinta",
        "Thomas Núñez","Katherine Puppo","Priscila Zajama"};
    private static final String[] ADVISORS={"Nadia Abregu","Nicolás Artaza","Zair Baltazar",
        "Milagros Bonacciet","Nicolás Calvino","Federico Correa","Agustín Cristaldo",
        "Matias Fernandez","Diana Florenti","Patricio Galeano","Belén Balvan",
        "Matías Gómez","Camila González","Eliana González","Ivon Guzmán",
        "Samuel Lee","Milena Lezcano","Gabriel Molina","Marina Mendoza",
        "Pablo Moreira","Thomas Núñez","Sebastian Paglia","Maria Palenque",
        "Nuria Pereyra","Tamara Pereyra","Jackeline Pernambuco","Matias Picallo",
        "Rocio Urrea","Milena Zorondo"};
    private EditText name,phone,arrival,description,printerIp;
    private AutoCompleteTextView presenter,advisor;
    private Spinner outcome,product;
    private TextView pdfStatus,operationStatus;
    private Button printDirect,printAndroid,complete;
    private File originalPdf;
    private File outputPdf;
    private boolean printAttempted=false;
    private String leadCrmPath="";
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);Ui.statusBars(this);
        ScrollView scroll=new ScrollView(this);
        LinearLayout content=Ui.column(this,20);content.setBackgroundColor(Color.WHITE);
        scroll.setFillViewport(true);
        scroll.addView(content);setContentView(scroll);

        TextView eyebrow=Ui.label(this,"MÁS DUEÑOS · LINIERS",12,true);
        eyebrow.setTextColor(Ui.RED);content.addView(eyebrow);
        TextView title=Ui.label(this,"Control Enrutador",28,true);content.addView(title,Ui.spaced(this,5));
        TextView subtitle=Ui.label(this,"Tablet de Salón · Buscar, preparar, imprimir y confirmar.",14,false);
        subtitle.setTextColor(Ui.MUTED);content.addView(subtitle,Ui.spaced(this,7));

        section(content,"01  BUSCAR PERSONA");
        TextView intro=Ui.label(this,"Desde Atendidas elegí el lead del día. La app leerá su ficha y capturará el PDF original en la misma sesión de Host.",13,false);
        intro.setTextColor(Ui.MUTED);content.addView(intro,Ui.spaced(this,8));
        Button openHost=Ui.button(this,"Buscar lead y obtener Full-test",false);
        openHost.setOnClickListener(v->startActivityForResult(new Intent(this,HostActivity.class),HOST_PICK));
        content.addView(openHost,Ui.spaced(this,12));
        name=field(content,"Nombre de la persona","Nombre del lead",false);
        phone=field(content,"Teléfono para verificar identidad","Número visible en la ficha",false);
        phone.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        arrival=field(content,"Hora de llegada","Ej.: 11:06",false);

        section(content,"02  PREPARAR DERIVACIÓN");
        presenter=autocomplete(content,"Charla de · Presentador",PRESENTERS);
        advisor=autocomplete(content,"Derivado a · Asesor",ADVISORS);
        description=field(content,"Descripción · Referencia visual","Ej.: campera azul, lentes, está cerca de recepción",true);
        TextView internal=Ui.label(this,"La descripción es un dato interno de esta tablet y de la hoja impresa. No se agrega al CRM.",12,false);
        internal.setTextColor(Ui.MUTED);content.addView(internal,Ui.spaced(this,6));

        Ui.addLabel(this,content,"¿Cómo le fue en la charla?",14);
        outcome=spinner(content,new String[]{"La vio entera","La vio entera, pero no se deriva","Se fue en medio de la charla","No se quedó"});
        Ui.addLabel(this,content,"¿Qué producto?",14);
        product=spinner(content,new String[]{"PAI","Pozo"});

        section(content,"03  HOJA DE ARCHIVO · IMPRESIÓN");
        TextView printHelp=Ui.label(this,"El PDF se obtiene directamente del botón «Imprimir el Full-Test» del CRM. Conservamos ambas páginas en una hoja A4 y añadimos tus tres referencias.",13,false);
        printHelp.setTextColor(Ui.MUTED);content.addView(printHelp,Ui.spaced(this,8));
        pdfStatus=Ui.label(this,"Abrí un lead de Atendidas para cargar su test automáticamente.",12,false);
        pdfStatus.setTextColor(Ui.MUTED);content.addView(pdfStatus,Ui.spaced(this,7));
        printerIp=field(content,"IP de la Brother en la red Más Dueños","192.168.2.33",false);
        printerIp.setText(getPreferences(MODE_PRIVATE).getString("printer_ip","192.168.2.33"));
        printerIp.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        printDirect=Ui.button(this,"Imprimir directo en Brother",true);
        printDirect.setOnClickListener(v->preparePrint(true));
        content.addView(printDirect,Ui.spaced(this,14));
        printAndroid=Ui.button(this,"Imprimir con Android (respaldo)",false);
        printAndroid.setOnClickListener(v->preparePrint(false));
        content.addView(printAndroid,Ui.spaced(this,9));

        section(content,"04  COMPLETAR DERIVACIÓN");
        TextView finalInfo=Ui.label(this,"Primero verificá que haya salido la hoja. Luego entrá con tu PIN de Enrutador para registrar la operación definitiva.",13,false);
        finalInfo.setTextColor(Ui.MUTED);content.addView(finalInfo,Ui.spaced(this,8));
        complete=Ui.button(this,"Completar derivación · CRM",true);
        complete.setEnabled(false);
        complete.setAlpha(.45f);
        complete.setOnClickListener(v->confirmHandoff());
        content.addView(complete,Ui.spaced(this,12));
        operationStatus=Ui.label(this,"Pendiente: seleccionar persona, preparar e imprimir.",12,false);
        operationStatus.setTextColor(Ui.MUTED);content.addView(operationStatus,Ui.spaced(this,9));
        Button reset=Ui.button(this,"Nueva persona · limpiar formulario",false);
        reset.setOnClickListener(v->clearLead());content.addView(reset,Ui.spaced(this,20));
    }
    private void section(LinearLayout content,String title){
        TextView item=Ui.label(this,title,13,true);item.setTextColor(Ui.RED);
        content.addView(item,Ui.spaced(this,27));
        View line=new View(this);line.setBackgroundColor(Ui.LINE);
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,Ui.dp(this,1));lp.topMargin=Ui.dp(this,7);
        content.addView(line,lp);
    }
    private EditText field(LinearLayout target,String label,String hint,boolean longText){
        Ui.addLabel(this,target,label,14);
        EditText input=new EditText(this);
        input.setTextSize(16);input.setTextColor(Ui.INK);input.setHint(hint);
        input.setBackground(Ui.bg(this,Color.WHITE,13,Ui.LINE));
        input.setPadding(Ui.dp(this,14),Ui.dp(this,11),Ui.dp(this,14),Ui.dp(this,11));
        if(longText){input.setMinLines(3);input.setMaxLines(4);input.setGravity(Gravity.TOP);}
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
    @Override protected void onActivityResult(int request,int result,Intent data){
        super.onActivityResult(request,result,data);
        if(request!=HOST_PICK||result!=RESULT_OK||data==null)return;
        final String localPath=data.getStringExtra("pdfPath");
        final File candidate=localPath==null?null:new File(localPath);
        try{
            // Only a private PDF captured by our Host activity may be opened.
            final String privateDir=getCacheDir().getCanonicalPath()+File.separator;
            if(candidate==null||!candidate.getCanonicalPath().startsWith(privateDir))
                throw new IOException("El reporte original no pertenece a la app.");
            if(!candidate.isFile()||candidate.length()<2048||candidate.length()>15000000)
                throw new IOException("El CRM todavía no entregó un PDF válido.");
            try(android.os.ParcelFileDescriptor fd=android.os.ParcelFileDescriptor.open(candidate,android.os.ParcelFileDescriptor.MODE_READ_ONLY);
                android.graphics.pdf.PdfRenderer renderer=new android.graphics.pdf.PdfRenderer(fd)){
                if(renderer.getPageCount()!=2)throw new IOException("El original debe tener dos páginas.");
            }
            invalidatePrint();
            originalPdf=candidate;
            name.setText(data.getStringExtra("leadName"));
            phone.setText(data.getStringExtra("leadPhone"));
            arrival.setText(data.getStringExtra("arrival"));
            leadCrmPath=data.getStringExtra("crmPath");
            pdfStatus.setText("Full-test original capturado desde Host · 2 páginas · "+(candidate.length()/1024)+" KB");
            operationStatus.setText("Lead seleccionado. Completá presentador, asesor y descripción antes de imprimir.");
        }catch(Exception exception){
            invalidatePrint();
            originalPdf=null;
            pdfStatus.setText("Error al obtener el test desde Host: "+exception.getMessage());
        }
    }
    private void invalidatePrint(){
        printAttempted=false;complete.setEnabled(false);complete.setAlpha(.45f);
        if(outputPdf!=null)outputPdf.delete();outputPdf=null;
    }
    private void preparePrint(boolean direct){
        if(!validate())return;
        if(originalPdf==null){pdfStatus.setText("Primero elegí el lead y capturá su Full-test desde Host.");return;}
        if(direct&&!PrintController.isPrivateIPv4(value(printerIp))){
            printerIp.setError("La IP debe estar en la red local.");return;
        }
        new AlertDialog.Builder(this).setTitle("Imprimir archivo")
            .setMessage(value(name)+"\nCharla de: "+value(presenter)+"\nDerivado a: "+value(advisor)+
                "\nDescripción: "+value(description)+"\n\nA4 · 1 hoja · 1 copia · simple faz.")
            .setNegativeButton("Corregir",(d,w)->{})
            .setPositiveButton(direct?"Enviar a Brother":"Abrir impresión Android",(d,w)->doPrint(direct)).show();
    }
    private void doPrint(boolean direct){
        try{
            outputPdf=PdfComposer.compose(originalPdf,new File(getCacheDir(),"fulltest-archivo-temporal.pdf"),
                value(presenter),value(advisor),value(description));
            printAttempted=true;
            complete.setEnabled(true);complete.setAlpha(1f);
            operationStatus.setText("Impresión iniciada. Verificá que haya salido físicamente antes de completar.");
            if(direct){
                String ip=value(printerIp);
                getPreferences(MODE_PRIVATE).edit().putString("printer_ip",ip).apply();
                operationStatus.setText("Enviando una hoja a la Brother "+ip+"…");
                PrintController.direct(ip,outputPdf,message->runOnUiThread(()->{
                    operationStatus.setText(message+"\nLa derivación todavía NO fue registrada en Liniers.");
                }));
            }else PrintController.androidPrint(this,outputPdf);
        }catch(Exception ex){
            operationStatus.setText("No se pudo crear el PDF: "+ex.getMessage());invalidatePrint();
        }
    }
    private void confirmHandoff(){
        if(!printAttempted||outputPdf==null)return;
        new AlertDialog.Builder(this).setTitle("Verificar antes de derivar")
            .setMessage("¿Retiraste la hoja de archivo de la Brother y confirmaste el lead?\n\n"+
                "Persona: "+value(name)+"\nCharla de: "+value(presenter)+"\nAsesor: "+value(advisor)+
                "\nResultado: "+outcome.getSelectedItem()+" · "+product.getSelectedItem()+
                "\n\nLa siguiente pantalla es el CRM original. Aún deberás completar y guardar allí la derivación.")
            .setNegativeButton("Revisar",(d,w)->{})
            .setPositiveButton("Continuar en CRM",(d,w)->{
                startActivity(new Intent(this,RouterActivity.class));
                operationStatus.setText("CRM de Enrutador abierto. La derivación aún debe confirmarse allí.");
            }).show();
    }
    private void clearLead(){
        new AlertDialog.Builder(this).setTitle("Nueva persona")
            .setMessage("Se vaciarán los datos del lead actual y se eliminará el PDF temporal. No afecta al CRM.")
            .setNegativeButton("Cancelar",(d,w)->{})
            .setPositiveButton("Limpiar",(d,w)->{
                for(EditText input:new EditText[]{name,phone,arrival,description,presenter,advisor})input.setText("");
                outcome.setSelection(0);product.setSelection(0);leadCrmPath="";
                if(originalPdf!=null)originalPdf.delete();originalPdf=null;
                pdfStatus.setText("Abrí un lead de Atendidas para cargar su test automáticamente.");
                invalidatePrint();
                operationStatus.setText("Listo para buscar otra persona.");
            }).show();
    }
}
