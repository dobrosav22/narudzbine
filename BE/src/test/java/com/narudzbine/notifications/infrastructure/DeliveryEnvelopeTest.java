package com.narudzbine.notifications.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.api.SecretEnvelope;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeliveryEnvelopeTest {
    @Test void frozenUnicodeRequestRejectsOtherResourceKeyPurposeAndTampering(){
        byte[] key=new byte[32];var codec=new SecretEnvelope(key,"external-request/v1");UUID id=UUID.randomUUID();byte[] privateBody="Jednokratni link / obavještenje šđčćž".getBytes(StandardCharsets.UTF_8);byte[] encrypted=codec.encrypt(id,privateBody);
        assertThat(codec.decrypt(id,encrypted)).isEqualTo(privateBody);assertThat(codec.encrypt(id,privateBody)).isNotEqualTo(encrypted);
        assertThatThrownBy(()->codec.decrypt(UUID.randomUUID(),encrypted)).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->new SecretEnvelope(key,"other-purpose").decrypt(id,encrypted)).isInstanceOf(IllegalArgumentException.class);
        byte[] other=key.clone();other[0]=1;assertThatThrownBy(()->new SecretEnvelope(other,"external-request/v1").decrypt(id,encrypted)).isInstanceOf(IllegalArgumentException.class);encrypted[encrypted.length-1]^=1;assertThatThrownBy(()->codec.decrypt(id,encrypted)).isInstanceOf(IllegalArgumentException.class);
    }
}
