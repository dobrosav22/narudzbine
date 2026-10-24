package com.narudzbine.audit.api;

public final class EvidenceFailure extends RuntimeException {
    private final String code;
    public EvidenceFailure(String code){super("Independent evidence could not be verified");this.code=code;}
    public String code(){return code;}
}
