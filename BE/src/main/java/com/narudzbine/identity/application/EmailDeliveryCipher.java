package com.narudzbine.identity.application;

import java.util.UUID;

public final class EmailDeliveryCipher {
    private final ResetDeliveryCipher cipher;
    public EmailDeliveryCipher(byte[] key) { cipher=new ResetDeliveryCipher(key,"email-change/v1"); }
    public byte[] encrypt(UUID proof,String token) { return cipher.encrypt(proof,token); }
    public String decrypt(UUID proof,byte[] envelope) { return cipher.decrypt(proof,envelope); }
}
