package io.laind.masduenos.tablet;

import android.app.Activity;
import android.graphics.Color;
import android.widget.ArrayAdapter;
import android.widget.AutoCompleteTextView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.function.Consumer;

/** All new talks require their owner up front. No unnamed automatic sessions. */
final class TalkPrompts {
    static void create(Activity activity,TalkStore store,String suggested,Consumer<TalkStore.Talk> onCreated){
        LinearLayout form=Ui.column(activity,10);
        TextView label=Ui.label(activity,"¿De quién es esta charla?",15,true);
        form.addView(label);
        AutoCompleteTextView presenter=new AutoCompleteTextView(activity);
        presenter.setSingleLine(true);presenter.setTextSize(17);presenter.setThreshold(1);
        presenter.setHint("Seleccioná o escribí el presentador");
        presenter.setAdapter(new ArrayAdapter<>(activity,
            android.R.layout.simple_dropdown_item_1line,PresenterRoster.KNOWN));
        presenter.setBackground(Ui.bg(activity,Color.WHITE,13,Ui.LINE));
        presenter.setPadding(Ui.dp(activity,13),Ui.dp(activity,11),
            Ui.dp(activity,13),Ui.dp(activity,11));
        if(suggested!=null&&!suggested.isEmpty())presenter.setText(suggested,false);
        form.addView(presenter,Ui.spaced(activity,8));
        TextView note=Ui.label(activity,
            "El presentador se asociará a todas las sillas y se completará automáticamente al derivar.",12,false);
        note.setTextColor(Ui.MUTED);form.addView(note,Ui.spaced(activity,4));
        UiSheets.open(activity,"Iniciar charla","Asigná quién la da antes de comenzar.",
            form,"Cancelar","Iniciar",()->{
                String owner=presenter.getText().toString().trim();
                try{onCreated.accept(store.createToday(owner));}
                catch(Exception e){UiSheets.info(activity,"No se pudo crear la charla",e.getMessage());}
            });
    }
    static void changePresenter(Activity activity,TalkStore store,
                                TalkStore.Talk talk,LeadStore leads,Runnable refreshed){
        LinearLayout form=Ui.column(activity,12);
        AutoCompleteTextView presenter=new AutoCompleteTextView(activity);
        presenter.setSingleLine(true);presenter.setTextSize(16);presenter.setThreshold(1);
        presenter.setHint("Presentador responsable");
        presenter.setAdapter(new ArrayAdapter<>(activity,
            android.R.layout.simple_dropdown_item_1line,PresenterRoster.KNOWN));
        presenter.setText(talk.presenter,false);
        form.addView(presenter);
        UiSheets.open(activity,"Presentador de "+talk.name,
            "Se actualizará también el campo «Charla de» de sus leads aún no impresos.",
            form,"Cancelar","Guardar",()->{
                try{store.setPresenter(talk,presenter.getText().toString(),leads);refreshed.run();}
                catch(Exception e){UiSheets.info(activity,"No se pudo cambiar",e.getMessage());}
            });
    }
    private TalkPrompts(){}
}
