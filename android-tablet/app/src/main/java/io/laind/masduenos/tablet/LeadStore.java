package io.laind.masduenos.tablet;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** One-device board. Client details are encrypted with an Android Keystore key.
 * PDFs remain inside app-private files; Android backup is disabled.
 * No CRM account credentials or cookies are stored in this class.
 */
final class LeadStore {
    static final String NEW="new", READY="ready", SENT="sent", PAPER="paper", DONE="done";
    static final String PREF="private_tablet_board_v1", RECORDS="encrypted_records", KEY_ALIAS="masduenos_tablet_board_aes_v1";
    static final class Lead {
        String id="",crmPath="",name="",phone="",arrival="",date="",presenter="",advisor="",description="";
        String outcome="La vio entera",product="PAI",status=NEW;
        long updatedAt;
        JSONObject toJson() throws Exception {
            JSONObject o=new JSONObject();
            o.put("id",id);o.put("crmPath",crmPath);o.put("name",name);o.put("phone",phone);
            o.put("arrival",arrival);o.put("date",date);o.put("presenter",presenter);o.put("advisor",advisor);
            o.put("description",description);o.put("outcome",outcome);o.put("product",product);
            o.put("status",status);o.put("updatedAt",updatedAt);return o;
        }
        static Lead fromJson(JSONObject o) {
            Lead l=new Lead();
            l.id=o.optString("id");l.crmPath=o.optString("crmPath");
            l.name=o.optString("name");l.phone=o.optString("phone");
            l.arrival=o.optString("arrival");l.date=o.optString("date");
            l.presenter=o.optString("presenter");l.advisor=o.optString("advisor");
            l.description=o.optString("description");l.outcome=o.optString("outcome","La vio entera");
            l.product=o.optString("product","PAI");l.status=o.optString("status",NEW);
            l.updatedAt=o.optLong("updatedAt",0);return l;
        }
        boolean prepared(){return !presenter.trim().isEmpty()&&!advisor.trim().isEmpty()&&!description.trim().isEmpty();}
        String label(){
            if(DONE.equals(status))return "Registrada por vos";
            if(PAPER.equals(status))return "Hoja confirmada";
            if(SENT.equals(status))return "Enviada a impresión";
            if(prepared())return "Por imprimir";
            return "En preparación";
        }
    }
    private final Context context;
    private final SharedPreferences preferences;
    LeadStore(Context context){
        this.context=context.getApplicationContext();
        this.preferences=this.context.getSharedPreferences(PREF,Context.MODE_PRIVATE);
    }
    static String today(){return new SimpleDateFormat("yyyy-MM-dd",Locale.ROOT).format(new Date());}
    private static SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(KEY_ALIAS))return ((KeyStore.SecretKeyEntry)store.getEntry(KEY_ALIAS,null)).getSecretKey();
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    private static String encrypt(String text) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE,key());
        byte[] body=cipher.doFinal(text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        byte[] iv=cipher.getIV();
        byte[] combined=new byte[1+iv.length+body.length];
        combined[0]=(byte)iv.length;
        System.arraycopy(iv,0,combined,1,iv.length);
        System.arraycopy(body,0,combined,iv.length+1,body.length);
        return Base64.encodeToString(combined,Base64.NO_WRAP);
    }
    private static String decrypt(String encrypted) throws Exception {
        byte[] bytes=Base64.decode(encrypted,Base64.DEFAULT);
        int size=bytes.length==0?0:bytes[0]&255;
        if(size!=12||bytes.length<29)throw new IOException("La información local está dañada.");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,bytes,1,size));
        byte[] clear=cipher.doFinal(bytes,1+size,bytes.length-size-1);
        return new String(clear,java.nio.charset.StandardCharsets.UTF_8);
    }
    synchronized ArrayList<Lead> all() throws Exception {
        String stored=preferences.getString(RECORDS,null);
        ArrayList<Lead> result=new ArrayList<>();
        if(stored!=null&&!stored.isEmpty()){
            JSONArray data=new JSONArray(decrypt(stored));
            for(int i=0;i<data.length();i++){
                Lead lead=Lead.fromJson(data.getJSONObject(i));
                if(!lead.id.isEmpty())result.add(lead);
            }
        }
        result.sort((a,b)->Long.compare(b.updatedAt,a.updatedAt));
        return result;
    }
    synchronized void write(ArrayList<Lead> list) throws Exception {
        JSONArray data=new JSONArray();
        for(Lead item:list)data.put(item.toJson());
        if(!preferences.edit().putString(RECORDS,encrypt(data.toString())).commit())
            throw new IOException("No se pudieron guardar los cambios en la tablet.");
    }
    synchronized Lead get(String id) throws Exception {
        for(Lead l:all())if(l.id.equals(id))return l;
        return null;
    }
    synchronized Lead save(Lead item) throws Exception {
        if(item.id==null||item.id.isEmpty())item.id=UUID.randomUUID().toString();
        item.updatedAt=System.currentTimeMillis();
        ArrayList<Lead> list=all();
        boolean replaced=false;
        for(int i=0;i<list.size();i++)if(list.get(i).id.equals(item.id)){list.set(i,item);replaced=true;break;}
        if(!replaced)list.add(item);
        write(list);return item;
    }
    synchronized void remove(String id) throws Exception{
        ArrayList<Lead> list=all();list.removeIf(item->item.id.equals(id));write(list);
        File dir=leadDir(id);
        File[] files=dir.listFiles();
        if(files!=null)for(File file:files)file.delete();
        dir.delete();
    }
    synchronized Lead addFromHost(String name,String phone,String arrival,String crmPath,File captured) throws Exception {
        if(name==null||name.trim().length()<2||crmPath==null||!crmPath.startsWith("/floor/"))
            throw new IOException("La ficha del CRM no es válida.");
        if(captured==null||!captured.isFile()||captured.length()<2000||captured.length()>15000000)
            throw new IOException("No se recibió un Full-test válido.");
        Lead item=null;
        for(Lead existing:all())if(existing.crmPath.equals(crmPath)&&existing.date.equals(today())){item=existing;break;}
        if(item==null){item=new Lead();item.id=UUID.randomUUID().toString();item.date=today();}
        // Copy atomically before changing metadata, so a failed capture cannot
        // overwrite a previous complete source PDF.
        File folder=leadDir(item.id);
        if(!folder.exists()&&!folder.mkdirs())throw new IOException("No se pudo crear el archivo privado.");
        File temp=new File(folder,"source.tmp");
        try(FileInputStream input=new FileInputStream(captured);FileOutputStream output=new FileOutputStream(temp)){
            byte[] buffer=new byte[16384];int count;
            while((count=input.read(buffer))!=-1)output.write(buffer,0,count);
            output.getFD().sync();
        }
        File destination=new File(folder,"source.pdf");
        if(!temp.renameTo(destination)){
            temp.delete();throw new IOException("No se pudo preservar el Full-test del cliente.");
        }
        item.name=name.trim();item.phone=phone==null?"":phone.trim();
        item.arrival=arrival==null?"":arrival.trim();item.crmPath=crmPath;
        // A recaptured test may have changed; a previous print no longer counts.
        if(!DONE.equals(item.status))item.status=item.prepared()?READY:NEW;
        return save(item);
    }
    File leadDir(String id) {
        if(id==null||!id.matches("[a-fA-F0-9-]{36}"))throw new IllegalArgumentException("Identificador inválido.");
        return new File(new File(context.getFilesDir(),"board"),id);
    }
    File sourceFile(Lead item){return new File(leadDir(item.id),"source.pdf");}
    File archiveFile(Lead item){return new File(leadDir(item.id),"archive.pdf");}
}
