package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.sql.SQLException;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.util.ReflectionTestUtils;
class CsvRetryTest {
 private CsvImportController controller(){return new CsvImportController(null,null,null,null,null,null,null,null,null,null,Clock.systemUTC(),mock(PlatformTransactionManager.class),java.util.Base64.getEncoder().encodeToString(new byte[32]));}
 @Test void unknownOutcomeAndLockTimeoutNeverBlindlyRetry(){for(String state:java.util.List.of("08006","55P03")){var n=new AtomicInteger();Function<TransactionTemplate,Object> work=tx->{n.incrementAndGet();throw new RuntimeException(new SQLException("Synthetic failure",state));};assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(controller(),"retry",work)).isInstanceOf(RuntimeException.class);assertThat(n).hasValue(1);}}
 @Test void onlyDefiniteRollbackRetriesAtMostThreeWithinImportDeadline(){for(String state:java.util.List.of("40001","40P01")){var n=new AtomicInteger();Function<TransactionTemplate,Object> work=tx->{assertThat(tx.getTimeout()).isBetween(1,30);n.incrementAndGet();throw new RuntimeException(new SQLException("Synthetic rollback",state));};assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(controller(),"retry",work)).isInstanceOf(RuntimeException.class);assertThat(n).hasValue(3);}}
 @Test void definiteRollbackThenSuccessStopsAfterTheSuccessfulAttempt(){var n=new AtomicInteger();Function<TransactionTemplate,String> work=tx->{if(n.incrementAndGet()==1){throw new RuntimeException(new SQLException("Synthetic rollback","40001"));}return "ok";};assertThat((String)ReflectionTestUtils.invokeMethod(controller(),"retry",work)).isEqualTo("ok");assertThat(n).hasValue(2);}
}
