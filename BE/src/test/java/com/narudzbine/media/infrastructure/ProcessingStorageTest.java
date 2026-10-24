package com.narudzbine.media.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.media.api.MediaFailure;
import com.sun.net.httpserver.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class ProcessingStorageTest {
    private record Stored(byte[] bytes,String sha,String type) {}
    private HttpServer server;private R2Quarantine storage;private final Map<String,Stored> objects=new HashMap<>();
    private final AtomicReference<String> problem=new AtomicReference<>();private int puts;private boolean lose,corrupt,oversized;
    private static final String ID="01a15013-b677-7d60-ae6f-3b7c6717a37f/01a15013-b677-7aca-b445-961c6776aa93";
    private static final String RAW="quarantine/"+ID,PROCESSED="processed/"+ID;private static final byte[] BYTES={1,2,3,4};
    private static String sha(byte[] bytes)throws Exception {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    @BeforeEach void start()throws Exception {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",this::handle);server.start();
        storage=new R2Quarantine(R2Quarantine.client(URI.create("http://127.0.0.1:"+server.getAddress().getPort()),"synthetic-access","synthetic-secret"),"synthetic-bucket");
        objects.put(RAW,new Stored(BYTES,sha(BYTES),"image/png"));
    }
    private void handle(HttpExchange x)throws java.io.IOException {
        try {
            String key=x.getRequestURI().getPath().substring("/synthetic-bucket/".length());
            assertThat(x.getRequestHeaders().getFirst("Authorization")).startsWith("AWS4-HMAC-SHA256 ");
            if(x.getRequestMethod().equals("DELETE")){throw new AssertionError("Unconditional deletion is forbidden");}
            if(x.getRequestMethod().equals("PUT")) {
                if("1".equals(x.getRequestHeaders().getFirst("x-amz-meta-tombstone"))){if(objects.containsKey(key)){assertThat(x.getRequestHeaders().getFirst("If-Match")).isEqualTo("\"synthetic-object\"");}else{assertThat(x.getRequestHeaders().getFirst("If-None-Match")).isEqualTo("*");}assertThat(x.getRequestBody().readAllBytes()).isEmpty();objects.put(key,new Stored(new byte[0],"tombstone","image/png"));x.sendResponseHeaders(200,-1);return;}
                puts++;assertThat(x.getRequestHeaders().getFirst("If-None-Match")).isEqualTo("*");assertThat(x.getRequestHeaders().getFirst("Cache-Control")).isEqualTo("private, no-store");assertThat(x.getRequestHeaders().getFirst("x-amz-acl")).isNull();assertThat(x.getRequestHeaders().getFirst("Content-MD5")).isEqualTo("CNbAWiFRKnmh3+udKo8mLw==");
                byte[] bytes=x.getRequestBody().readAllBytes();assertThat(bytes).isEqualTo(BYTES);
                var previous=objects.putIfAbsent(key,new Stored(bytes,x.getRequestHeaders().getFirst("x-amz-meta-sha256"),x.getRequestHeaders().getFirst("x-amz-meta-source-type")));
                x.sendResponseHeaders(previous!=null?412:lose?503:200,-1);return;
            }
            var value=objects.get(key);if(value==null) {x.sendResponseHeaders(404,-1);return;}
            x.getResponseHeaders().set("ETag","\"synthetic-object\"");x.getResponseHeaders().set("Content-Type","application/octet-stream");x.getResponseHeaders().set("x-amz-meta-sha256",value.sha());x.getResponseHeaders().set("x-amz-meta-source-type",value.type());
            if(value.sha().equals("tombstone"))x.getResponseHeaders().set("x-amz-meta-tombstone","1");
            if(x.getRequestMethod().equals("HEAD")) {x.getResponseHeaders().set("Content-Length",Integer.toString(value.bytes().length));x.sendResponseHeaders(200,-1);}
            else if(x.getRequestMethod().equals("GET")) {byte[] bytes=corrupt?new byte[]{9,9,9,9}:value.bytes();x.sendResponseHeaders(200,oversized?5242881:bytes.length);x.getResponseBody().write(bytes);}
            else throw new AssertionError("Unexpected operation");
        }catch(AssertionError failure){problem.set(failure.getMessage());x.sendResponseHeaders(500,-1);}finally{x.close();}
    }
    @AfterEach void stop(){storage.close();server.stop(0);assertThat(problem.get()).isNull();}
    @Test void rawReadAndConditionalProcessedWriteVerifyActualRetainedBytes()throws Exception{assertThat(storage.raw(RAW,4,sha(BYTES))).isEqualTo(BYTES);storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png");storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png");assertThat(puts).isEqualTo(1);}
    @Test void processedDeliveryReadsOnlyVerifiedProcessedBytes()throws Exception{storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png");assertThat(storage.content(PROCESSED,4,sha(BYTES))).isEqualTo(BYTES);assertThatThrownBy(()->storage.content(RAW,4,sha(BYTES))).isInstanceOf(IllegalArgumentException.class);corrupt=true;assertThatThrownBy(()->storage.content(PROCESSED,4,sha(BYTES))).isInstanceOf(MediaFailure.class);}
    @Test void lostProcessedResponseReconcilesWithoutAnotherWrite()throws Exception{lose=true;assertThatThrownBy(()->storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png")).isInstanceOf(MediaFailure.class);assertThat(puts).isEqualTo(1);lose=false;storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png");assertThat(puts).isEqualTo(1);}
    @Test void bodyHashMismatchCannotBecomeVerifiedProcessedProof()throws Exception{corrupt=true;assertThatThrownBy(()->storage.raw(RAW,4,sha(BYTES))).isInstanceOf(MediaFailure.class);assertThatThrownBy(()->storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png")).isInstanceOf(MediaFailure.class);}
    @Test void oversizedReadIsRejectedBeforeReadingUnboundedBody()throws Exception{oversized=true;assertThatThrownBy(()->storage.raw(RAW,4,sha(BYTES))).isInstanceOf(MediaFailure.class);}
    @Test void differentExistingObjectCannotBeOverwritten()throws Exception{objects.put(PROCESSED,new Stored(new byte[]{9},"different","image/png"));assertThatThrownBy(()->storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png")).isInstanceOf(MediaFailure.class);assertThat(puts).isZero();}
    @Test void processedCleanupRemovesBytesAndPermanentlyFencesLateConditionalWrites()throws Exception{storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png");storage.fenceProcessed(PROCESSED);storage.fenceProcessed(PROCESSED);assertThat(objects.get(PROCESSED).bytes()).isEmpty();assertThatThrownBy(()->storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png")).isInstanceOf(MediaFailure.class);assertThat(puts).isEqualTo(1);}
    @Test void workerCapabilityRejectsForeignPathsAndTransactions()throws Exception{assertThatThrownBy(()->storage.raw(PROCESSED,4,sha(BYTES))).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->storage.processed(RAW,BYTES,sha(BYTES),"image/png")).isInstanceOf(IllegalArgumentException.class);TransactionSynchronizationManager.setActualTransactionActive(true);try{assertThatThrownBy(()->storage.raw(RAW,4,sha(BYTES))).isInstanceOf(IllegalStateException.class);assertThatThrownBy(()->storage.processed(PROCESSED,BYTES,sha(BYTES),"image/png")).isInstanceOf(IllegalStateException.class);}finally{TransactionSynchronizationManager.setActualTransactionActive(false);}}
}
