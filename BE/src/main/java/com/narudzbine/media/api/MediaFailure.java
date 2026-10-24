package com.narudzbine.media.api;
public final class MediaFailure extends RuntimeException {
    private final String code;
    public MediaFailure(String code){super(code);this.code=code;}
    public String code(){return code;}
}
