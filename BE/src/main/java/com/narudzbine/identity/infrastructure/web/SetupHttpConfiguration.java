package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.*;
import com.narudzbine.identity.api.SetupCredentialProvider;
import com.narudzbine.audit.api.SetupAudit;
import com.narudzbine.shared.api.*;
import java.time.Clock;
import java.util.Base64;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name={"identity.http.enabled","identity.setup.http.enabled"},havingValue="true")
public class SetupHttpConfiguration {
    @Bean SetupDeliveryCipher setupDeliveryCipher(@Value("${identity.setup.delivery-key}")String key){return new SetupDeliveryCipher(Base64.getDecoder().decode(key));}
    @Bean SetupInvitationStore setupInvitationStore(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,ResourceRevisions revisions,SetupDeliveryCipher cipher,@org.springframework.beans.factory.annotation.Value("${identity.http.replay-fingerprint-key:${identity.http.revision-key}}")String fingerprintKey){return new SetupInvitationStore(jdbc,clock,ids,revisions,cipher,new ResourceRevisions(java.util.Base64.getDecoder().decode(fingerprintKey)));}
    @Bean SetupInvitationService setupInvitationService(SetupInvitationStore store,PlatformTransactionManager manager,SessionService sessions,LoginThrottle throttle,SetupAudit audit,com.narudzbine.trading.api.TradingConnections trading){return new SetupInvitationService(store,manager,sessions,throttle,audit,trading);}
    @Bean OrganizationSetupService organizationSetupService(SetupInvitationStore store,PlatformTransactionManager manager,SetupCredentialProvider provider,LoginThrottle throttle,SetupAudit audit,com.narudzbine.trading.api.TradingConnections trading){return new OrganizationSetupService(store,manager,provider,throttle,audit,trading);}
    @Bean TradingSessionService tradingSessionService(SetupInvitationStore store,SessionService sessions,LoginThrottle throttle,com.narudzbine.trading.api.TradingConnections trading,SetupAudit audit,PlatformTransactionManager manager,com.narudzbine.audit.api.TradingAudit tradingAudit,com.narudzbine.notifications.api.RelationshipNotices notices){return new TradingSessionService(store,sessions,throttle,trading,audit,manager,tradingAudit,notices);}
}
