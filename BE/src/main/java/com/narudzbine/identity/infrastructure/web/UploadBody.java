package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.media.api.MediaFailure;
import jakarta.servlet.http.HttpServletRequest;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.util.*;

final class UploadBody implements AutoCloseable {
    final Path path;final long bytes;final String sha256,md5,mediaType;
    private UploadBody(Path path,long bytes,String sha,String md5,String type){this.path=path;this.bytes=bytes;this.sha256=sha;this.md5=md5;this.mediaType=type;}
    static UploadBody read(HttpServletRequest request){
        String declared=request.getContentType();if(declared==null||!Set.of("application/octet-stream","image/png","image/jpeg","image/webp").contains(declared.toLowerCase(Locale.ROOT))||request.getHeader("Content-Encoding")!=null){throw new AuthHttpFailure(415,"UNSUPPORTED_MEDIA_TYPE");}
        Path path=null;
        try{
            path=Files.createTempFile("narudzbine-raw-",".quarantine");var sha=MessageDigest.getInstance("SHA-256");var md5=MessageDigest.getInstance("MD5");long size=0;byte[] header=new byte[12];int headerSize=0;
            try(var input=request.getInputStream();var out=Files.newOutputStream(path)){
                byte[] buffer=new byte[8192];for(int n;(n=input.read(buffer))!=-1;){if(n==0){continue;}size+=n;if(size>5242880){throw new AuthHttpFailure(413,"PAYLOAD_TOO_LARGE");}int take=Math.min(n,12-headerSize);if(take>0){System.arraycopy(buffer,0,header,headerSize,take);headerSize+=take;}sha.update(buffer,0,n);md5.update(buffer,0,n);out.write(buffer,0,n);}
            }
            String type=sniff(header,headerSize);if(type==null||(!declared.equalsIgnoreCase("application/octet-stream")&&!declared.equalsIgnoreCase(type))){throw new AuthHttpFailure(415,"UNSUPPORTED_MEDIA_TYPE");}
            return new UploadBody(path,size,HexFormat.of().formatHex(sha.digest()),Base64.getEncoder().encodeToString(md5.digest()),type);
        }catch(IOException|GeneralSecurityException failure){delete(path);throw new MediaFailure("SERVICE_UNAVAILABLE");}catch(RuntimeException failure){delete(path);throw failure;}
    }
    static String sniff(byte[] h,int length){if(length>=3&&(h[0]&255)==255&&(h[1]&255)==216&&(h[2]&255)==255){return "image/jpeg";}if(length>=8&&Arrays.equals(Arrays.copyOf(h,8),new byte[]{(byte)137,80,78,71,13,10,26,10})){return "image/png";}if(length>=12&&h[0]==82&&h[1]==73&&h[2]==70&&h[3]==70&&h[8]==87&&h[9]==69&&h[10]==66&&h[11]==80){return "image/webp";}return null;}
    private static void delete(Path path){if(path!=null){try{Files.deleteIfExists(path);}catch(IOException failure){throw new MediaFailure("SERVICE_UNAVAILABLE");}}}
    @Override public void close(){delete(path);}
    @Override public String toString(){return "UploadBody[redacted]";}
}
