package com.narudzbine.notifications.infrastructure;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.*;
@Configuration(proxyBeanMethods=false) @EnableScheduling
@ConditionalOnProperty(name="notifications.inbox.enabled",havingValue="true")
public class InboxConfiguration {
 @Bean Sweeper inboxSweeper(InboxFanout worker){return new Sweeper(worker);}
 public static final class Sweeper {
  private final InboxFanout worker;private final System.Logger logger;
  Sweeper(InboxFanout worker){this(worker,System.getLogger(InboxConfiguration.class.getName()));}
  Sweeper(InboxFanout worker,System.Logger logger){this.worker=worker;this.logger=logger;}
  @Scheduled(fixedDelay=5000,initialDelay=5000) public void tick(){try{worker.tick();}catch(RuntimeException deferred){logger.log(System.Logger.Level.WARNING,"In-app work deferred; inspect queue state and runtime configuration");}}
 }
}
