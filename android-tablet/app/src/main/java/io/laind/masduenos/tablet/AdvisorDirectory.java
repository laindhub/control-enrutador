package io.laind.masduenos.tablet;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;

/** Public server configuration, completely separate from authenticated CRM sessions. */
final class AdvisorDirectory {
    private static final String URL_STRING="https://masduenos.laind.io/assets/tablet/directory.json";
    private static final int MAX_BYTES=64*1024;
    private final SharedPreferences prefs;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private volatile AdvisorDirectoryData data;
    private boolean busy=false;
    interface Callback {void loaded(AdvisorDirectoryData data,boolean online);}
    AdvisorDirectory(Context context){
        Context app=context.getApplicationContext();
        prefs=app.getSharedPreferences("tablet_advisor_directory_v1",Context.MODE_PRIVATE);
        String cached=prefs.getString("json",null);
        if(cached!=null)try{data=AdvisorDirectoryData.parse(cached);}catch(Exception ignored){}
        if(data==null)try(InputStream input=app.getAssets().open("directory.json")){
            data=AdvisorDirectoryData.parse(read(input));
        }catch(Exception ignored){data=AdvisorDirectoryData.empty();}
    }
    AdvisorDirectoryData current(){return data;}
    void refresh(Callback callback){
        // Called on the UI thread. A double tap must not queue stale requests.
        if(busy)return;
        busy=true;
        new Thread(()->{
            boolean online=false;
            HttpsURLConnection connection=null;
            try{
                connection=(HttpsURLConnection)new URL(URL_STRING).openConnection();
                connection.setConnectTimeout(5000);connection.setReadTimeout(5000);
                connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
                connection.setRequestProperty("Accept","application/json");
                connection.setRequestProperty("Cache-Control","no-cache");
                if(connection.getResponseCode()!=200)throw new IOException("Directory unavailable");
                String type=connection.getContentType();
                if(type==null||!type.toLowerCase(java.util.Locale.ROOT).startsWith("application/json"))
                    throw new IOException("Invalid directory response");
                String json;
                try(InputStream input=connection.getInputStream()){json=read(input);}
                AdvisorDirectoryData next=AdvisorDirectoryData.parse(json);
                // Validate the complete response before replacing the last working copy.
                prefs.edit().putString("json",json).apply();data=next;online=true;
            }catch(Exception ignored){
                // Offline, HTTP errors and malformed data retain the same working list.
            }finally{if(connection!=null)connection.disconnect();}
            final boolean fetched=online;
            ui.post(()->{busy=false;callback.loaded(data,fetched);});
        },"tablet-advisor-directory").start();
    }
    private static String read(InputStream input) throws IOException {
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[4096];
        int count;
        while((count=input.read(buffer))!=-1){
            if(bytes.size()+count>MAX_BYTES)throw new IOException("Directory too large");
            bytes.write(buffer,0,count);
        }
        return new String(bytes.toByteArray(),StandardCharsets.UTF_8);
    }
}
