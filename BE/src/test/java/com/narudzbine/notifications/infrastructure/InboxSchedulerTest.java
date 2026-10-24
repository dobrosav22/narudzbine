package com.narudzbine.notifications.infrastructure;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
class InboxSchedulerTest {
 @Test void deferredFailureCannotLeakExceptionTextAndNextTickStillRuns(){
  var worker=mock(InboxFanout.class);var logger=mock(System.Logger.class);String privateText="Synthetic private notification text";
  when(worker.tick()).thenThrow(new IllegalStateException(privateText)).thenReturn(1);var sweep=new InboxConfiguration.Sweeper(worker,logger);assertThatCode(sweep::tick).doesNotThrowAnyException();assertThatCode(sweep::tick).doesNotThrowAnyException();verify(worker,times(2)).tick();var text=ArgumentCaptor.forClass(String.class);verify(logger).log(eq(System.Logger.Level.WARNING),text.capture());assertThat(text.getValue()).isNotBlank().doesNotContain(privateText,"IllegalStateException");verifyNoMoreInteractions(logger);
 }
}
