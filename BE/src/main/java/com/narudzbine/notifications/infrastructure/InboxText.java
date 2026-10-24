package com.narudzbine.notifications.infrastructure;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.*;
final class InboxText {
 private static final Map<String,Properties> RESOURCES=load();
 private InboxText(){}
 static String render(String locale,String event,String organization,String reference){
  String key=event+".text";String value=RESOURCES.getOrDefault(locale,RESOURCES.get("en")).getProperty(key,RESOURCES.get("en").getProperty(key));
  if(value==null)throw new IllegalStateException("Inbox resource unavailable");
  String text=Normalizer.normalize(value.replace("{1}",reference).replace("{0}",organization),Normalizer.Form.NFC);
  if(text.isBlank()||text.codePointCount(0,text.length())>4000)throw new IllegalStateException("Invalid inbox resource");return text;
 }
 private static Map<String,Properties> load(){
  var all=new HashMap<String,Properties>();for(String tag:List.of("en","sr-Latn-RS","bs-Latn-BA")){
   var p=new Properties();try(var input=InboxText.class.getResourceAsStream("/i18n/messages_"+tag+".properties")){
    if(input==null)throw new IllegalStateException("Inbox resources missing");p.load(new InputStreamReader(input,StandardCharsets.UTF_8));
   }catch(IOException e){throw new IllegalStateException("Inbox resources unreadable",e);}all.put(tag,p);
  }return Map.copyOf(all);
 }
}
