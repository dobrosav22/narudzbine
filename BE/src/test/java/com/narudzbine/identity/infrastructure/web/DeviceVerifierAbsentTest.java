package com.narudzbine.identity.infrastructure.web;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.shared.api.ResourceRevisions;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

class DeviceVerifierAbsentTest {
    @Test void absentTrustedProviderCannotPersistAnAuthenticatedClientsToken() {
        var devices=mock(DeviceService.class);var sessions=mock(SessionService.class);var throttle=mock(LoginThrottle.class);
        var manager=mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any(TransactionDefinition.class))).thenAnswer(i->new SimpleTransactionStatus());
        UUID account=UUID.randomUUID();String token="a".repeat(43);
        when(sessions.replayAdmissionAccount(token,SessionTransport.NATIVE)).thenReturn(account);
        when(sessions.authenticateForProfileWrite(token,SessionTransport.NATIVE)).thenReturn(new AuthenticatedSession(UUID.randomUUID(),account,true,Instant.EPOCH));
        @SuppressWarnings("unchecked") ObjectProvider<DeviceVerification> absent=mock(ObjectProvider.class);
        var controller=new DevicesController(devices,absent,sessions,new SessionTransportPolicy(Set.of("https://app.example")),throttle,mock(ResourceRevisions.class),manager);
        var request=new MockHttpServletRequest("POST","/api/v1/me/devices");request.setContentType("application/json");request.addHeader("Authorization","Bearer "+token);
        request.setContent(("{\"installationId\":\""+UUID.randomUUID()+"\",\"platform\":\"WEB\",\"pushToken\":\"synthetic-token\"}").getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(()->controller.register(request)).isInstanceOfSatisfying(DeviceService.Failure.class,f->assertThat(f.code()).isEqualTo("SERVICE_UNAVAILABLE"));
        verify(sessions).authenticateForProfileWrite(token,SessionTransport.NATIVE);verifyNoInteractions(devices);
    }
}
