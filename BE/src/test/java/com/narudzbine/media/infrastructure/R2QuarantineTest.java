package com.narudzbine.media.infrastructure;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.media.api.MediaFailure;
import com.sun.net.httpserver.*;
import java.net.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class R2QuarantineTest {
    @TempDir Path temp;private HttpServer server;private R2Quarantine storage;
    private byte[] stored;private final AtomicInteger puts=new AtomicInteger();private final AtomicReference<String> problem=new AtomicReference<>();
    private boolean lose,conditional,forbidden,marker,loseMarker,markerRace,concurrentMarker;private int markerAttempts;
    private static final String KEY="quarantine/01a15013-b677-7d60-ae6f-3b7c6717a37f/01a15013-b677-7aca-b445-961c6776aa93";
    private static final byte[] BODY=new byte[]{(byte)137,80,78,71,13,10,26,10,1,2,3};
    private static String sha(){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(BODY));}catch(Exception e){throw new IllegalStateException(e);}}
    private static String md5(){try{return Base64.getEncoder().encodeToString(MessageDigest.getInstance("MD5").digest(BODY));}catch(Exception e){throw new IllegalStateException(e);}}
    @BeforeEach void start()throws Exception{
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",this::handle);server.start();storage=new R2Quarantine(R2Quarantine.client(URI.create("http://127.0.0.1:"+server.getAddress().getPort()),"synthetic-access","synthetic-secret"),"synthetic-bucket");
    }
    @AfterEach void stop(){if(storage!=null){storage.close();}if(server!=null){server.stop(0);}assertThat(problem.get()).isNull();}
    private void handle(HttpExchange x)throws java.io.IOException{
        try{
            assertThat(x.getRequestURI().getPath()).isEqualTo("/synthetic-bucket/"+KEY);assertThat(x.getRequestHeaders().getFirst("Authorization")).startsWith("AWS4-HMAC-SHA256 ");
            switch(x.getRequestMethod()){
                case "HEAD"->{if(stored==null){x.sendResponseHeaders(404,-1);}else{x.getResponseHeaders().set("Content-Type","application/octet-stream");x.getResponseHeaders().set("Content-Length",Integer.toString(stored.length));x.getResponseHeaders().set("ETag","\"synthetic-object\"");if(marker){x.getResponseHeaders().set("x-amz-meta-tombstone","1");}x.getResponseHeaders().set("x-amz-meta-sha256",stored.length==BODY.length?sha():"mismatch");x.getResponseHeaders().set("x-amz-meta-source-type","image/png");x.sendResponseHeaders(200,-1);}}
                case "PUT"->{if("1".equals(x.getRequestHeaders().getFirst("x-amz-meta-tombstone"))){assertThat(x.getRequestBody().readAllBytes()).isEmpty();if(stored==null){assertThat(x.getRequestHeaders().getFirst("If-None-Match")).isEqualTo("*");}else{assertThat(x.getRequestHeaders().getFirst("If-Match")).isEqualTo("\"synthetic-object\"");}markerAttempts++;if(concurrentMarker){concurrentMarker=false;stored=new byte[0];marker=true;x.sendResponseHeaders(412,-1);break;}if(markerRace){markerRace=false;stored=BODY;marker=false;x.sendResponseHeaders(412,-1);break;}stored=new byte[0];marker=true;x.sendResponseHeaders(loseMarker?503:200,-1);break;}puts.incrementAndGet();assertThat(x.getRequestHeaders().getFirst("If-None-Match")).isEqualTo("*");assertThat(x.getRequestHeaders().getFirst("Content-Length")).isEqualTo(Integer.toString(BODY.length));assertThat(x.getRequestHeaders().getFirst("Content-MD5")).isEqualTo(md5());assertThat(x.getRequestHeaders().getFirst("Transfer-Encoding")).isNull();assertThat(x.getRequestHeaders().getFirst("x-amz-acl")).isNull();assertThat(x.getRequestBody().readAllBytes()).isEqualTo(BODY);if(forbidden){x.sendResponseHeaders(403,-1);}else if(conditional){stored=BODY;x.sendResponseHeaders(412,-1);}else{stored=BODY;x.sendResponseHeaders(lose?503:200,-1);}}
                case "DELETE"->throw new AssertionError("Unconditional deletion is forbidden");
                default->throw new AssertionError("Unexpected storage operation");
            }
        }catch(AssertionError e){problem.set(e.getMessage());x.sendResponseHeaders(500,-1);}finally{x.close();}
    }
    private void ensure()throws Exception{Path file=temp.resolve("raw");Files.write(file,BODY);storage.ensure(KEY,file,BODY.length,sha(),md5(),"image/png");}
    @Test void realSdkConditionalPrivateFixedLengthUploadAndReplay()throws Exception{ensure();ensure();assertThat(puts.get()).isEqualTo(1);assertThat(stored).isEqualTo(BODY);storage.delete(KEY);storage.delete(KEY);assertThat(stored).isEmpty();assertThat(marker).isTrue();assertThatThrownBy(this::ensure).isInstanceOf(MediaFailure.class);assertThat(puts.get()).isEqualTo(1);}
    @Test void committedObjectWithLostResponseReconcilesWithoutSecondPut()throws Exception{lose=true;assertThatThrownBy(this::ensure).isInstanceOf(MediaFailure.class);assertThat(puts.get()).isEqualTo(1);lose=false;ensure();assertThat(puts.get()).isEqualTo(1);}
    @Test void conditionalRaceReheadsWinnerInsteadOfOverwrite()throws Exception{conditional=true;ensure();assertThat(puts.get()).isEqualTo(1);}
    @Test void mismatchedExistingObjectFailsClosedAndIsNeverOverwritten(){stored=new byte[]{1};assertThatThrownBy(this::ensure).isInstanceOf(MediaFailure.class);assertThat(puts.get()).isZero();}
    @Test void authorizationFailureHasNoAutomaticRetry(){forbidden=true;assertThatThrownBy(this::ensure).isInstanceOf(MediaFailure.class);assertThat(puts.get()).isEqualTo(1);}
    @Test void lostMarkerResponseIsReconciledWithoutRawRecreation()throws Exception{ensure();loseMarker=true;assertThatThrownBy(()->storage.delete(KEY)).isInstanceOf(MediaFailure.class);assertThat(marker).isTrue();loseMarker=false;storage.delete(KEY);assertThat(markerAttempts).isEqualTo(1);assertThatThrownBy(this::ensure).isInstanceOf(MediaFailure.class);assertThat(puts.get()).isEqualTo(1);}
    @Test void lateRawWriteWinningMarkerRaceIsRemovedBeforeFinalFence()throws Exception{ensure();markerRace=true;storage.delete(KEY);assertThat(markerAttempts).isEqualTo(2);assertThat(marker).isTrue();assertThat(stored).isEmpty();assertThatThrownBy(this::ensure).isInstanceOf(MediaFailure.class);}
    @Test void staleObservedObjectCannotOverwriteConcurrentPermanentMarker()throws Exception{ensure();concurrentMarker=true;storage.delete(KEY);assertThat(markerAttempts).isEqualTo(1);assertThat(marker).isTrue();assertThat(stored).isEmpty();storage.delete(KEY);assertThat(markerAttempts).isEqualTo(1);assertThatThrownBy(this::ensure).isInstanceOf(MediaFailure.class);}
    @Test void providerCallsForbiddenInsideTransactionAndProductionEndpointIsRestricted(){TransactionSynchronizationManager.setActualTransactionActive(true);try{assertThatThrownBy(this::ensure).isInstanceOf(IllegalStateException.class);assertThatThrownBy(()->storage.delete(KEY)).isInstanceOf(IllegalStateException.class);}finally{TransactionSynchronizationManager.setActualTransactionActive(false);}assertThatThrownBy(()->new QuarantineConfiguration().r2("http://127.0.0.1","bucket","a","b")).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->new QuarantineConfiguration().r2("https://"+"a".repeat(32)+".r2.cloudflarestorage.com","bucket","a","b")).isInstanceOf(IllegalArgumentException.class);}
}
