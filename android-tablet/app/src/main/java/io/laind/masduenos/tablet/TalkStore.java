package io.laind.masduenos.tablet;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Encrypted local talks for each working day; not uploaded to the CRM.
 * Chats are stable across launches and don't touch the existing lead records.
 */
final class TalkStore {
    private static final String PREF="private_tablet_board_v1";
    private static final String KEY="encrypted_talks_v1";
    static final int COLS=4,ROWS=3,CAPACITY=COLS*ROWS;
    static final class Talk {
        String id="",date="",name="",time="",presenter="";
        long createdAt=0;
        JSONObject toJson() throws Exception{
            JSONObject o=new JSONObject();
            o.put("id",id);o.put("date",date);o.put("name",name);
            o.put("time",time);o.put("presenter",presenter);o.put("createdAt",createdAt);return o;
        }
        static Talk fromJson(JSONObject o){
            Talk t=new Talk();
            t.id=o.optString("id");t.date=o.optString("date");
            t.name=o.optString("name");t.time=o.optString("time");t.presenter=o.optString("presenter","");
            t.createdAt=o.optLong("createdAt");return t;
        }
        String display(){return name+(time.isEmpty()?"":" · "+time);}
    }
    private final SharedPreferences prefs;
    TalkStore(Context context){
        prefs=context.getApplicationContext().getSharedPreferences(PREF,Context.MODE_PRIVATE);
    }
    synchronized ArrayList<Talk> all() throws Exception {
        ArrayList<Talk> talks=new ArrayList<>();
        String value=prefs.getString(KEY,null);
        if(value!=null&&!value.isEmpty()){
            JSONArray array=new JSONArray(LeadStore.decrypt(value));
            for(int i=0;i<array.length();i++){
                Talk talk=Talk.fromJson(array.getJSONObject(i));
                if(talk.id.matches("[0-9a-f-]{36}"))talks.add(talk);
            }
        }
        talks.sort((a,b)->Long.compare(a.createdAt,b.createdAt));
        return talks;
    }
    private synchronized void write(ArrayList<Talk> items) throws Exception {
        JSONArray json=new JSONArray();
        for(Talk t:items)json.put(t.toJson());
        if(!prefs.edit().putString(KEY,LeadStore.encrypt(json.toString())).commit())
            throw new IllegalStateException("No se pudieron guardar las charlas.");
    }
    synchronized ArrayList<Talk> today() throws Exception{
        ArrayList<Talk> items=new ArrayList<>();
        for(Talk item:all())if(LeadStore.today().equals(item.date))items.add(item);
        return items;
    }
    synchronized Talk createToday(String presenter) throws Exception {
        String owner=presenter==null?"":presenter.trim();
        if(owner.length()<3||owner.length()>100)throw new IllegalArgumentException("Elegí el presentador de la charla.");
        ArrayList<Talk> items=all();
        int count=0;
        for(Talk t:items)if(LeadStore.today().equals(t.date))count++;
        Talk chat=new Talk();
        chat.id=UUID.randomUUID().toString();chat.date=LeadStore.today();
        chat.name="Charla "+(count+1);chat.presenter=owner;
        chat.time=new SimpleDateFormat("HH:mm",Locale.getDefault()).format(new Date());
        chat.createdAt=System.currentTimeMillis();
        items.add(chat);write(items);return chat;
    }
    synchronized void rename(Talk talk,String name,String time) throws Exception{
        if(name==null||name.trim().isEmpty())throw new IllegalArgumentException("Ingresá un nombre.");
        if(name.trim().length()>48)throw new IllegalArgumentException("Nombre demasiado largo.");
        ArrayList<Talk> items=all();boolean found=false;
        for(Talk t:items)if(t.id.equals(talk.id)){
            t.name=name.trim();t.time=time==null?"":time.trim();found=true;break;
        }
        if(!found)throw new IllegalArgumentException("No se encontró la charla.");
        write(items);
    }
    synchronized void setPresenter(Talk talk,String name,LeadStore leads) throws Exception {
        String owner=name==null?"":name.trim();
        if(owner.length()<3||owner.length()>100)
            throw new IllegalArgumentException("Elegí un presentador válido.");
        for(LeadStore.Lead lead:leads.all()) {
            if(talk.id.equals(lead.talkId)&&
                (LeadStore.SENT.equals(lead.status)||LeadStore.PAPER.equals(lead.status)||
                 LeadStore.DONE.equals(lead.status))&&
                !owner.equalsIgnoreCase(lead.presenter))
                throw new IllegalArgumentException("Hay hojas impresas o derivaciones registradas. No se puede cambiar el presentador de esta charla.");
        }
        ArrayList<Talk> items=all();boolean found=false;
        for(Talk t:items)if(t.id.equals(talk.id)){
            t.presenter=owner;found=true;break;
        }
        if(!found)throw new IllegalArgumentException("No se encontró la charla.");
        // Save the owner to existing unprinted leads before changing the
        // session metadata. A pre-existing talk without presenter is migrated.
        leads.updatePresenterForTalk(talk.id,owner);
        write(items);
    }
    synchronized void removeEmpty(Talk talk,LeadStore leads) throws Exception{
        for(LeadStore.Lead lead:leads.all()){
            if(talk.id.equals(lead.talkId))throw new IllegalArgumentException("La charla tiene personas. Liberá sus sillas antes de eliminarla.");
        }
        ArrayList<Talk> items=all();
        items.removeIf(t->t.id.equals(talk.id));
        write(items);
    }
}
