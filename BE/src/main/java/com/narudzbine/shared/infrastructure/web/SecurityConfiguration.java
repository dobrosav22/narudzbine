package com.narudzbine.shared.infrastructure.web;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration(proxyBeanMethods = false)
public class SecurityConfiguration {
    @Bean
    @org.springframework.core.annotation.Order(100)
    SecurityFilterChain foundationSecurity(HttpSecurity http, ListenerPorts ports) throws Exception {
        // No business authentication exists in VS-00. Fail closed until VS-01 supplies it.
        return http.authorizeHttpRequests(auth -> auth
                        .requestMatchers(request -> ports.isManagement(request.getLocalPort())
                                && "GET".equals(request.getMethod())
                                && (request.getRequestURI().equals("/actuator/health")
                                    || request.getRequestURI().startsWith("/actuator/health/")
                                    || request.getRequestURI().equals("/actuator/info")
                                    || request.getRequestURI().equals("/actuator/metrics")
                                    || request.getRequestURI().startsWith("/actuator/metrics/")))
                        .permitAll().anyRequest().denyAll())
                .csrf(Customizer.withDefaults())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> response.setStatus(404))
                        .accessDeniedHandler((request, response, exception) -> response.setStatus(404)))
                .build();
    }
}
