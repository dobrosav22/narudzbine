package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.*;
import com.narudzbine.identity.api.ExternalIdentityProvider;
import com.narudzbine.audit.api.ExternalAudit;
import com.narudzbine.audit.api.TransferAudit;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.shared.api.UuidGenerator;
import java.net.URI;
import java.time.Clock;
import java.util.Base64;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name={"identity.http.enabled","identity.external.http.enabled"},havingValue="true")
public class ExternalHttpConfiguration {
    @Bean ExternalSecrets externalSecrets(@Value("${identity.external.flow-key}") String key) { return new ExternalSecrets(Base64.getDecoder().decode(key)); }
    @Bean ExternalFlowService externalFlowService(JdbcTemplate jdbc,PlatformTransactionManager manager,SessionService sessions,MembershipAccess memberships,
            ExternalIdentityProvider provider,ExternalSecrets secrets,LoginThrottle throttle,ExternalAudit audit,TransferAudit transfers,UuidGenerator ids,Clock clock,
            @Value("${identity.external.return.web}") URI web,@Value("${identity.external.return.android}") URI android,@Value("${identity.external.return.ios}") URI ios) {
        return new ExternalFlowService(jdbc,manager,sessions,memberships,provider,secrets,throttle,audit,transfers,ids,clock,Map.of("WEB",web,"ANDROID",android,"IOS",ios));
    }
}
