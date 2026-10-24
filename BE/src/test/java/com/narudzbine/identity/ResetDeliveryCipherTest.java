package com.narudzbine.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.narudzbine.identity.application.ResetDeliveryCipher;
import java.security.SecureRandom;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ResetDeliveryCipherTest {
    @Test void emailProofEnvelopesCannotBeUsedAsPasswordResetEnvelopesEvenWithTheSameKey() {
        byte[] key=new byte[32];new SecureRandom().nextBytes(key);UUID proof=UUID.randomUUID();
        var emails=new com.narudzbine.identity.application.EmailDeliveryCipher(key);var resets=new ResetDeliveryCipher(key);
        byte[] envelope=emails.encrypt(proof,"a".repeat(43));assertThat(emails.decrypt(proof,envelope)).isEqualTo("a".repeat(43));
        assertThatThrownBy(()->resets.decrypt(proof,envelope)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void externalFlowEncryptionIsPurposeAndFlowBound() {
        byte[] key=new byte[32];new SecureRandom().nextBytes(key);UUID flow=UUID.randomUUID();
        var external=new com.narudzbine.identity.application.ExternalSecrets(key);byte[] envelope=external.encrypt(flow,"a".repeat(43));
        assertThat(external.decrypt(flow,envelope)).isEqualTo("a".repeat(43));
        assertThatThrownBy(()->external.decrypt(UUID.randomUUID(),envelope)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new ResetDeliveryCipher(key).decrypt(flow,envelope)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new com.narudzbine.identity.application.EmailDeliveryCipher(key).decrypt(flow,envelope)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void recoveryAcceptanceEncryptionCannotBeUsedForAnotherPurposeOrDelivery() {
        byte[] key=new byte[32];new SecureRandom().nextBytes(key);UUID delivery=UUID.randomUUID();
        var recovery=new com.narudzbine.identity.application.RecoveryDeliveryCipher(key);byte[] envelope=recovery.encrypt(delivery,"a".repeat(43));
        assertThat(recovery.decrypt(delivery,envelope)).isEqualTo("a".repeat(43));
        assertThatThrownBy(()->recovery.decrypt(UUID.randomUUID(),envelope)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new ResetDeliveryCipher(key).decrypt(delivery,envelope)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new com.narudzbine.identity.application.EmailDeliveryCipher(key).decrypt(delivery,envelope)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new com.narudzbine.identity.application.ExternalSecrets(key).decrypt(delivery,envelope)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void setupInvitationAndMailboxEnvelopesArePurposeAndDeliveryBound() {
        byte[] key=new byte[32];new SecureRandom().nextBytes(key);UUID delivery=UUID.randomUUID();
        var setup=new com.narudzbine.identity.application.SetupDeliveryCipher(key);byte[] envelope=setup.encrypt(delivery,"a".repeat(43),false);
        assertThat(setup.decrypt(delivery,envelope,false)).isEqualTo("a".repeat(43));
        assertThatThrownBy(()->setup.decrypt(delivery,envelope,true)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->setup.decrypt(UUID.randomUUID(),envelope,false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new ResetDeliveryCipher(key).decrypt(delivery,envelope)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void envelopeIsRandomAuthenticatedAndBoundToPurposeAndProof() {
        byte[] key=new byte[32];new SecureRandom().nextBytes(key);
        var cipher=new ResetDeliveryCipher(key);UUID proof=UUID.randomUUID();String token="a".repeat(43);
        byte[] first=cipher.encrypt(proof,token),second=cipher.encrypt(proof,token);
        assertThat(first).hasSize(71).isNotEqualTo(second);
        assertThat(cipher.decrypt(proof,first)).isEqualTo(token);
        assertThatThrownBy(()->cipher.decrypt(UUID.randomUUID(),first)).isInstanceOf(IllegalArgumentException.class).hasNoCause();
        first[first.length-1]^=1;
        assertThatThrownBy(()->cipher.decrypt(proof,first)).isInstanceOf(IllegalArgumentException.class).hasNoCause();
        assertThatThrownBy(()->new ResetDeliveryCipher(new byte[31])).isInstanceOf(IllegalArgumentException.class);
    }
}
