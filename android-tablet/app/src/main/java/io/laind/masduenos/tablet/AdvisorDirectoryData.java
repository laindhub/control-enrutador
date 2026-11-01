package io.laind.masduenos.tablet;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Validated names and explicit corrections; contains no customer information. */
final class AdvisorDirectoryData {
    private final String[] advisors;
    private final Map<String,String> aliases;
    private AdvisorDirectoryData(String[] advisors,Map<String,String> aliases){
        this.advisors=advisors;this.aliases=aliases;
    }
    static AdvisorDirectoryData parse(String json) throws Exception {
        JSONObject root=new JSONObject(json);
        if(root.getInt("version")!=1)throw new IllegalArgumentException("Unsupported directory version");
        JSONArray list=root.getJSONArray("advisors");
        if(list.length()<1||list.length()>500)throw new IllegalArgumentException("Invalid directory size");
        LinkedHashSet<String> names=new LinkedHashSet<>();
        for(int i=0;i<list.length();i++){
            String name=validName(list.getString(i));
            if(!names.add(name))throw new IllegalArgumentException("Duplicate advisor");
        }
        Map<String,String> aliases=new LinkedHashMap<>();
        JSONObject corrections=root.optJSONObject("aliases");
        if(corrections!=null){
            if(corrections.length()>500)throw new IllegalArgumentException("Too many corrections");
            Iterator<String> keys=corrections.keys();
            while(keys.hasNext()){
                String key=keys.next(),from=validName(key),to=validName(corrections.getString(key));
                if(!names.contains(to)||names.contains(from))
                    throw new IllegalArgumentException("Correction must point to a current advisor");
                aliases.put(from,to);
            }
        }
        return new AdvisorDirectoryData(names.toArray(new String[0]),aliases);
    }
    private static String validName(String value){
        String name=value.trim();
        if(name.length()<3||name.length()>100)throw new IllegalArgumentException("Invalid name");
        for(int i=0;i<name.length();i++)if(Character.isISOControl(name.charAt(i)))
            throw new IllegalArgumentException("Invalid name characters");
        return name;
    }
    static AdvisorDirectoryData empty(){return new AdvisorDirectoryData(new String[0],new LinkedHashMap<>());}
    String[] names(){return advisors.clone();}
    String canonical(String value){return aliases.containsKey(value)?aliases.get(value):value;}
}
