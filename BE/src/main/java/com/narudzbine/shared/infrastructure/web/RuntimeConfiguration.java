package com.narudzbine.shared.infrastructure.web;

import com.narudzbine.shared.infrastructure.database.DatabaseReadiness;
import java.time.Clock;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class RuntimeConfiguration {
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> schemaBeforeListener(DatabaseReadiness readiness) {
        return factory -> readiness.verifySchema();
    }
}
