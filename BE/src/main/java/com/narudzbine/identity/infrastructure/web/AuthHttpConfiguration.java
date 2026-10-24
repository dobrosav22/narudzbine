package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.PasswordCredentialVerifier;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.AccountRevisions;
import com.narudzbine.identity.application.OwnAccountService;
import com.narudzbine.identity.application.SupportedLocales;
import com.narudzbine.audit.api.AccountAudit;
import com.narudzbine.identity.application.PasswordLoginService;
import com.narudzbine.identity.application.PreAuthService;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.shared.api.ListenerAccess;
import com.narudzbine.shared.api.ResourceRevisions;
import com.narudzbine.shared.api.UuidGenerator;
import java.io.IOException;
import java.time.Clock;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.DefaultCorsProcessor;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "identity.http.enabled", havingValue = "true")
@EnableScheduling
public class AuthHttpConfiguration {
    @Bean
    @ConditionalOnProperty(name="notifications.providers.fcm.enabled",havingValue="true")
    com.narudzbine.identity.api.DeviceVerification pushDeviceVerification(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,com.narudzbine.organizations.api.MembershipAccess members,com.narudzbine.notifications.api.ProviderDelivery.Push push,PlatformTransactionManager manager){return new com.narudzbine.identity.application.PushDeviceVerification(jdbc,clock,ids,members,push,manager);}
    @Bean
    com.narudzbine.notifications.api.ProviderDelivery.TechnicalEmails technicalEmails(JdbcTemplate jdbc,Clock clock,com.narudzbine.identity.application.ResetDeliveryCipher resets,com.narudzbine.identity.application.EmailDeliveryCipher emails,org.springframework.beans.factory.ObjectProvider<com.narudzbine.identity.application.SetupInvitationStore> setup,org.springframework.beans.factory.ObjectProvider<com.narudzbine.identity.application.RecoveryDeliveryCipher> recovery,@Value("${notifications.delivery.client-base-url:https://unconfigured.invalid}")String base){return new com.narudzbine.identity.application.TechnicalEmailResolver(jdbc,clock,resets,emails,setup,recovery,base);}
    @Bean DeviceMaintenance deviceMaintenance(com.narudzbine.identity.application.DeviceService devices,PlatformTransactionManager manager) {
        return new DeviceMaintenance(devices,manager);
    }
    @Bean
    com.narudzbine.identity.application.DeviceService deviceService(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,
            @Value("${notifications.devices.environment:unconfigured}")String environment,
            @Value("${notifications.devices.project-id:unconfigured}")String project,
            @Value("${notifications.devices.encryption-key:}")String key,com.narudzbine.audit.api.DeviceAudit audit) {
        return new com.narudzbine.identity.application.DeviceService(jdbc,clock,ids,environment,project,key.isEmpty()?null:Base64.getDecoder().decode(key),audit);
    }
    @Bean(initMethod="bind")
    com.narudzbine.identity.application.ReplayFingerprintPolicy replayFingerprintPolicy(JdbcTemplate jdbc,PlatformTransactionManager manager,Clock clock,org.springframework.core.env.Environment environment,@Value("${identity.http.replay-fingerprint-key:${identity.http.revision-key}}")String key){return new com.narudzbine.identity.application.ReplayFingerprintPolicy(jdbc,manager,key,environment.containsProperty("identity.http.replay-fingerprint-key"),clock);}

    @Bean
    SessionTransportPolicy sessionTransportPolicy(@Value("${identity.http.origins}") List<String> origins) {
        if (origins.isEmpty()) { throw new IllegalArgumentException("Explicit browser origins are required."); }
        return new SessionTransportPolicy(Set.copyOf(origins));
    }

    @Bean
    LoginThrottle loginThrottle(JdbcTemplate jdbc, Clock clock, UuidGenerator ids,
            @Value("${identity.http.throttle-key}") String key) {
        return new LoginThrottle(jdbc, clock, ids, Base64.getDecoder().decode(key));
    }

    @Bean
    PasswordLoginService passwordLoginService(JdbcTemplate jdbc, PlatformTransactionManager manager,
            PasswordCredentialVerifier provider, LoginThrottle throttle, SessionService sessions, Clock clock,
            com.narudzbine.identity.application.PasswordLifecycleService passwords,com.narudzbine.identity.application.EmailChangeService emails) {
        return new PasswordLoginService(jdbc, manager, provider, throttle, sessions, clock, passwords,emails);
    }

    @Bean
    com.narudzbine.identity.application.EmailDeliveryCipher emailDeliveryCipher(@Value("${identity.http.email-delivery-key}") String key) {
        return new com.narudzbine.identity.application.EmailDeliveryCipher(Base64.getDecoder().decode(key));
    }
    @Bean
    com.narudzbine.identity.application.EmailChangeService emailChangeService(JdbcTemplate jdbc,PlatformTransactionManager manager,SessionService sessions,
            com.narudzbine.organizations.api.MembershipAccess memberships,com.narudzbine.identity.api.EmailCredentialMutator provider,
            LoginThrottle throttle,ResourceRevisions revisions,AccountRevisions accounts,com.narudzbine.audit.api.EmailAudit audit,
            com.narudzbine.audit.api.TransferAudit transfers,com.narudzbine.notifications.api.SecurityNotices notices,
            com.narudzbine.identity.application.EmailDeliveryCipher cipher,UuidGenerator ids,Clock clock,com.narudzbine.audit.api.RecoveryAudit recoveryAudit) {
        return new com.narudzbine.identity.application.EmailChangeService(jdbc,manager,sessions,memberships,provider,throttle,revisions,accounts,audit,transfers,notices,cipher,ids,clock,recoveryAudit);
    }

