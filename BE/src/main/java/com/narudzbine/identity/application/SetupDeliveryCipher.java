package com.narudzbine.identity.application;
import java.util.UUID;
public final class SetupDeliveryCipher {
    private final ResetDeliveryCipher invitations,proofs;
    public SetupDeliveryCipher(byte[] key){invitations=new ResetDeliveryCipher(key,"setup-invitation/v1");proofs=new ResetDeliveryCipher(key,"setup-mailbox/v1");}
    public byte[] encrypt(UUID delivery,String token,boolean proof){return (proof?proofs:invitations).encrypt(delivery,token);}
    public String decrypt(UUID delivery,byte[] envelope,boolean proof){return (proof?proofs:invitations).decrypt(delivery,envelope);}
}
