package com.narudzbine.media.api;

import java.util.UUID;
public interface MediaAssets {
    /** Internal routing only, never evidence of authorization. */
    record Route(UUID vendor,UUID product) {}
    record Proof(UUID id,UUID vendor,String key,String sha256,int bytes,String mediaType) {}
    Route route(UUID id);
    Proof proof(UUID id);
}
