package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.assertThat;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.mock.web.MockHttpServletResponse;
class AuthErrorsDiagnosticsTest {
 @Test void unavailableStateIsPrivateAndDoesNotLogSqlParametersOrExceptionMessages(){verify("55P03","55P03");}
 @Test void untrustedStateCharactersAreNotCopiedIntoLogs(){verify("55P03\nSYNTHETIC_PARAMETER","UNKNOWN");}
 private static void verify(String state,String expected){
  var logger=(Logger)LoggerFactory.getLogger(AuthErrors.class);var events=new ListAppender<ILoggingEvent>();events.start();logger.addAppender(events);
  try{
   var errors=new AuthErrors(new DefaultListableBeanFactory().getBeanProvider(com.narudzbine.shared.api.ResourceRevisions.class));var response=new MockHttpServletResponse();response.setHeader("X-Request-Id","synthetic-request");
   var failure=new org.springframework.dao.DataAccessResourceFailureException("SYNTHETIC_PASSWORD SQL text",new java.sql.SQLException("SYNTHETIC_TOKEN bound parameters",state));
   var result=errors.error(failure,response);assertThat(result.getStatusCode().value()).isEqualTo(503);assertThat(result.getBody().code()).isEqualTo("SERVICE_UNAVAILABLE");assertThat(result.getBody().requestId()).isEqualTo("synthetic-request");assertThat(result.getBody().toString()).doesNotContain("SYNTHETIC_PASSWORD","SYNTHETIC_TOKEN",state);
   assertThat(events.list).hasSize(1);var event=events.list.getFirst();assertThat(event.getFormattedMessage()).contains("failureType=SQLException","sqlState="+expected).doesNotContain("SYNTHETIC_PASSWORD","SYNTHETIC_TOKEN","SYNTHETIC_PARAMETER","SQL text","bound parameters");assertThat(event.getThrowableProxy()).isNull();
  }finally{logger.detachAppender(events);events.stop();}
 }
}
