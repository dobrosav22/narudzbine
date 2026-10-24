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
class OrdersRetryTest {
 private OrdersController controller(){return new OrdersController(null,null,null,null,null,null,null,null,null,null,Clock.systemUTC(),mock(PlatformTransactionManager.class),java.util.Base64.getEncoder().encodeToString(new byte[32]));}
 @Test void uncertainConnectionOutcomeNeverAutomaticallyRetries(){var calls=new AtomicInteger();Function<TransactionTemplate,Object> command=tx->{calls.incrementAndGet();throw new RuntimeException(new SQLException("Synthetic connection loss","08006"));};assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(controller(),"retry",command)).isInstanceOf(RuntimeException.class);assertThat(calls).hasValue(1);}
 @Test void onlyDefiniteRollbackSerializationAndDeadlockRetryAtMostThreeTimes(){for(String state:java.util.List.of("40001","40P01")){var calls=new AtomicInteger();Function<TransactionTemplate,Object> command=tx->{calls.incrementAndGet();assertThat(tx.getTimeout()).isBetween(1,10);throw new RuntimeException(new SQLException("Synthetic definite rollback",state));};assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(controller(),"retry",command)).isInstanceOf(RuntimeException.class);assertThat(calls).hasValue(3);}}
 @Test void definiteRollbackThenSuccessReturnsOnceAndDoesNotRetryLockTimeout(){var calls=new AtomicInteger();Function<TransactionTemplate,String> command=tx->{if(calls.incrementAndGet()==1){throw new RuntimeException(new SQLException("Synthetic rollback","40001"));}return "success";};assertThat((String)ReflectionTestUtils.invokeMethod(controller(),"retry",command)).isEqualTo("success");assertThat(calls).hasValue(2);calls.set(0);Function<TransactionTemplate,Object> timeout=tx->{calls.incrementAndGet();throw new RuntimeException(new SQLException("Synthetic lock timeout","55P03"));};assertThatThrownBy(()->ReflectionTestUtils.invokeMethod(controller(),"retry",timeout)).isInstanceOf(RuntimeException.class);assertThat(calls).hasValue(1);}
}
