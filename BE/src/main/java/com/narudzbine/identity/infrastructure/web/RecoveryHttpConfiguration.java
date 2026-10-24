package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.*;
import com.narudzbine.identity.api.RecoveryEvidence;
import com.narudzbine.audit.api.*;
import com.narudzbine.notifications.api.SecurityNotices;
import com.narudzbine.shared.api.*;
import java.time.Clock;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name={"identity.http.enabled","identity.recovery.http.enabled"},havingValue="true")
public class RecoveryHttpConfiguration {
    @Bean RecoveryDeliveryCipher recoveryDeliveryCipher(@Value("${identity.recovery.delivery-key}")String key){return new RecoveryDeliveryCipher(Base64.getDecoder().decode(key));}
    @Bean RecoveryService recoveryService(JdbcTemplate jdbc,PlatformTransactionManager manager,SessionService sessions,LoginThrottle throttle,
            RecoveryEvidence evidence,RecoveryAudit audit,TransferAudit transfers,SecurityNotices notices,EmailChangeService emails,
            RecoveryDeliveryCipher cipher,ResourceRevisions revisions,UuidGenerator ids,Clock clock){
        return new RecoveryService(jdbc,manager,sessions,throttle,evidence,audit,transfers,notices,emails,cipher,revisions,ids,clock);
    }
}
