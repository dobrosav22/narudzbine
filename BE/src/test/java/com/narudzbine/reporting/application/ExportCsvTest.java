package com.narudzbine.reporting.application;
import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class ExportCsvTest {
    @Test void unicodeQuotesNewlinesAndFormulaPrefixesAreSafe(){
        var csv=new ExportCsv(List.of("name","note"));csv.row(List.of("Čačak, \"sir\"","line1\nline2"));
        assertThat(new String(csv.bytes(),StandardCharsets.UTF_8)).isEqualTo("\"name\",\"note\"\r\n\"Čačak, \"\"sir\"\"\",\"line1\nline2\"\r\n");
        for(String v:List.of("=1+1","+1","-1","@SUM(1)","  =1","\ttext","\rtext","\ntext","\u00a0=1","\ufeff=1","＝1","＋1","－1","＠SUM(1)","\u200b=1","\u200e=1","\u00a0\ttext")){
            var protectedCsv=new ExportCsv(List.of("x"));protectedCsv.row(List.of(v));assertThat(new String(protectedCsv.bytes(),StandardCharsets.UTF_8)).contains("\"'"+v+"\"");
        }
    }
    @Test void hundredThousandRowsAreAllowedButNextRowFails(){
        var csv=new ExportCsv(List.of("x"));for(int i=0;i<100000;i++)csv.row(List.of("1"));assertThat(csv.rows()).isEqualTo(100000);
        assertThatThrownBy(()->csv.row(List.of("2"))).isInstanceOf(ExportCsv.Limit.class).extracting(e->((ExportCsv.Limit)e).code()).isEqualTo("EXPORT_ROW_LIMIT");
    }
    @Test void byteLimitCountsEncodedUtf8AndNeverPublishesPartialRow(){
        var csv=new ExportCsv(List.of("x"));csv.row(List.of("a".repeat(ExportCsv.MAX_BYTES-9)));assertThat(csv.bytes().length).isEqualTo(ExportCsv.MAX_BYTES);
        assertThatThrownBy(()->csv.row(List.of("č"))).isInstanceOf(ExportCsv.Limit.class);assertThat(csv.rows()).isEqualTo(1);
    }
}
