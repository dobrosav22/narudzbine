package com.narudzbine.media.api;

/** Processed-only bounded delivery capability; deliberately no raw access. */
public interface ProcessedContentStorage {
    byte[] content(String key,long bytes,String sha256);
}