    @Bean
    com.narudzbine.identity.application.ResetDeliveryCipher resetDeliveryCipher(@Value("${identity.http.reset-delivery-key}") String key) {
        return new com.narudzbine.identity.application.ResetDeliveryCipher(Base64.getDecoder().decode(key));
    }

    @Bean
    com.narudzbine.identity.application.PasswordLifecycleService passwordLifecycleService(JdbcTemplate jdbc,PlatformTransactionManager manager,
            com.narudzbine.identity.api.PasswordCredentialMutator provider,LoginThrottle throttle,SessionService sessions,
            com.narudzbine.organizations.api.MembershipAccess memberships,com.narudzbine.notifications.api.SecurityNotices notices,
            com.narudzbine.audit.api.PasswordAudit audit,com.narudzbine.audit.api.TransferAudit transfers,
            com.narudzbine.identity.application.ResetDeliveryCipher cipher,UuidGenerator ids,Clock clock) {
        return new com.narudzbine.identity.application.PasswordLifecycleService(jdbc,manager,provider,throttle,sessions,memberships,notices,audit,transfers,cipher,ids,clock);
    }

    @Bean
    PreAuthService preAuthService(JdbcTemplate jdbc, PlatformTransactionManager manager, LoginThrottle throttle, Clock clock) {
        return new PreAuthService(jdbc, manager, throttle, clock);
    }

    @Bean
    ResourceRevisions resourceRevisions(@Value("${identity.http.revision-key}") String key) {
        return new ResourceRevisions(Base64.getDecoder().decode(key));
    }

    @Bean
    AccountRevisions accountRevisions(ResourceRevisions revisions) { return new AccountRevisions(revisions); }

    @Bean
    AccountResponses accountResponses(JdbcTemplate jdbc, AccountRevisions revisions) {
        return new AccountResponses(jdbc, revisions);
    }

    @Bean
    OwnAccountService ownAccountService(JdbcTemplate jdbc, SessionService sessions, AccountRevisions revisions,
            SupportedLocales locales, AccountAudit audit, Clock clock, com.narudzbine.organizations.api.Locations locations) {
        return new OwnAccountService(jdbc, sessions, revisions, locales, audit, clock, locations);
    }

    @Bean
    com.narudzbine.identity.application.MemberService memberService(JdbcTemplate jdbc,AccountRevisions revisions,
            com.narudzbine.audit.api.MemberAudit audit,Clock clock,com.narudzbine.audit.api.TransferAudit transfers,com.narudzbine.audit.api.AdministrativeAudit administrativeAudit) {
        return new com.narudzbine.identity.application.MemberService(jdbc,revisions,audit,clock,transfers,administrativeAudit);
    }

    @Bean
    com.narudzbine.identity.application.OwnershipService ownershipService(JdbcTemplate jdbc,ResourceRevisions revisions,UuidGenerator ids,Clock clock,
            com.narudzbine.audit.api.TransferAudit audit,com.narudzbine.notifications.api.SecurityNotices notices) {
        return new com.narudzbine.identity.application.OwnershipService(jdbc,revisions,ids,clock,audit,notices);
    }

    @Bean
    com.narudzbine.identity.application.IdentitySecretRetention identitySecretRetention(JdbcTemplate jdbc,Clock clock){return new com.narudzbine.identity.application.IdentitySecretRetention(jdbc,clock);}

    @Bean
    com.narudzbine.identity.application.ProofSecretRetention proofSecretRetention(JdbcTemplate jdbc,Clock clock){return new com.narudzbine.identity.application.ProofSecretRetention(jdbc,clock);}

    @Bean
    com.narudzbine.identity.application.SessionRetention sessionRetention(JdbcTemplate jdbc,Clock clock){return new com.narudzbine.identity.application.SessionRetention(jdbc,clock);}

    @Bean
    com.narudzbine.identity.application.CapabilityRetention capabilityRetention(JdbcTemplate jdbc,Clock clock){return new com.narudzbine.identity.application.CapabilityRetention(jdbc,clock);}

