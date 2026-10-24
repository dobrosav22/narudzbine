package com.narudzbine.reporting.application;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Bounded RFC4180 UTF-8 CSV, with spreadsheet formula-prefix protection on every field. */
public final class ExportCsv {
    public static final int MAX_ROWS=100_000,MAX_BYTES=16*1024*1024;
    private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    private int rows;
    public ExportCsv(List<String> header){write(header);}
    public void row(List<String> values){if(rows==MAX_ROWS)throw new Limit("EXPORT_ROW_LIMIT");write(values);rows++;}
    public byte[] bytes(){return bytes.toByteArray();}
    public int rows(){return rows;}
    private void write(List<String> values){
        var line=new StringJoiner(",");for(String v:values)line.add("\""+safe(v==null?"":v).replace("\"","\"\"")+"\"");
        byte[] encoded=(line+"\r\n").getBytes(StandardCharsets.UTF_8);
        if((long)bytes.size()+encoded.length>MAX_BYTES)throw new Limit("EXPORT_SIZE_LIMIT");bytes.writeBytes(encoded);
    }
    private static String safe(String value){
        boolean control=!value.isEmpty()&&Character.isISOControl(value.codePointAt(0));int at=0;
        while(at<value.length()){int cp=value.codePointAt(at);if(!(Character.isWhitespace(cp)||Character.isSpaceChar(cp)||Character.isISOControl(cp)||Character.getType(cp)==Character.FORMAT))break;control|=Character.isISOControl(cp);at+=Character.charCount(cp);}
        boolean formula=at<value.length()&&"=+-@＝＋－＠".indexOf(value.codePointAt(at))>=0;
        return control||formula?"'"+value:value;
    }
    public static final class Limit extends RuntimeException {
        private final String code;public Limit(String code){super("Export bound exceeded");this.code=code;}public String code(){return code;}
    }
}
