package com.narudzbine.reporting.application;

import com.narudzbine.audit.api.PrivacyFailure;
import com.narudzbine.shared.api.SecretEnvelope;
import java.security.MessageDigest;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** An explicit separate key/domain protects the case-linked derivative, never operator-visible content. */
@Component
public final class PortableExportSettings {
    static final int MAX_BYTES=16*1024*1024;
    static final int MAX_RECORDS=100_000;
    static final long STORAGE_BYTES=128L*1024*1024;
    private final SecretEnvelope envelope;
    private final boolean accepting,worker;
    public PortableExportSettings(@Value("${privacy.exports.enabled:false}") boolean enabled,
            @Value("${privacy.exports.worker-enabled:false}") boolean worker,
            @Value("${privacy.exports.accepting:true}") boolean accepting,
            @Value("${identity.http.enabled:false}") boolean identity,
            @Value("${privacy.exports.artifact-key:}") String key,
            @Value("${reporting.exports.artifact-key:}") String csvKey){
        if(!enabled){if(worker)throw new IllegalStateException("Portable export worker requires its feature gate");envelope=null;this.accepting=false;this.worker=false;return;}
        if(!identity)throw new IllegalStateException("Portable exports require authenticated HTTP");
        byte[] decoded;
        try{decoded=Base64.getDecoder().decode(key);envelope=new SecretEnvelope(decoded,"privacy-json/v1");}
        catch(IllegalArgumentException e){throw new IllegalStateException("Explicit isolated256-bit portable JSON artifact key required");}
        byte[] other=null;
        try{if(!csvKey.isEmpty())other=Base64.getDecoder().decode(csvKey);}catch(IllegalArgumentException ignored){/* A disabled unrelated feature may have no usable key. */}
        if(other!=null&&MessageDigest.isEqual(decoded,other))throw new IllegalStateException("Portable JSON and CSV artifact keys must be isolated");
        this.accepting=accepting;this.worker=worker;
    }
    public boolean enabled(){return envelope!=null;}
    public boolean accepting(){return enabled()&&accepting;}
    public boolean worker(){return enabled()&&worker;}
    SecretEnvelope envelope(){if(envelope==null)throw new PrivacyFailure("SERVICE_UNAVAILABLE");return envelope;}
}