    @Bean
    Maintenance authenticationMaintenance(com.narudzbine.catalogue.api.CsvImports imports,com.narudzbine.ordering.api.Orders orders,com.narudzbine.ordering.api.OrderReviews reviews,PreAuthService bootstrap, com.narudzbine.organizations.api.Locations locations, com.narudzbine.organizations.api.BusinessContacts contacts, com.narudzbine.catalogue.api.VendorTaxonomy taxonomy, com.narudzbine.catalogue.api.VendorProducts products, com.narudzbine.buyerworkspace.api.SharedDrafts drafts, com.narudzbine.inventory.api.VendorInventory stock, com.narudzbine.inventory.api.InventoryReconciliation reconciliation, com.narudzbine.pricing.api.BasePricing pricing, com.narudzbine.pricing.api.VendorPromotions promotions, com.narudzbine.reporting.api.Exports exports, com.narudzbine.identity.application.IdentitySecretRetention secrets, com.narudzbine.identity.application.ProofSecretRetention proofs, com.narudzbine.identity.application.SessionRetention sessions, com.narudzbine.identity.application.CapabilityRetention capabilities, com.narudzbine.notifications.api.NotificationRetention notifications, PlatformTransactionManager manager) {
        return new Maintenance(imports,orders,reviews,bootstrap, locations, contacts, taxonomy, products, drafts, stock, reconciliation, pricing, promotions, exports, secrets, proofs, sessions, capabilities, notifications, manager);
    }

