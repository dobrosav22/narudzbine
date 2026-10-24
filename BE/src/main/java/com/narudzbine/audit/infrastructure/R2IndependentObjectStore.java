package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.*;
import java.net.URI;
import java.time.Duration;
import java.util.*;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.checksums.*;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.retries.StandardRetryStrategy;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;

/** Dedicated independent bucket/client only; no deletion, overwrite, public URL or credential reuse helper. */
public final class R2IndependentObjectStore implements IndependentObjects,AutoCloseable {
    private static final String PREFIX="independent-evidence/v1/";
    private final S3Client client;private final String bucket;
    public R2IndependentObjectStore(S3Client client,String bucket){if(client==null||bucket==null||!bucket.matches("[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]"))throw new IllegalArgumentException("Explicit dedicated evidence bucket required");this.client=client;this.bucket=bucket;}
    public static S3Client client(URI endpoint,String access,String secret){
        if(endpoint==null||!"https".equals(endpoint.getScheme())||endpoint.getHost()==null||endpoint.getUserInfo()!=null||endpoint.getQuery()!=null||endpoint.getFragment()!=null||access==null||access.isBlank()||secret==null||secret.isBlank())throw new IllegalArgumentException("Explicit private evidence provider configuration required");
        return S3Client.builder().endpointOverride(endpoint).region(Region.of("auto")).credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(access,secret)))
            .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(10)))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).chunkedEncodingEnabled(false).build())
            .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED).responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
            .overrideConfiguration(c->c.retryStrategy(StandardRetryStrategy.builder().maxAttempts(1).build()).apiCallTimeout(Duration.ofSeconds(15)).apiCallAttemptTimeout(Duration.ofSeconds(12))).build();
    }
    @Override public boolean create(Key key,byte[] ciphertext){
        IndependentEvidence.outside();if(ciphertext==null||ciphertext.length<1||ciphertext.length>MAX_OBJECT)throw new EvidenceFailure("EVIDENCE_SIZE_LIMIT");
        byte[] snapshot=ciphertext.clone();try{client.putObject(PutObjectRequest.builder().bucket(bucket).key(PREFIX+key.path()).ifNoneMatch("*").contentType("application/octet-stream").cacheControl("private, no-store").metadata(Map.of("format","nzev1","sha256",IndependentEvidence.hash(snapshot))).build(),RequestBody.fromBytes(snapshot));return true;}
        catch(S3Exception conflict){if(conflict.statusCode()==409||conflict.statusCode()==412)return false;throw unavailable();}catch(RuntimeException failure){throw unavailable();}
    }
    @Override public Optional<byte[]> read(Key key){
        IndependentEvidence.outside();try(var input=client.getObject(GetObjectRequest.builder().bucket(bucket).key(PREFIX+key.path()).build())){
            boolean verified=false;
            try{
                var response=input.response();long size=response.contentLength();String digest=response.metadata().get("sha256");
                if(size<1||size>MAX_OBJECT||!"application/octet-stream".equals(response.contentType())||!"nzev1".equals(response.metadata().get("format"))||digest==null||!digest.matches("[0-9a-f]{64}"))throw unavailable();
                byte[] bytes=new byte[(int)size+1];int count=0;long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(15);
                while(count<bytes.length){if(System.nanoTime()-deadline>=0)throw unavailable();int read=input.read(bytes,count,Math.min(8192,bytes.length-count));if(read<0)break;if(read==0)continue;count+=read;}
                if(count!=size||System.nanoTime()-deadline>=0)throw unavailable();bytes=Arrays.copyOf(bytes,count);if(!IndependentEvidence.hash(bytes).equals(digest))throw unavailable();verified=true;return Optional.of(bytes);
            }finally{if(!verified)input.abort();} // Do not drain an oversized/corrupt/unverified response on close.

        }catch(S3Exception missing){if(missing.statusCode()==404)return Optional.empty();throw unavailable();}catch(EvidenceFailure failure){throw failure;}catch(Exception failure){throw unavailable();}
    }
    @Override public Page list(Family family,int size,Key after){
        IndependentEvidence.outside();FileIndependentObjectStore.page(family,size,after);try{
            var request=ListObjectsV2Request.builder().bucket(bucket).prefix(PREFIX+family.path()+"/").maxKeys(size);if(after!=null)request.startAfter(PREFIX+after.path());
            var response=client.listObjectsV2(request.build());if(response.contents().size()>size)throw unavailable();var keys=new ArrayList<Key>();String previous=after==null?"":after.path();
            for(var object:response.contents()){String path=object.key();if(path==null||!path.startsWith(PREFIX))throw unavailable();Key key;
                try{key=Key.parse(family,path.substring(PREFIX.length()));}catch(IllegalArgumentException failure){throw unavailable();}
                if(key.path().compareTo(previous)<=0)throw unavailable();keys.add(key);previous=key.path();
            }
            if(Boolean.TRUE.equals(response.isTruncated())&&keys.isEmpty())throw unavailable();return new Page(keys,Boolean.TRUE.equals(response.isTruncated()));
        }catch(EvidenceFailure failure){throw failure;}catch(RuntimeException failure){throw unavailable();}
    }
    private static EvidenceFailure unavailable(){return new EvidenceFailure("EVIDENCE_STORE_UNAVAILABLE");}
    @Override public void close(){client.close();}
}
