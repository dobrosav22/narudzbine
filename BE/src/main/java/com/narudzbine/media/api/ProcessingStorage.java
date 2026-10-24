package com.narudzbine.media.api;

/** Worker capability only: never injected into an HTTP controller. */
public interface ProcessingStorage {
    byte[] raw(String key,long bytes,String sha256);
    void processed(String key,byte[] bytes,String sha256,String mediaType);
}
