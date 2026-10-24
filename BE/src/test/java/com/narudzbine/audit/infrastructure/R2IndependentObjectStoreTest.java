package com.narudzbine.audit.infrastructure;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.audit.api.*;
import com.sun.net.httpserver.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.checksums.*;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.StandardRetryStrategy;
import software.amazon.awssdk.services.s3.*;
class R2IndependentObjectStoreTest {
 private HttpServer server;private R2IndependentObjectStore store;private final Map<String,byte[]> objects=new TreeMap<>();private final Map<String,String> digests=new HashMap<>();private final AtomicReference<String> problem=new AtomicReference<>();
 private boolean lose,forbidden,corrupt,wrongType,oversized,conditional;private int puts;
 private IndependentObjects.Key key(long sequence){return new IndependentObjects.Key(IndependentObjects.Family.DELETION_INTENT,UUID.fromString("019a0000-0000-7000-8000-000000000001"),sequence);}
 private IndependentEvidence evidence(){byte[] key=new byte[32];key[0]=1;return new IndependentEvidence(store,Map.of("v1",key),"v1",List.of());}
 @BeforeEach void start()throws Exception{
  server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);server.createContext("/",this::handle);server.start();
  // Loopback-only harness deliberately supplies its own SDK client. The production factory requires HTTPS.
  var client=S3Client.builder().endpointOverride(URI.create("http://127.0.0.1:"+server.getAddress().getPort())).region(Region.of("auto")).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("synthetic-access","synthetic-secret")))
   .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(10))).serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).chunkedEncodingEnabled(false).build()).requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED).responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
   .overrideConfiguration(c->c.retryStrategy(StandardRetryStrategy.builder().maxAttempts(1).build()).apiCallTimeout(Duration.ofSeconds(15)).apiCallAttemptTimeout(Duration.ofSeconds(12))).build();
  store=new R2IndependentObjectStore(client,"synthetic-evidence");
 }
 @AfterEach void stop(){if(store!=null)store.close();if(server!=null)server.stop(0);assertThat(problem.get()).isNull();}
 private void handle(HttpExchange request)throws java.io.IOException{
  try{
   assertThat(request.getRequestHeaders().getFirst("Authorization")).startsWith("AWS4-HMAC-SHA256 ");String path=request.getRequestURI().getPath();assertThat(path).startsWith("/synthetic-evidence");
   if(request.getRequestMethod().equals("GET")&&request.getRequestURI().getQuery()!=null){listing(request);return;}
   assertThat(path).startsWith("/synthetic-evidence/independent-evidence/v1/");String name=path.substring("/synthetic-evidence/".length());
   switch(request.getRequestMethod()){
    case "PUT"->{puts++;assertThat(request.getRequestHeaders().getFirst("If-None-Match")).isEqualTo("*");assertThat(request.getRequestHeaders().getFirst("x-amz-acl")).isNull();assertThat(request.getRequestHeaders().getFirst("Cache-Control")).isEqualTo("private, no-store");assertThat(request.getRequestHeaders().getFirst("Transfer-Encoding")).isNull();byte[] bytes=request.getRequestBody().readAllBytes();assertThat(request.getRequestHeaders().getFirst("Content-Length")).isEqualTo(Integer.toString(bytes.length));assertThat(request.getRequestHeaders().getFirst("x-amz-meta-format")).isEqualTo("nzev1");assertThat(request.getRequestHeaders().getFirst("x-amz-meta-sha256")).isEqualTo(IndependentEvidence.hash(bytes));
     if(forbidden){request.sendResponseHeaders(403,-1);break;}if(objects.containsKey(name)){request.sendResponseHeaders(412,-1);break;}objects.put(name,bytes);digests.put(name,IndependentEvidence.hash(bytes));request.sendResponseHeaders(lose?503:conditional?412:200,-1);
    }
    case "GET"->{byte[] bytes=objects.get(name);if(bytes==null){request.sendResponseHeaders(404,-1);break;}bytes=bytes.clone();if(corrupt)bytes[bytes.length-1]^=1;request.getResponseHeaders().set("Content-Type",wrongType?"application/json":"application/octet-stream");request.getResponseHeaders().set("x-amz-meta-format","nzev1");request.getResponseHeaders().set("x-amz-meta-sha256",digests.get(name));request.sendResponseHeaders(200,oversized?IndependentObjects.MAX_OBJECT+1:bytes.length);request.getResponseBody().write(bytes);}
    default->throw new AssertionError("Evidence adapter must not overwrite/delete/presign or use an unexpected request");
   }
  }catch(AssertionError failure){problem.set(failure.getMessage());request.sendResponseHeaders(500,-1);}finally{request.close();}
 }
 private void listing(HttpExchange request)throws java.io.IOException{
  assertThat(request.getRequestMethod()).isEqualTo("GET");var parameters=new HashMap<String,String>();for(String part:request.getRequestURI().getRawQuery().split("&")){String[] pair=part.split("=",2);parameters.put(URLDecoder.decode(pair[0],StandardCharsets.UTF_8),pair.length>1?URLDecoder.decode(pair[1],StandardCharsets.UTF_8):"");}
  assertThat(parameters.get("list-type")).isEqualTo("2");int size=Integer.parseInt(parameters.get("max-keys"));assertThat(size).isBetween(1,1000);String prefix=parameters.get("prefix"),after=parameters.getOrDefault("start-after","");var selected=objects.keySet().stream().filter(k->k.startsWith(prefix)&&k.compareTo(after)>0).toList();boolean more=selected.size()>size;selected=selected.subList(0,Math.min(size,selected.size()));var xml=new StringBuilder("<ListBucketResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\"><IsTruncated>"+more+"</IsTruncated>");for(String name:selected)xml.append("<Contents><Key>").append(name).append("</Key><Size>").append(objects.get(name).length).append("</Size></Contents>");xml.append("</ListBucketResult>");byte[] bytes=xml.toString().getBytes(StandardCharsets.UTF_8);request.getResponseHeaders().set("Content-Type","application/xml");request.sendResponseHeaders(200,bytes.length);request.getResponseBody().write(bytes);
 }
 @Test void actualSdkUsesConditionalPrivateWritesAndVerifiedGetWithoutOverwrite(){var service=evidence();byte[] plain="Synthetic intent".getBytes(StandardCharsets.UTF_8);var receipt=service.ensure(key(1),plain);assertThat(service.ensure(key(1),plain)).isEqualTo(receipt);assertThat(service.read(key(1)).orElseThrow().bytes()).isEqualTo(plain);assertThat(puts).isEqualTo(1);assertThatThrownBy(()->service.ensure(key(1),new byte[]{1})).isInstanceOf(EvidenceFailure.class);assertThat(puts).isEqualTo(1);}
 @Test void lostPutResponseIsResolvedByReadBackAndNoSecondPut(){lose=true;assertThat(evidence().ensure(key(1),new byte[]{1}).bytes()).isGreaterThan(28);assertThat(puts).isEqualTo(1);}
 @Test void conditionalWinnerIsReadBackInsteadOfBeingOverwritten(){conditional=true;assertThat(evidence().ensure(key(1),new byte[]{1}).ciphertextSha256()).matches("[0-9a-f]{64}");assertThat(puts).isEqualTo(1);}
 @Test void providerDenialHasNoAutomaticRetryOrVerifiedReceipt(){forbidden=true;assertThatThrownBy(()->evidence().ensure(key(1),new byte[]{1})).isInstanceOf(EvidenceFailure.class);assertThat(puts).isEqualTo(1);assertThat(objects).isEmpty();}
 @Test void actualCiphertextDigestTypeAndLengthAreValidated(){var service=evidence();service.ensure(key(1),new byte[]{1});corrupt=true;assertThatThrownBy(()->service.read(key(1))).isInstanceOf(EvidenceFailure.class);corrupt=false;wrongType=true;assertThatThrownBy(()->service.read(key(1))).isInstanceOf(EvidenceFailure.class);wrongType=false;oversized=true;assertThatThrownBy(()->service.read(key(1))).isInstanceOf(EvidenceFailure.class);}
 @Test void actualSdkListsOnlyTheBoundedFamilyAndCursor(){var service=evidence();for(int i=1;i<=5;i++)service.ensure(key(i),new byte[]{1});var page=service.list(key(1).family(),2,null);assertThat(page.keys()).containsExactly(key(1),key(2));assertThat(page.more()).isTrue();assertThat(service.list(key(1).family(),2,key(2)).keys()).containsExactly(key(3),key(4));assertThat(service.list(key(1).family(),2,key(4)).more()).isFalse();}
 @Test void rejectedStreamingResponseIsAbortedInsteadOfDrained(){
  var client=org.mockito.Mockito.mock(S3Client.class);var head=software.amazon.awssdk.services.s3.model.GetObjectResponse.builder().contentLength((long)IndependentObjects.MAX_OBJECT+1).contentType("application/octet-stream").metadata(Map.of("format","nzev1","sha256","a".repeat(64))).build();
  var response=org.mockito.Mockito.spy(new software.amazon.awssdk.core.ResponseInputStream<>(head,software.amazon.awssdk.http.AbortableInputStream.create(new java.io.ByteArrayInputStream(new byte[]{1}))));
  org.mockito.Mockito.when(client.getObject(org.mockito.ArgumentMatchers.any(software.amazon.awssdk.services.s3.model.GetObjectRequest.class))).thenReturn(response);
  try(var isolated=new R2IndependentObjectStore(client,"synthetic-evidence")){assertThatThrownBy(()->isolated.read(key(1))).isInstanceOf(EvidenceFailure.class);org.mockito.Mockito.verify(response).abort();}
 }
 @Test void transactionIoAndUnsafeProductionEndpointsAreRejected(){TransactionSynchronizationManager.setActualTransactionActive(true);try{assertThatThrownBy(()->store.create(key(1),new byte[]{1})).isInstanceOf(IllegalStateException.class);assertThatThrownBy(()->store.read(key(1))).isInstanceOf(IllegalStateException.class);assertThatThrownBy(()->store.list(key(1).family(),1,null)).isInstanceOf(IllegalStateException.class);}finally{TransactionSynchronizationManager.setActualTransactionActive(false);}assertThat(puts).isZero();assertThatThrownBy(()->R2IndependentObjectStore.client(URI.create("http://unconfigured.invalid"),"synthetic","synthetic")).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->R2IndependentObjectStore.client(URI.create("https://unconfigured.invalid?query=1"),"synthetic","synthetic")).isInstanceOf(IllegalArgumentException.class);}
}