    @Bean
    @Order(1)
    SecurityFilterChain authenticationSecurity(HttpSecurity http, ListenerAccess ports,
            SessionTransportPolicy validatedPolicy, @Value("${identity.http.origins}") List<String> origins) throws Exception {
        var cors = new CorsConfiguration();
        cors.setAllowedOrigins(origins); cors.setAllowCredentials(true); cors.setMaxAge(300L);
        cors.setAllowedMethods(List.of("GET", "POST", "DELETE", "PATCH", "PUT", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "Authorization", "X-CSRF-Token", "Idempotency-Key", "X-Support-Access-Id"));
        cors.setExposedHeaders(List.of("X-Request-Id", "Retry-After", "Location", "Content-Disposition"));
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/v1/auth/**", cors);
        source.registerCorsConfiguration("/api/v1/admin/setup-invitations", cors);
        source.registerCorsConfiguration("/api/v1/invitations/**", cors);
        source.registerCorsConfiguration("/api/v1/setup/organizations", cors);
        source.registerCorsConfiguration("/api/v1/setup/members", cors);
        source.registerCorsConfiguration("/api/v1/relationships/**", cors);
        source.registerCorsConfiguration("/api/v1/promotions/**", cors);
        source.registerCorsConfiguration("/api/v1/inventory/**", cors);
        source.registerCorsConfiguration("/api/v1/vendors/**", cors);
        source.registerCorsConfiguration("/api/v1/order-reviews", cors);
        source.registerCorsConfiguration("/api/v1/orders/**", cors);
        source.registerCorsConfiguration("/api/v1/orders", cors);
        source.registerCorsConfiguration("/api/v1/drafts", cors);
        source.registerCorsConfiguration("/api/v1/drafts/**", cors);
        source.registerCorsConfiguration("/api/v1/suggestions/most-ordered", cors);
        source.registerCorsConfiguration("/api/v1/favorites", cors);
        source.registerCorsConfiguration("/api/v1/favorites/**", cors);
        source.registerCorsConfiguration("/api/v1/partners/**", cors);
        source.registerCorsConfiguration("/api/v1/plans", cors);
        source.registerCorsConfiguration("/api/v1/catalogue/**", cors);
        source.registerCorsConfiguration("/api/v1/media/**", cors);
        source.registerCorsConfiguration("/api/v1/organization/plan", cors);
        source.registerCorsConfiguration("/api/v1/organization/plan-requests/**", cors);
        source.registerCorsConfiguration("/api/v1/admin/vendors/*/plan", cors);
        source.registerCorsConfiguration("/api/v1/admin/plan-requests/**", cors);
        source.registerCorsConfiguration("/api/v1/admin/connections", cors);
        source.registerCorsConfiguration("/api/v1/admin/relationships/**", cors);
        source.registerCorsConfiguration("/api/v1/me", cors);
        source.registerCorsConfiguration("/api/v1/me/deactivation", cors);
        source.registerCorsConfiguration("/api/v1/locales", cors);
        source.registerCorsConfiguration("/api/v1/organization/privacy-cases", cors);
        source.registerCorsConfiguration("/api/v1/organization/privacy-cases/*", cors);
        source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*", cors);
        source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*/review", cors);
        for(String scope:List.of("organization","admin")){
            source.registerCorsConfiguration("/api/v1/"+scope+"/privacy-cases/*/export",cors);
            source.registerCorsConfiguration("/api/v1/"+scope+"/privacy-cases/*/exports/*",cors);
        }
        source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*/exports",cors);
        source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*/redaction-preview",cors);
        for(String suffix:List.of("","/*","/*/cancellation"))source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*/redactions"+suffix,cors);
        for(String suffix:List.of("","/*"))source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*/dispositions"+suffix,cors);
        source.registerCorsConfiguration("/api/v1/organization/privacy-cases/*/exports/*/content",cors);
        source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*/holds", cors);
        source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*/holds/*", cors);
        source.registerCorsConfiguration("/api/v1/admin/privacy-cases/*/holds/*/release", cors);
        source.registerCorsConfiguration("/api/v1/organization", cors);
        source.registerCorsConfiguration("/api/v1/organization/order-stages/**", cors);
        source.registerCorsConfiguration("/api/v1/organization/locations/**", cors);
        source.registerCorsConfiguration("/api/v1/organization/contacts/**", cors);
        source.registerCorsConfiguration("/api/v1/organization/members/**", cors);
        source.registerCorsConfiguration("/api/v1/organization/ownership-transfers/**", cors);
        source.registerCorsConfiguration("/api/v1/me/language", cors);
        var filter = new CorsFilter(source) {
            @Override protected boolean shouldNotFilter(jakarta.servlet.http.HttpServletRequest request) {
                // OAuth callbacks have their own one-use state/browser-binding boundary, including cross-site Apple POST.
                return request.getRequestURI().matches("/api/v1/auth/external/(GOOGLE|APPLE)/callback")
                        && Set.of("GET","POST").contains(request.getMethod());
            }
        };
        filter.setCorsProcessor(new DefaultCorsProcessor() {
            @Override protected void rejectRequest(org.springframework.http.server.ServerHttpResponse response) throws IOException {
                response.setStatusCode(org.springframework.http.HttpStatus.FORBIDDEN);
                response.getHeaders().set("Content-Type", "application/problem+json");
                String requestId = response.getHeaders().getFirst("X-Request-Id");
                response.getBody().write(("{\"type\":\"urn:narudzbine:problem:csrf_rejected\",\"title\":\"Origin rejected\","
                        + "\"status\":403,\"code\":\"CSRF_REJECTED\",\"requestId\":\"" + requestId + "\",\"errors\":[]}")
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
                response.flush();
            }
        });
        return http.securityMatcher(request -> !ports.isManagement(request.getLocalPort()) && implemented(request))
                .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                // Explicit synchronizer/pre-auth CSRF checks run in these controllers; no other route enters this chain.
                .csrf(csrf -> csrf.disable()).requestCache(cache -> cache.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class).build();
    }

    private static boolean implemented(jakarta.servlet.http.HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if (method.equals("OPTIONS")) { method = request.getHeader("Access-Control-Request-Method"); }
        if (method == null) { return false; }
        if(method.equals("POST")&&path.matches("/api/v1/admin/privacy-cases/[^/]+/redactions(?:/[^/]+/cancellation)?")||method.equals("GET")&&path.matches("/api/v1/admin/privacy-cases/[^/]+/redactions/[^/]+")){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/admin/privacy-cases/[^/]+/dispositions")||method.equals("GET")&&path.matches("/api/v1/admin/privacy-cases/[^/]+/dispositions/[^/]+")){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/admin/privacy-cases/[^/]+/redaction-preview")){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/admin/privacy-cases/[^/]+/exports")
            ||method.equals("GET")&&(path.matches("/api/v1/(?:organization|admin)/privacy-cases/[^/]+/(?:export|exports/[^/]+)")
                ||path.matches("/api/v1/organization/privacy-cases/[^/]+/exports/[^/]+/content"))){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/admin/privacy-cases/[^/]+/holds(?:/[^/]+/release)?")||method.equals("GET")&&path.matches("/api/v1/admin/privacy-cases/[^/]+/holds/[^/]+")){return true;}
        if(method.equals("POST")&&(path.equals("/api/v1/organization/privacy-cases")||path.matches("/api/v1/admin/privacy-cases/[^/]+/review"))||method.equals("GET")&&path.matches("/api/v1/(?:organization|admin)/privacy-cases/[^/]+")){return true;}
        if(method.equals("GET")&&path.equals("/api/v1/locales")||method.equals("POST")&&path.equals("/api/v1/me/deactivation")){return true;}
        if(method.equals("GET")&&(Set.of("/api/v1/admin/organizations","/api/v1/admin/summary").contains(path)||path.matches("/api/v1/admin/organizations/[^/]+(?:/members)?"))||method.equals("PUT")&&path.matches("/api/v1/admin/organizations/[^/]+")||method.equals("POST")&&path.matches("/api/v1/admin/organizations/[^/]+/members/[^/]+/(?:deactivation|reactivation)")){return true;}
        if(method.equals("GET")&&path.equals("/api/v1/suggestions/most-ordered")||method.equals("PUT")&&path.matches("/api/v1/catalogue/products/[^/]+/featured")){return true;}
        if(method.equals("POST")&&(path.equals("/api/v1/organization/closure")||path.matches("/api/v1/admin/organizations/[^/]+/close"))){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/admin/organizations/[^/]+/(?:suspend|reactivate)")){return true;}
        if(method.equals("POST")&&path.equals("/api/v1/admin/support-access")||method.equals("GET")&&path.matches("/api/v1/admin/support/(?:organizations/[^/]+/(?:reports|products|promotions|agreed-prices)|orders/[^/]+(?:/messages)?|products/[^/]+/(?:pricing|stock))")){return true;}
        if(method.equals("GET")&&Set.of("/api/v1/organization/audit","/api/v1/admin/audit").contains(path)){return true;}
        if(method.equals("POST")&&path.equals("/api/v1/exports")||method.equals("GET")&&path.matches("/api/v1/exports/[^/]+(?:/content)?")){return true;}
        if(method.equals("GET")&&Set.of("/api/v1/reports/summary","/api/v1/reports/products","/api/v1/reports/buyers").contains(path)){return true;}
        if(Set.of("GET","PUT").contains(method)&&path.matches("/api/v1/catalogue/products/[0-9a-fA-F-]+/pricing")){return true;}
        if(method.equals("POST")&&(path.equals("/api/v1/catalogue/import-previews")||path.matches("/api/v1/catalogue/import-previews/[^/]+/confirmation"))||method.equals("GET")&&path.matches("/api/v1/catalogue/import-previews/[^/]+")){return true;}
        if(method.equals("POST")&&path.equals("/api/v1/provider-callbacks/email")){return true;}
        if(Set.of("GET","POST").contains(method)&&path.equals("/api/v1/me/devices")){return true;}
        if(method.equals("DELETE")&&path.matches("/api/v1/me/devices/[0-9a-fA-F-]+")){return true;}
        if(Set.of("GET","PUT").contains(method)&&path.equals("/api/v1/me/notification-preferences")){return true;}
        if(method.equals("GET")&&path.equals("/api/v1/me/notifications")){return true;}
        if(method.equals("PUT")&&path.matches("/api/v1/me/notifications/[0-9a-fA-F-]+/read")){return true;}
        if(method.equals("PUT")&&path.matches("/api/v1/media/assets/[0-9a-fA-F-]+/upload")){return true;}
        if(method.equals("GET")&&path.matches("/api/v1/media/assets/[0-9a-fA-F-]+")){return true;}
        if(method.equals("GET")&&path.matches("/api/v1/media/assets/[0-9a-fA-F-]+/content")){return true;}
        if(method.equals("PUT")&&path.matches("/api/v1/catalogue/products/[0-9a-fA-F-]+/gallery")){return true;}
        if(method.equals("POST")&&path.equals("/api/v1/catalogue/bulk-edits")){return true;}
        if(Set.of("GET","POST").contains(method)&&path.equals("/api/v1/catalogue/products")){return true;}
        if(Set.of("GET","PUT").contains(method)&&path.matches("/api/v1/catalogue/products/[0-9a-fA-F-]+")){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/catalogue/products/[0-9a-fA-F-]+/(archive|restore|activate|deactivate)")){return true;}
        if(Set.of("GET","POST").contains(method)&&path.matches("/api/v1/catalogue/(categories|tags|units)")){return true;}
        if(Set.of("PUT","DELETE").contains(method)&&path.matches("/api/v1/catalogue/(categories|tags|units)/[0-9a-fA-F-]+")){return true;}
        if(method.equals("GET")&&(Set.of("/api/v1/plans","/api/v1/organization/plan","/api/v1/organization/plan-requests","/api/v1/admin/plan-requests").contains(path)||path.matches("/api/v1/admin/vendors/[0-9a-fA-F-]+/plan"))){return true;}
        if(method.equals("POST")&&(path.equals("/api/v1/organization/plan-requests")||path.matches("/api/v1/admin/plan-requests/[0-9a-fA-F-]+/(approval|rejection)"))){return true;}
        if(method.equals("DELETE")&&path.matches("/api/v1/organization/plan-requests/[0-9a-fA-F-]+")){return true;}
        if(method.equals("PUT")&&path.matches("/api/v1/admin/vendors/[0-9a-fA-F-]+/plan")){return true;}

        if(method.equals("GET")&&path.matches("/api/v1/partners/[0-9a-fA-F-]+")){return true;}
        if(method.equals("POST")&&(path.equals("/api/v1/admin/connections")||path.matches("/api/v1/(admin/)?relationships/[0-9a-fA-F-]+/disconnect"))){return true;}
        if(path.matches("/api/v1/relationships/[0-9a-fA-F-]+/agreed-prices")&&method.equals("GET")){return true;}
        if(path.matches("/api/v1/relationships/[0-9a-fA-F-]+/agreed-prices/[0-9a-fA-F-]+")&&Set.of("PUT","DELETE").contains(method)){return true;}
        if(path.matches("/api/v1/relationships/[0-9a-fA-F-]+/agreed-prices/confirmation")&&method.equals("POST")){return true;}
        if(method.equals("POST")&&Set.of("/api/v1/inventory/tracking/disable","/api/v1/inventory/reconciliations").contains(path)){return true;}
        if(path.matches("/api/v1/inventory/reconciliations/[0-9a-fA-F-]+")&&method.equals("GET")){return true;}
        if(path.matches("/api/v1/inventory/reconciliations/[0-9a-fA-F-]+/lines")&&Set.of("GET","PUT").contains(method)){return true;}
        if(path.matches("/api/v1/inventory/reconciliations/[0-9a-fA-F-]+/confirmation")&&method.equals("POST")){return true;}
        if(path.equals("/api/v1/organization/order-stages")&&Set.of("GET","POST").contains(method)){return true;}
        if(method.equals("PUT")&&path.matches("/api/v1/organization/order-stages/[^/]+")){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/organization/order-stages/[^/]+/retirement")){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/orders/[^/]+/cancellation-requests(?:/[^/]+/(?:withdrawal|approval|rejection))?")){return true;}
        if(method.equals("GET")&&path.matches("/api/v1/orders/[^/]+/cancellation-requests/[^/]+")){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/orders/[^/]+/(acceptance|rejection|cancellation|stage|dispatch|delivery)")){return true;}
        if(Set.of("GET","POST").contains(method)&&path.matches("/api/v1/orders/[^/]+/messages")){return true;}
        if(method.equals("GET")&&path.matches("/api/v1/orders/[^/]+/reorder-preview")){return true;}
        if(method.equals("GET")&&(path.equals("/api/v1/orders")||path.matches("/api/v1/orders/[^/]+/events"))){return true;}
        if(method.equals("POST")&&path.equals("/api/v1/orders")||method.equals("GET")&&path.matches("/api/v1/orders/[^/]+")){return true;}
        if(method.equals("POST")&&path.equals("/api/v1/order-reviews")){return true;}
        if(method.equals("POST")&&path.matches("/api/v1/drafts/[^/]+/submission")){return true;}
        if(Set.of("GET","POST").contains(method)&&path.equals("/api/v1/drafts")){return true;}
        if(Set.of("GET","PUT","DELETE").contains(method)&&path.matches("/api/v1/drafts/[0-9a-fA-F-]+")){return true;}
        if(method.equals("GET")&&path.equals("/api/v1/favorites")){return true;}
        if(Set.of("PUT","DELETE").contains(method)&&path.matches("/api/v1/favorites/[0-9a-fA-F-]+")){return true;}
        if(method.equals("GET")&&(path.matches("/api/v1/vendors/[0-9a-fA-F-]+/(offers|offer-taxonomy)")||path.matches("/api/v1/vendors/[0-9a-fA-F-]+/offers/[0-9a-fA-F-]+"))){return true;}
        if(method.equals("GET")&&Set.of("/api/v1/inventory/tracking","/api/v1/inventory/events").contains(path)){return true;}
        if(path.matches("/api/v1/inventory/products/[0-9a-fA-F-]+")&&Set.of("GET","PUT").contains(method)){return true;}
        if(path.matches("/api/v1/inventory/products/[0-9a-fA-F-]+/(adjustments|confirmation)")&&method.equals("POST")){return true;}
        if(path.equals("/api/v1/promotions")&&Set.of("GET","POST").contains(method)){return true;}
        if(path.matches("/api/v1/promotions/[0-9a-fA-F-]+")&&Set.of("GET","PUT").contains(method)){return true;}
        if(path.matches("/api/v1/promotions/[0-9a-fA-F-]+/(stop|archive)")&&method.equals("POST")){return true;}
        if(method.equals("GET")&&(path.equals("/api/v1/relationships")||path.matches("/api/v1/relationships/[0-9a-fA-F-]+"))){return true;}
        if(method.equals("GET")&&path.equals("/api/v1/invitations")){return true;}
        if(method.equals("POST")&&(Set.of("/api/v1/admin/setup-invitations","/api/v1/invitations/email-proofs","/api/v1/setup/organizations","/api/v1/invitations/members","/api/v1/setup/members","/api/v1/invitations/buyers","/api/v1/invitations/trading/acceptance").contains(path)||path.matches("/api/v1/invitations/[0-9a-fA-F-]+/resends"))){return true;}
        if((method.equals("GET")||method.equals("DELETE"))&&path.matches("/api/v1/invitations/[0-9a-fA-F-]+")){return true;}
        if(method.equals("POST") && (path.equals("/api/v1/admin/recovery-cases") || path.matches("/api/v1/admin/recovery-cases/[0-9a-fA-F-]+/review") || path.matches("/api/v1/recovery-cases/[0-9a-fA-F-]+/acceptance"))) {return true;}
        if(method.equals("GET") && path.matches("/api/v1/admin/recovery-cases/[0-9a-fA-F-]+")) {return true;}
        if((method.equals("GET") || method.equals("POST")) && path.matches("/api/v1/auth/external/(GOOGLE|APPLE)/callback")) { return true; }
        if(method.equals("POST") && Set.of("/api/v1/auth/external/challenges","/api/v1/auth/external/exchanges").contains(path)) { return true; }
        if(method.equals("GET") && path.equals("/api/v1/auth/external-identities")) { return true; }
        if(method.equals("DELETE") && path.matches("/api/v1/auth/external-identities/[0-9a-fA-F-]+")) { return true; }
        if((method.equals("GET") || method.equals("DELETE")) && path.matches("/api/v1/auth/email-changes/[0-9a-fA-F-]+")) { return true; }
        if(method.equals("POST") && (path.equals("/api/v1/auth/email-changes") || path.equals("/api/v1/auth/email-change-proofs")
                || path.matches("/api/v1/auth/email-changes/[0-9a-fA-F-]+/completion"))) { return true; }
        boolean transfer=path.matches("/api/v1/organization/ownership-transfers/[0-9a-fA-F-]+");
        if ((method.equals("GET") || method.equals("DELETE")) && transfer) { return true; }
        if (method.equals("POST") && (path.equals("/api/v1/organization/ownership-transfers")
                || path.matches("/api/v1/organization/ownership-transfers/[0-9a-fA-F-]+/acceptance"))) { return true; }
        if (method.equals("GET") && path.equals("/api/v1/organization/members")) { return true; }
        if (method.equals("PUT") && path.matches("/api/v1/organization/members/[0-9a-fA-F-]+/role")) { return true; }
        if (method.equals("POST") && path.matches("/api/v1/organization/members/[0-9a-fA-F-]+/(deactivation|reactivation)")) { return true; }
        boolean contact = path.matches("/api/v1/organization/contacts/[0-9a-fA-F-]+");
        if (method.equals("GET") && (path.equals("/api/v1/organization/contacts") || contact)) { return true; }
        if (method.equals("PUT") && contact) { return true; }
        if (method.equals("POST") && (path.equals("/api/v1/organization/contacts")
                || path.matches("/api/v1/organization/contacts/[0-9a-fA-F-]+/(archive|restore)"))) { return true; }
        boolean location = path.matches("/api/v1/organization/locations/[0-9a-fA-F-]+");
        if (method.equals("GET") && (path.equals("/api/v1/organization/locations") || location)) { return true; }
        if (method.equals("PUT") && location) { return true; }
        if (method.equals("POST") && (path.equals("/api/v1/organization/locations")
                || path.matches("/api/v1/organization/locations/[0-9a-fA-F-]+/(archive|restore)"))) { return true; }
        return switch (method) {
            case "GET" -> Set.of("/api/v1/auth/bootstrap", "/api/v1/auth/csrf", "/api/v1/auth/sessions", "/api/v1/me", "/api/v1/organization").contains(path);
            case "POST" -> Set.of("/api/v1/auth/login", "/api/v1/auth/logout", "/api/v1/auth/sessions/revoke-all",
                    "/api/v1/auth/reauthentication", "/api/v1/auth/password-reset-requests", "/api/v1/auth/password-resets",
                    "/api/v1/auth/password-changes").contains(path);
            case "PUT" -> path.equals("/api/v1/organization") || path.equals("/api/v1/me");
            case "PATCH" -> path.equals("/api/v1/me/language");
            case "DELETE" -> path.matches("/api/v1/auth/sessions/[0-9a-fA-F-]+") && !path.endsWith("/");
            default -> false;
        };
    }

    public static final class Maintenance {
        private final com.narudzbine.catalogue.api.CsvImports imports;private final com.narudzbine.ordering.api.Orders orders;
        private final com.narudzbine.ordering.api.OrderReviews reviews;
        private final PreAuthService bootstrap;
        private final com.narudzbine.organizations.api.Locations locations;
        private final com.narudzbine.organizations.api.BusinessContacts contacts;
        private final com.narudzbine.catalogue.api.VendorTaxonomy taxonomy;
        private final com.narudzbine.catalogue.api.VendorProducts products;
        private final com.narudzbine.buyerworkspace.api.SharedDrafts drafts;
        private final com.narudzbine.inventory.api.VendorInventory stock;
        private final com.narudzbine.inventory.api.InventoryReconciliation reconciliation;
        private final com.narudzbine.pricing.api.BasePricing pricing;
        private final com.narudzbine.pricing.api.VendorPromotions promotions;
        private final com.narudzbine.reporting.api.Exports exports;
        private final com.narudzbine.identity.application.IdentitySecretRetention secrets;
        private final com.narudzbine.identity.application.ProofSecretRetention proofs;
        private final com.narudzbine.identity.application.SessionRetention sessions;
        private final com.narudzbine.identity.application.CapabilityRetention capabilities;
        private final com.narudzbine.notifications.api.NotificationRetention notifications;
        private static final System.Logger LOG=System.getLogger(Maintenance.class.getName());
        private final org.springframework.transaction.support.TransactionTemplate transaction;
        Maintenance(com.narudzbine.catalogue.api.CsvImports imports,com.narudzbine.ordering.api.Orders orders,com.narudzbine.ordering.api.OrderReviews reviews,PreAuthService bootstrap, com.narudzbine.organizations.api.Locations locations, com.narudzbine.organizations.api.BusinessContacts contacts, com.narudzbine.catalogue.api.VendorTaxonomy taxonomy, com.narudzbine.catalogue.api.VendorProducts products, com.narudzbine.buyerworkspace.api.SharedDrafts drafts, com.narudzbine.inventory.api.VendorInventory stock, com.narudzbine.inventory.api.InventoryReconciliation reconciliation, com.narudzbine.pricing.api.BasePricing pricing, com.narudzbine.pricing.api.VendorPromotions promotions, com.narudzbine.reporting.api.Exports exports, com.narudzbine.identity.application.IdentitySecretRetention secrets, com.narudzbine.identity.application.ProofSecretRetention proofs, com.narudzbine.identity.application.SessionRetention sessions, com.narudzbine.identity.application.CapabilityRetention capabilities, com.narudzbine.notifications.api.NotificationRetention notifications, PlatformTransactionManager manager) {
            this.imports=imports;this.orders=orders;this.reviews=reviews; this.bootstrap = bootstrap; this.locations = locations; this.contacts = contacts; this.taxonomy = taxonomy; this.products = products;this.drafts=drafts;this.stock=stock;this.reconciliation=reconciliation;this.pricing=pricing;this.promotions=promotions;this.exports=exports;this.secrets=secrets;this.proofs=proofs;this.sessions=sessions;this.capabilities=capabilities;this.notifications=notifications;
            transaction = new org.springframework.transaction.support.TransactionTemplate(manager); transaction.setTimeout(10);
            transaction.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        }
        @Scheduled(fixedDelay = 60000, initialDelayString = "${identity.http.maintenance.initial-delay-ms:60000}")
        public void cleanup() { runOnce(); }
        public Outcome runOnce() {
            var completed=new java.util.ArrayList<String>();var deferred=new java.util.ArrayList<String>();
            attempt("imports",()->transaction.executeWithoutResult(status->imports.cleanup()),completed,deferred);
            attempt("order-replays",()->transaction.executeWithoutResult(status->orders.compactExpiredReplays()),completed,deferred);
            attempt("order-reviews",()->transaction.executeWithoutResult(status->reviews.purgeExpired()),completed,deferred);
            attempt("bootstrap",()->transaction.executeWithoutResult(status->bootstrap.cleanup()),completed,deferred);
            attempt("locations",()->transaction.executeWithoutResult(status->locations.compactExpiredReceipts()),completed,deferred);
            attempt("contacts",()->transaction.executeWithoutResult(status->contacts.compactExpiredReceipts()),completed,deferred);
            attempt("taxonomy",()->transaction.executeWithoutResult(status->taxonomy.compactExpiredReceipts()),completed,deferred);
            attempt("products",()->transaction.executeWithoutResult(status->products.compactExpiredReceipts()),completed,deferred);
            attempt("drafts",()->transaction.executeWithoutResult(status->drafts.compactExpiredReceipts()),completed,deferred);
            attempt("stock",()->transaction.executeWithoutResult(status->stock.compactExpiredReplay()),completed,deferred);
            attempt("inventory-lifecycle",()->transaction.executeWithoutResult(status->reconciliation.compactExpiredReplay()),completed,deferred);
            attempt("pricing-deactivations",()->transaction.executeWithoutResult(status->pricing.compactExpiredDeactivations()),completed,deferred);
            attempt("promotion-creations",()->transaction.executeWithoutResult(status->promotions.compactExpiredCreations()),completed,deferred);
            attempt("export-creations",()->transaction.executeWithoutResult(status->exports.compactExpiredCreations()),completed,deferred);
            attempt("identity-reset-secrets",()->transaction.executeWithoutResult(status->secrets.reset()),completed,deferred);
            attempt("identity-email-secrets",()->transaction.executeWithoutResult(status->secrets.email()),completed,deferred);
            attempt("identity-setup-secrets",()->transaction.executeWithoutResult(status->secrets.setup()),completed,deferred);
            attempt("identity-recovery-secrets",()->transaction.executeWithoutResult(status->secrets.recovery()),completed,deferred);
            attempt("proof-reset-secrets",()->transaction.executeWithoutResult(status->proofs.reset()),completed,deferred);
            attempt("proof-email-secrets",()->transaction.executeWithoutResult(status->proofs.email()),completed,deferred);
            attempt("proof-setup-secrets",()->transaction.executeWithoutResult(status->proofs.setup()),completed,deferred);
            attempt("proof-device-secrets",()->transaction.executeWithoutResult(status->proofs.device()),completed,deferred);
            attempt("proof-oauth-secrets",()->transaction.executeWithoutResult(status->proofs.oauth()),completed,deferred);
            attempt("session-payloads",()->transaction.executeWithoutResult(status->sessions.cleanup()),completed,deferred);
            attempt("oauth-exchange-codes",()->transaction.executeWithoutResult(status->capabilities.exchange()),completed,deferred);
            attempt("oauth-flow-bindings",()->transaction.executeWithoutResult(status->capabilities.flow()),completed,deferred);
            attempt("recovery-acceptance-proofs",()->transaction.executeWithoutResult(status->capabilities.recovery()),completed,deferred);
            attempt("inbox-retention",()->transaction.executeWithoutResult(status->notifications.inbox()),completed,deferred);
            attempt("delivery-metadata",()->transaction.executeWithoutResult(status->notifications.deliveries()),completed,deferred);
            attempt("callback-metadata",()->transaction.executeWithoutResult(status->notifications.callbacks()),completed,deferred);
            return new Outcome(completed,deferred);
        }
        private static void attempt(String name,Runnable task,java.util.List<String> completed,java.util.List<String> deferred) {
            try {task.run();completed.add(name);}catch(RuntimeException failure){
                deferred.add(name);LOG.log(System.Logger.Level.WARNING,"Maintenance job deferred: "+name+"; inspect grants and retained backlog");
            }
        }
        public record Outcome(java.util.List<String> completedJobs,java.util.List<String> deferredJobs) {
            public Outcome {completedJobs=java.util.List.copyOf(completedJobs);deferredJobs=java.util.List.copyOf(deferredJobs);}
        }
    }
}
