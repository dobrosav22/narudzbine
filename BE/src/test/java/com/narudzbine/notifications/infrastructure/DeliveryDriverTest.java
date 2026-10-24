package com.narudzbine.notifications.infrastructure;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class DeliveryDriverTest {
    @Test void failedBatchCannotLeakExceptionTextAndNextTickStillRuns()throws Exception {
        var engine=mock(ExternalDeliveryEngine.class);var logger=mock(System.Logger.class);var coordinator=Executors.newSingleThreadExecutor();
        when(engine.tick()).thenThrow(new IllegalStateException("private synthetic email token")).thenReturn(0);
        try(var driver=new DeliveryConfiguration.Driver(engine,logger,coordinator)){
            driver.tick();coordinator.submit(()->{}).get(5,TimeUnit.SECONDS);driver.tick();coordinator.submit(()->{}).get(5,TimeUnit.SECONDS);
            verify(engine,times(2)).tick();var text=ArgumentCaptor.forClass(String.class);verify(logger).log(eq(System.Logger.Level.WARNING),text.capture());assertThat(text.getValue()).doesNotContain("private","token","IllegalStateException");verifyNoMoreInteractions(logger);
        }
    }
}
