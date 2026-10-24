package com.narudzbine.shared.infrastructure.recovery;

import com.narudzbine.shared.api.RecoveryContainment;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/** Runs before ordinary provider/worker/server beans are instantiated. */
@Configuration(proxyBeanMethods = false)
public class RecoveryContainmentConfiguration {
    @Bean
    static BeanFactoryPostProcessor recoveryContainmentPreflight(Environment environment) {
        var state = RecoveryContainment.inspect(environment::getProperty, System.getenv());
        return factory -> factory.registerSingleton("recoveryContainmentState", state);
    }
}
