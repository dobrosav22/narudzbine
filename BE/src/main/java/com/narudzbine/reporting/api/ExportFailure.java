package com.narudzbine.reporting.api;

import java.util.UUID;

public final class ExportFailure extends RuntimeException {
    private final String code;private final UUID resource;
    public ExportFailure(String code){this(code,null);}
    public ExportFailure(String code,UUID resource){super("Export request unavailable");this.code=code;this.resource=resource;}
    public String code(){return code;}
    public UUID resource(){return resource;}
}
