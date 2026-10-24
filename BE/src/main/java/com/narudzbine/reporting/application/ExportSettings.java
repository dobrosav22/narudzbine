package com.narudzbine.reporting.application;

import com.narudzbine.shared.api.SecretEnvelope;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public final class ExportSettings {
    private final SecretEnvelope envelope;private final boolean accepting;
    public ExportSettings(@Value("${reporting.exports.enabled:false}") boolean enabled,@Value("${reporting.exports.artifact-key:}") String key,@Value("${reporting.exports.accepting:true}") boolean accepting) {
        this.accepting=accepting;
        if(!enabled){envelope=null;return;}
        try {envelope=new SecretEnvelope(Base64.getDecoder().decode(key),"commercial-export/v1");}
        catch(IllegalArgumentException e){throw new IllegalStateException("Explicit isolated256-bit export artifact key required");}
    }
    public boolean enabled(){return envelope!=null;}
    public boolean accepting(){return envelope!=null&&accepting;}
    SecretEnvelope envelope(){if(envelope==null)throw new com.narudzbine.reporting.api.ExportFailure("SERVICE_UNAVAILABLE");return envelope;}
}
