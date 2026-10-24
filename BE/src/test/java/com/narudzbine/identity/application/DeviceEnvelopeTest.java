package com.narudzbine.identity.application;

import static org.assertj.core.api.Assertions.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeviceEnvelopeTest {
    @Test void deviceEnvelopeRejectsWrongResourcePurposeKeyAndTampering() {
        byte[] key=new byte[32];var device=new ResetDeliveryCipher(key,"push-device/v1");UUID id=UUID.randomUUID();String token="synthetic-opaque-push-token";
        byte[] envelope=device.encrypt(id,token);assertThat(device.decrypt(id,envelope)).isEqualTo(token);assertThat(device.encrypt(id,token)).isNotEqualTo(envelope);
        assertThatThrownBy(()->device.decrypt(UUID.randomUUID(),envelope)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->new ResetDeliveryCipher(key).decrypt(id,envelope)).isInstanceOf(IllegalArgumentException.class);
        byte[] other=key.clone();other[0]=1;assertThatThrownBy(()->new ResetDeliveryCipher(other,"push-device/v1").decrypt(id,envelope)).isInstanceOf(IllegalArgumentException.class);
        envelope[envelope.length-1]^=1;assertThatThrownBy(()->device.decrypt(id,envelope)).isInstanceOf(IllegalArgumentException.class);
    }
}
