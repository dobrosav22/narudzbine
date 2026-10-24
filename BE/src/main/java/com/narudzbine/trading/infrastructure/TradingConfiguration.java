package com.narudzbine.trading.infrastructure;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.trading.application.JdbcTradingConnections;
import com.narudzbine.audit.api.TradingAudit;
import com.narudzbine.shared.api.UuidGenerator;
import java.time.Clock;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
@Configuration(proxyBeanMethods=false)
public class TradingConfiguration {
    @Bean TradingConnections tradingConnections(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,TradingAudit audit){return new JdbcTradingConnections(jdbc,clock,ids,audit);}
}
