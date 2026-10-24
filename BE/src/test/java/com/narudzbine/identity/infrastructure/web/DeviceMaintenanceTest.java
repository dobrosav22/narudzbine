package com.narudzbine.identity.infrastructure.web;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.narudzbine.identity.application.DeviceService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

class DeviceMaintenanceTest {
    @Test void failedCleanupRollsBackWithoutLoggingSensitiveExceptionAndNextTickRecovers() {
        var devices=mock(DeviceService.class);var manager=mock(PlatformTransactionManager.class);var logger=mock(System.Logger.class);
        var first=new SimpleTransactionStatus();var second=new SimpleTransactionStatus();
        when(manager.getTransaction(any(TransactionDefinition.class))).thenReturn(first,second);
        when(devices.cleanup()).thenThrow(new IllegalStateException("sensitive synthetic token")).thenReturn(1);
        var job=new DeviceMaintenance(devices,manager,logger);
        assertThatCode(job::tick).doesNotThrowAnyException();assertThatCode(job::tick).doesNotThrowAnyException();
        verify(manager).rollback(first);verify(manager).commit(second);verify(devices,times(2)).cleanup();
        var text=ArgumentCaptor.forClass(String.class);verify(logger).log(eq(System.Logger.Level.WARNING),text.capture());
        assertThat(text.getValue()).isNotBlank().doesNotContain("sensitive","token","IllegalStateException");verifyNoMoreInteractions(logger);
    }
}
