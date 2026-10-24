package com.narudzbine.shared.api;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Purpose/resource-bound UTF-8 envelope, never a loggable payload. */
public final class SecretEnvelope {
    private final SecretKeySpec key;private final String purpose;
    public SecretEnvelope(byte[] key,String purpose) {
        if(key==null||key.length!=32||purpose==null||purpose.isBlank())throw new IllegalArgumentException("Explicit256-bit envelope key and purpose required");
        this.key=new SecretKeySpec(key.clone(),"AES");this.purpose=purpose;
    }
    public byte[] encrypt(UUID resource,byte[] body) {
        byte[] nonce=new byte[12];new SecureRandom().nextBytes(nonce);byte[] data=crypt(Cipher.ENCRYPT_MODE,resource,nonce,body);
        byte[] result=Arrays.copyOf(nonce,nonce.length+data.length);System.arraycopy(data,0,result,nonce.length,data.length);return result;
    }
    public byte[] decrypt(UUID resource,byte[] body) {
        if(body==null||body.length<28)throw new IllegalArgumentException("Envelope unavailable");
        return crypt(Cipher.DECRYPT_MODE,resource,Arrays.copyOf(body,12),Arrays.copyOfRange(body,12,body.length));
    }
    private byte[] crypt(int mode,UUID resource,byte[] nonce,byte[] body) {
        try {var c=Cipher.getInstance("AES/GCM/NoPadding");c.init(mode,key,new GCMParameterSpec(128,nonce));c.updateAAD((purpose+"/"+resource).getBytes(StandardCharsets.UTF_8));return c.doFinal(body);}
        catch(java.security.GeneralSecurityException ex){throw new IllegalArgumentException("Envelope unavailable");}
    }
}
