package com.narudzbine.reporting.application;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.time.Instant;
import java.time.format.DateTimeFormatterBuilder;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import tools.jackson.core.JsonGenerator;
import tools.jackson.databind.json.JsonMapper;

/** Internal streaming sink for explicit projection records. Never accepts table names or raw database JSON. */
final class PortableJson implements AutoCloseable {
    enum Family {
        REQUESTER,ORGANIZATION,MEMBERS,LOCATIONS,CONTACTS,CONNECTIONS,PARTNERS,INVITATIONS,OWNERSHIP_TRANSFERS,PLAN,PLAN_REQUESTS,PRODUCTS,PRODUCT_HISTORY,
        SKU_RESERVATIONS,TAXONOMY,PRICING,PRICING_HISTORY,AGREED_PRICES,AGREED_PRICE_HISTORY,
        PROMOTIONS,PROMOTION_HISTORY,TRACKING,INVENTORY,STOCK_HISTORY,FAVORITES,DRAFTS,DRAFT_EVENTS,ORDER_STAGES,
        ORDERS,ORDER_EVENTS,CANCELLATIONS,MESSAGES,BUSINESS_AUDIT,PREFERENCES,INBOX;
        String field(){String[] words=name().toLowerCase(java.util.Locale.ROOT).split("_");var value=new StringBuilder(words[0]);for(int i=1;i<words.length;i++)value.append(Character.toUpperCase(words[i].charAt(0))).append(words[i].substring(1));return value.toString();}
    }
    private record Manifest(int version,UUID caseId,UUID organizationId,String country,String organizationType,
            String snapshotAt,String priceBasis,List<String> families,List<String> excluded) {}
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final ByteArrayOutputStream output=new ByteArrayOutputStream();
    private final JsonGenerator generator;
    private int next,records;private boolean open,failed,finished;
    PortableJson(UUID caseId,UUID organization,String country,String type,Instant snapshot){
        if(caseId==null||organization==null||!List.of("RS","BA").contains(country)||!List.of("BUYER","VENDOR").contains(type))throw new IllegalArgumentException("Original export scope required");
        generator=JSON.createGenerator(new OutputStream(){
            private void bound(int bytes){if((long)output.size()+bytes>PortableExportSettings.MAX_BYTES)throw new Limit("PRIVACY_EXPORT_SIZE_LIMIT");}
            @Override public void write(int value){bound(1);output.write(value);}
            @Override public void write(byte[] bytes,int offset,int length){bound(length);output.write(bytes,offset,length);}
        });
        generator.writeStartObject();generator.writePOJOProperty("manifest",new Manifest(1,caseId,organization,country,type,new DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(snapshot),"NET_EXCLUDING_VAT",Arrays.stream(Family.values()).map(Family::field).toList(),List.of("authentication_capabilities","private_operator_support_context","counterpart_private_data","inaccessible_vendor_masters","transient_provider_replay_data","raw_media")));
        generator.writeObjectPropertyStart("data");
    }
    void start(Family family){
        requireUsable();if(open||next>=Family.values().length||Family.values()[next]!=family)throw new IllegalStateException("Export families must be complete and ordered");
        generator.writeName(family.field());generator.writeStartArray();open=true;
    }
    void row(Record record){
        requireUsable();if(!open||record==null)throw new IllegalStateException("Explicit projection record and family required");
        if(records==PortableExportSettings.MAX_RECORDS){failed=true;throw new Limit("PRIVACY_EXPORT_ROW_LIMIT");}
        try{generator.writePOJO(record);generator.flush();records++;}
        catch(RuntimeException failure){failed=true;for(Throwable cause=failure;cause!=null;cause=cause.getCause())if(cause instanceof Limit limit)throw limit;throw new IllegalStateException("Portable projection could not be encoded");}
    }
    void end(){requireUsable();if(!open)throw new IllegalStateException("No open export family");generator.writeEndArray();open=false;next++;}
    byte[] finish(){
        requireUsable();if(open||next!=Family.values().length)throw new IllegalStateException("Incomplete portable manifest");
        try{generator.writeEndObject();generator.writeEndObject();generator.close();finished=true;return output.toByteArray();}
        catch(RuntimeException failure){failed=true;for(Throwable cause=failure;cause!=null;cause=cause.getCause())if(cause instanceof Limit limit)throw limit;throw new IllegalStateException("Portable projection could not be completed");}
    }
    int records(){return records;}
    private void requireUsable(){if(failed||finished)throw new IllegalStateException("Portable projection is not publishable");}
    @Override public void close(){if(!finished){failed=true;try{generator.close();}catch(RuntimeException ignored){/* Failed partial output is never exposed. */}}}
    static final class Limit extends RuntimeException {
        private final String code;Limit(String code){super("Portable export bound exceeded");this.code=code;}String code(){return code;}
    }
}
