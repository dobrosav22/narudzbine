package com.narudzbine.media.infrastructure;

import com.narudzbine.media.api.*;
import java.nio.file.Path;
import java.time.Duration;
import java.net.URI;
import java.util.Map;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.checksums.*;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.StandardRetryStrategy;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;

/** Private conditional writes and worker-only reads; no presign/public ACL capability. */
public final class R2Quarantine implements PrivateQuarantine,ProcessingStorage,ProcessedContentStorage,AutoCloseable {
    private final S3Client s3;private final String bucket;
    R2Quarantine(S3Client s3,String bucket){this.s3=s3;this.bucket=bucket;}
    static S3Client client(URI endpoint,String access,String secret){
        return S3Client.builder().endpointOverride(endpoint).region(Region.of("auto"))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(access,secret)))
            .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(10)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).chunkedEncodingEnabled(false).build())
            .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED).responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
            .overrideConfiguration(c->c.retryStrategy(StandardRetryStrategy.builder().maxAttempts(1).build()).apiCallTimeout(Duration.ofSeconds(15)).apiCallAttemptTimeout(Duration.ofSeconds(12))).build();
    }
    @Override public void ensure(String key,Path file,long bytes,String sha256,String md5,String mediaType){
        outside();key(key);
        try{
            if(matches(key,bytes,sha256,mediaType)){return;}
            try{s3.putObject(PutObjectRequest.builder().bucket(bucket).key(key).ifNoneMatch("*").contentType("application/octet-stream").cacheControl("private, no-store").contentMD5(md5).metadata(Map.of("sha256",sha256,"source-type",mediaType)).build(),RequestBody.fromFile(file));}
            catch(S3Exception conditional){if(conditional.statusCode()!=412&&conditional.statusCode()!=409){throw conditional;}}
            if(!matches(key,bytes,sha256,mediaType)){throw unavailable();}
        }catch(MediaFailure failure){throw failure;}catch(RuntimeException failure){throw unavailable();}
    }
    private boolean matches(String key,long bytes,String sha256,String mediaType){
        try{var head=s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            if(head.contentLength()!=bytes||!sha256.equals(head.metadata().get("sha256"))||!mediaType.equals(head.metadata().get("source-type"))||!"application/octet-stream".equals(head.contentType())){throw unavailable();}return true;
        }catch(S3Exception missing){if(missing.statusCode()==404){return false;}throw missing;}
    }
    @Override public void delete(String key){
        outside();key(key);remove(key);
    }
    @Override public void fenceProcessed(String key){
        outside();if(key==null||!key.matches("processed/[0-9a-f-]{36}/[0-9a-f-]{36}")){throw new IllegalArgumentException("Invalid processed key");}remove(key);
    }
    private void remove(String key){
        try{
            for(int attempt=0;attempt<3;attempt++){
                String etag=null;
                try{var head=s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());if(marker(head)){return;}etag=head.eTag();if(etag==null||etag.isBlank()){throw unavailable();}}
                catch(S3Exception missing){if(missing.statusCode()!=404){throw missing;}}
                try{var put=PutObjectRequest.builder().bucket(bucket).key(key).contentType("application/octet-stream").cacheControl("private, no-store").metadata(Map.of("tombstone","1"));if(etag==null){put.ifNoneMatch("*");}else{put.ifMatch(etag);}s3.putObject(put.build(),RequestBody.empty());}
                catch(S3Exception conflict){if(conflict.statusCode()!=409&&conflict.statusCode()!=412){throw conflict;}}
                var head=s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());if(marker(head)){return;}
            }
            throw unavailable();
        }catch(MediaFailure failure){throw failure;}catch(RuntimeException failure){throw unavailable();}
    }
    private static boolean marker(HeadObjectResponse head){return head.contentLength()==0&&"1".equals(head.metadata().get("tombstone"))&&"application/octet-stream".equals(head.contentType());}
    @Override public byte[] raw(String key,long bytes,String sha256){outside();key(key);return read(key,bytes,sha256);}
    @Override public byte[] content(String key,long bytes,String sha256){outside();if(key==null||!key.matches("processed/[0-9a-f-]{36}/[0-9a-f-]{36}")){throw new IllegalArgumentException("Invalid processed key");}return read(key,bytes,sha256);}
    @Override public void processed(String key,byte[] bytes,String sha256,String mediaType){
        outside();if(key==null||!key.matches("processed/[0-9a-f-]{36}/[0-9a-f-]{36}")||bytes.length<1||bytes.length>5242880||!java.util.Set.of("image/jpeg","image/png","image/webp").contains(mediaType)){throw new IllegalArgumentException("Invalid processed object");}
        try{
            if(!sha256.equals(hash(bytes,"SHA-256",false))){throw new IllegalArgumentException("Processed hash differs");}
            if(!matches(key,bytes.length,sha256,mediaType)){
                try{s3.putObject(PutObjectRequest.builder().bucket(bucket).key(key).ifNoneMatch("*").contentType("application/octet-stream").cacheControl("private, no-store").contentMD5(hash(bytes,"MD5",true)).metadata(Map.of("sha256",sha256,"source-type",mediaType)).build(),RequestBody.fromBytes(bytes));}
                catch(S3Exception conflict){if(conflict.statusCode()!=409&&conflict.statusCode()!=412){throw conflict;}}
            }
            if(!matches(key,bytes.length,sha256,mediaType)){throw unavailable();}
            read(key,bytes.length,sha256); // Verify retained bytes, not only client-controlled metadata.
        }catch(MediaFailure failure){throw failure;}catch(RuntimeException failure){throw unavailable();}
    }
    private byte[] read(String key,long bytes,String sha){
        if(bytes<1||bytes>5242880||sha==null||!sha.matches("[0-9a-f]{64}")){throw new IllegalArgumentException("Invalid read identity");}
        try(var input=s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())){
            if(input.response().contentLength()!=bytes||!"application/octet-stream".equals(input.response().contentType())||!sha.equals(input.response().metadata().get("sha256"))){throw unavailable();}
            byte[] value=input.readNBytes((int)bytes+1);if(value.length!=bytes||!sha.equals(hash(value,"SHA-256",false))){throw unavailable();}return value;
        }catch(MediaFailure failure){throw failure;}catch(Exception failure){throw unavailable();}
    }
    private static String hash(byte[] bytes,String algorithm,boolean base64){try{byte[] hash=java.security.MessageDigest.getInstance(algorithm).digest(bytes);return base64?java.util.Base64.getEncoder().encodeToString(hash):java.util.HexFormat.of().formatHex(hash);}catch(java.security.NoSuchAlgorithmException failure){throw new IllegalStateException(failure);}}
    private static void key(String key){if(key==null||!key.matches("quarantine/[0-9a-f-]{36}/[0-9a-f-]{36}")){throw new IllegalArgumentException("Invalid quarantine key");}}
    private static void outside(){if(TransactionSynchronizationManager.isActualTransactionActive()){throw new IllegalStateException("Storage must run outside transactions");}}
    private static MediaFailure unavailable(){return new MediaFailure("SERVICE_UNAVAILABLE");}
    @Override public void close(){s3.close();}
}
