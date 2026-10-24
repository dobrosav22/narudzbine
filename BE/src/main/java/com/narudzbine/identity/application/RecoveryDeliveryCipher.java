package com.narudzbine.identity.application;
import java.util.UUID;
public final class RecoveryDeliveryCipher {
    private final ResetDeliveryCipher cipher;
    public RecoveryDeliveryCipher(byte[] key) {cipher=new ResetDeliveryCipher(key,"recovery-acceptance/v1");}
    public byte[] encrypt(UUID id,String token) {return cipher.encrypt(id,token);}
    public String decrypt(UUID id,byte[] envelope) {return cipher.decrypt(id,envelope);}
}
