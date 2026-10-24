package com.narudzbine.media.api;
import java.time.Instant;
import java.util.*;
public interface MediaUploads {
    record Asset(UUID id,long revision,String state,String mediaType,Integer width,Integer height,String failureCode,Instant createdAt){}
    record Source(long bytes,String sha256,String mediaType){}
    record Claim(Asset asset,String key,UUID fence,boolean created,boolean replay){}
    record Cleanup(UUID id,UUID vendor,String key){}
    record Completion(Asset asset,boolean confirmed){}
    Asset read(UUID vendor,UUID id);
    Claim reserve(UUID vendor,UUID id,Source source);
    Completion complete(UUID vendor,UUID id,UUID fence);
    List<UUID> expiredCandidates(int limit);
    Optional<Cleanup> claimCleanup(UUID id);
    void deleted(Cleanup claim);
}
