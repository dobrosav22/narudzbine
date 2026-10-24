package com.narudzbine.media.api;

public interface ImageProcessor {
    record Image(byte[] bytes,String mediaType,int width,int height) {}
    Image process(byte[] source,String mediaType);
}
