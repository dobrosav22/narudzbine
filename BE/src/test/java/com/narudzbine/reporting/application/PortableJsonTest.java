package com.narudzbine.reporting.application;

import static org.assertj.core.api.Assertions.*;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class PortableJsonTest {
    record Row(String name,String amount,int quantity,String optional){}
    private PortableJson writer(){return new PortableJson(UUID.randomUUID(),UUID.randomUUID(),"BA","BUYER",Instant.parse("2026-10-22T12:00:00Z"));}
    @Test void completeManifestPreservesUnicodeMoneyNullsAndEmptyFamilies(){
        try(var writer=writer()){
            for(var family:PortableJson.Family.values()){writer.start(family);if(family==PortableJson.Family.ORDERS)writer.row(new Row("Čaj 🍵","12.30",5,null));writer.end();}
            var tree=JsonMapper.builder().build().readTree(writer.finish());assertThat(tree.path("manifest").path("snapshotAt").asString()).isEqualTo("2026-10-22T12:00:00.000Z");assertThat(tree.path("manifest").path("priceBasis").asString()).isEqualTo("NET_EXCLUDING_VAT");assertThat(tree.path("data").size()).isEqualTo(PortableJson.Family.values().length);assertThat(tree.path("data").has("productHistory")).isTrue();assertThat(tree.path("data").has("businessAudit")).isTrue();assertThat(tree.path("data").path("orders").get(0).path("amount").isString()).isTrue();assertThat(tree.path("data").path("orders").get(0).path("amount").asString()).isEqualTo("12.30");assertThat(tree.path("data").path("orders").get(0).path("optional").isNull()).isTrue();assertThat(tree.path("data").path("orders").get(0).path("name").asString()).isEqualTo("Čaj 🍵");assertThat(writer.records()).isEqualTo(1);assertThatThrownBy(writer::finish).isInstanceOf(IllegalStateException.class);
        }
    }
    @Test void omittedOrOutOfOrderFamiliesCannotProduceAnArtifact(){
        try(var writer=writer()){assertThatThrownBy(()->writer.start(PortableJson.Family.ORDERS)).isInstanceOf(IllegalStateException.class);assertThatThrownBy(writer::finish).isInstanceOf(IllegalStateException.class);writer.start(PortableJson.Family.REQUESTER);assertThatThrownBy(writer::finish).isInstanceOf(IllegalStateException.class);}
    }
    @Test void recordLimitIsGlobalAndFailureCannotPublishPartialBytes(){
        try(var writer=writer()){writer.start(PortableJson.Family.REQUESTER);var row=new Row("Synthetic","1.00",1,null);for(int i=0;i<PortableExportSettings.MAX_RECORDS;i++)writer.row(row);assertThatThrownBy(()->writer.row(row)).isInstanceOf(PortableJson.Limit.class).extracting(e->((PortableJson.Limit)e).code()).isEqualTo("PRIVACY_EXPORT_ROW_LIMIT");assertThatThrownBy(writer::finish).isInstanceOf(IllegalStateException.class);}
    }
    @Test void byteBoundAppliesDuringEncodingAndFailureCannotPublishPartialBytes(){
        try(var writer=writer()){writer.start(PortableJson.Family.REQUESTER);assertThatThrownBy(()->writer.row(new Row("x".repeat(PortableExportSettings.MAX_BYTES),"1.00",1,null))).isInstanceOf(PortableJson.Limit.class).extracting(e->((PortableJson.Limit)e).code()).isEqualTo("PRIVACY_EXPORT_SIZE_LIMIT");assertThatThrownBy(writer::finish).isInstanceOf(IllegalStateException.class);}
    }
}
