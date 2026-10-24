package com.narudzbine.audit.api;

import java.util.*;

/** Independent evidence byte boundary. It does not authorize redaction or prove a database commit. */
public interface IndependentObjects {
    int MAX_PLAINTEXT=16*1024*1024;
    int MAX_OBJECT=MAX_PLAINTEXT+128;
    enum Family {
        DELETION_INTENT("deletion-intent"),DELETION_COMPLETION("deletion-completion"),AUDIT_PART("audit-part"),AUDIT_MANIFEST("audit-manifest");
        private final String path;Family(String path){this.path=path;}public String path(){return path;}
    }
    record Key(Family family,UUID resource,long sequence) {
        public Key {if(family==null||resource==null||resource.version()!=7||resource.variant()!=2||sequence<1||sequence>1_000_000_000L)throw new IllegalArgumentException("Explicit evidence identity required");}
        public String path(){return family.path()+"/"+resource+"/"+String.format(Locale.ROOT,"%010d",sequence)+".bin";}
        public static Key parse(Family family,String path){
            String prefix=family.path()+"/";if(path==null||!path.startsWith(prefix))throw new IllegalArgumentException("Invalid evidence path");
            String[] parts=path.substring(prefix.length()).split("/",-1);if(parts.length!=2||!parts[1].matches("[0-9]{10}\\.bin"))throw new IllegalArgumentException("Invalid evidence path");
            var key=new Key(family,UUID.fromString(parts[0]),Long.parseLong(parts[1].substring(0,10)));if(!key.path().equals(path))throw new IllegalArgumentException("Canonical evidence path required");return key;
        }
    }
    record Page(List<Key> keys,boolean more){public Page{keys=List.copyOf(keys);}}
    /** Return false only for an existing identity. An uncertain write throws; inspect the same identity. */
    boolean create(Key key,byte[] ciphertext);
    Optional<byte[]> read(Key key);
    Page list(Family family,int size,Key after);
}
