package com.narudzbine.notifications.infrastructure;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

final class DeliveryText {
    record Rendered(String subject,String text,String html) {}
    private static final Map<String,Properties> ALL=load();
    private static final Pattern PARAMETER=Pattern.compile("\\{([012])}");
    static Rendered render(String locale,String event,String link,long minutes){return render(locale,event,"Narudzbine","",link,minutes);}
    static Rendered render(String locale,String event,String organization,String reference,String link,long minutes){
        String[] values={"Narudzbine",link,Long.toString(minutes)};boolean technical=Set.of("INVITATION","INVITATION_PROOF","PASSWORD_RESET","EMAIL_PROOF","RECOVERY_NOTICE","RECOVERY_ACCEPTANCE").contains(event);
        if(!technical)values=new String[]{organization,reference,link};
        return new Rendered(format(resource(locale,event+".subject"),values,false),format(resource(locale,event+".emailText"),values,false),format(resource(locale,event+".html"),values,true));
    }
    private static String resource(String locale,String key){String value=ALL.getOrDefault(locale,ALL.get("en")).getProperty(key,ALL.get("en").getProperty(key));if(value==null||value.isBlank())throw new IllegalStateException("External delivery resource unavailable");return value;}
    private static String format(String text,String[] values,boolean html){var m=PARAMETER.matcher(text);var out=new StringBuilder();while(m.find()){String value=values[Integer.parseInt(m.group(1))];m.appendReplacement(out,java.util.regex.Matcher.quoteReplacement(html?escape(value):value));}m.appendTail(out);return out.toString();}
    private static String escape(String value){return value.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;");}
    private static Map<String,Properties> load(){var all=new HashMap<String,Properties>();for(String tag:List.of("en","sr-Latn-RS","bs-Latn-BA")){var p=new Properties();try(var stream=DeliveryText.class.getResourceAsStream("/i18n/messages_"+tag+".properties")){if(stream==null)throw new IllegalStateException("External delivery resources missing");p.load(new InputStreamReader(stream,StandardCharsets.UTF_8));}catch(IOException e){throw new IllegalStateException("External delivery resources unreadable");}all.put(tag,p);}return Map.copyOf(all);}
}
