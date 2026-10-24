package com.narudzbine.audit.api;
import java.util.UUID;
public final class PrivacyFailure extends RuntimeException {
    private final String code;private final UUID resource;
    public PrivacyFailure(String code){this(code,null);}
    public PrivacyFailure(String code,UUID resource){super("Privacy request could not be completed");this.code=code;this.resource=resource;}
    public String code(){return code;}
    public UUID resource(){return resource;}
}
