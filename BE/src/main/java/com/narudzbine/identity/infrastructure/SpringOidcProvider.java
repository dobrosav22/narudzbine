package com.narudzbine.identity.infrastructure;

import com.narudzbine.identity.api.ExternalIdentityProvider;
import com.narudzbine.identity.api.ExternalFailure;
import com.narudzbine.identity.application.ExternalSecrets;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.security.oauth2.client.authentication.OAuth2LoginAuthenticationToken;
import org.springframework.security.oauth2.client.oidc.authentication.OidcAuthorizationCodeAuthenticationProvider;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenValidator;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.core.endpoint.*;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;
import tools.jackson.databind.json.JsonMapper;

/** No session/filter-managed OAuth state. Maintained Spring OIDC verification consumes the durable local challenge. */
public final class SpringOidcProvider implements ExternalIdentityProvider {
    public record Client(String issuer,URI authorization,URI token,URI jwks,URI callback,String clientId,Supplier<String> secret) {
        public Client {
            for(URI uri:List.of(URI.create(issuer),authorization,token,jwks,callback)) {
                if(!uri.getScheme().equals("https") || uri.getHost()==null || uri.getUserInfo()!=null || uri.getFragment()!=null || uri.getQuery()!=null) {
                    throw new IllegalArgumentException("Explicit HTTPS OIDC endpoints are required.");
                }
            }
            if(clientId==null || clientId.isBlank() || clientId.length()>255 || secret==null) { throw new IllegalArgumentException("Explicit OIDC client required."); }
        }
        @Override public String toString() { return "OidcClient[redacted]"; }
    }
    private final Map<Provider,Client> clients;
    private final FusionAuthPasswordVerifier.Exchange exchange;
    private final Map<Provider,JwtDecoder> decoders;
    private final Clock clock;
    private final JsonMapper json=JsonMapper.builder().build();
    public SpringOidcProvider(Map<Provider,Client> clients,Clock clock) { this(clients,clock,new FusionAuthPasswordVerifier.HttpExchange(),null); }
    SpringOidcProvider(Map<Provider,Client> clients,Clock clock,FusionAuthPasswordVerifier.Exchange exchange,Function<ClientRegistration,NimbusJwtDecoder> supplied) {
        if(clients.isEmpty()) { throw new IllegalArgumentException("Configured OIDC clients required."); }
        this.clients=Map.copyOf(clients);this.clock=clock;this.exchange=exchange;
        var decoderMap=new EnumMap<Provider,JwtDecoder>(Provider.class);
        for(var entry:clients.entrySet()) {
            ClientRegistration registration=registration(entry.getKey(),entry.getValue(),"not-used-for-decoding");
            NimbusJwtDecoder decoder=supplied==null?decoder(entry.getValue()):supplied.apply(registration);
            var validator=new OidcIdTokenValidator(registration);validator.setClock(clock);validator.setClockSkew(Duration.ZERO);
            decoder.setJwtValidator(validator);decoderMap.put(entry.getKey(),decoder);
        }
        this.decoders=Map.copyOf(decoderMap);
    }
    @Override public String authorization(Provider provider,Purpose purpose,String state,String verifier,String nonce) {
        Client c=client(provider);
        var parameters=new LinkedHashMap<String,String>();parameters.put("response_type","code");parameters.put("client_id",c.clientId());
        parameters.put("redirect_uri",c.callback().toString());parameters.put("scope","openid email");
        parameters.put("state",state);parameters.put("nonce",ExternalSecrets.challenge(nonce));parameters.put("code_challenge",ExternalSecrets.challenge(verifier));
        parameters.put("code_challenge_method","S256");parameters.put("prompt","login");parameters.put("max_age","0");
        if(provider==Provider.APPLE) { parameters.put("response_mode","form_post"); }
        return c.authorization()+"?"+form(parameters);
    }
    @Override public Subject verify(Provider provider,Purpose purpose,String state,String code,String verifier,String nonce,Instant startedAt) {
        try {
            Client c=client(provider);ClientRegistration registration=registration(provider,c,c.secret().get());
            var request=OAuth2AuthorizationRequest.authorizationCode().authorizationUri(c.authorization().toString()).clientId(c.clientId())
                    .redirectUri(c.callback().toString()).scopes(Set.of("openid","email")).state(state)
                    .attributes(a->{a.put("nonce",nonce);a.put("code_verifier",verifier);})
                    .additionalParameters(a->{a.put("nonce",ExternalSecrets.challenge(nonce));a.put("code_challenge",ExternalSecrets.challenge(verifier));a.put("code_challenge_method","S256");}).build();
            var response=OAuth2AuthorizationResponse.success(code).redirectUri(c.callback().toString()).state(state).build();
            var oidc=new OidcAuthorizationCodeAuthenticationProvider(grant -> {
                try {
                    var fields=Map.of("grant_type","authorization_code","client_id",c.clientId(),"client_secret",registration.getClientSecret(),
                            "redirect_uri",c.callback().toString(),"code",code,"code_verifier",verifier);
                    var reply=exchange.send(HttpRequest.newBuilder(c.token()).timeout(Duration.ofSeconds(5))
                            .header("Content-Type","application/x-www-form-urlencoded").header("Accept","application/json")
                            .POST(HttpRequest.BodyPublishers.ofString(form(fields))).build());
                    if(reply.status()!=200 || reply.body().length>65536) { throw unavailable(); }
                    Map<String,Object> body=json.readValue(reply.body(),Map.class);
                    return new DefaultMapOAuth2AccessTokenResponseConverter().convert(body);
                } catch(InterruptedException e) { Thread.currentThread().interrupt();throw unavailable(); }
                catch(Exception e) { throw unavailable(); }
            },user -> new DefaultOidcUser(List.of(new org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority(user.getIdToken())),user.getIdToken()));
            oidc.setJwtDecoderFactory(ignored -> decoders.get(provider));
            var authenticated=(OAuth2LoginAuthenticationToken)oidc.authenticate(new OAuth2LoginAuthenticationToken(registration,new OAuth2AuthorizationExchange(request,response)));
            var user=(org.springframework.security.oauth2.core.oidc.user.OidcUser)authenticated.getPrincipal();
            var token=user.getIdToken();Instant now=clock.instant();Instant auth=token.getAuthenticatedAt();
            if(auth==null || auth.isBefore(startedAt.truncatedTo(java.time.temporal.ChronoUnit.SECONDS)) || auth.isAfter(now)
                    || token.getExpiresAt()==null || !now.isBefore(token.getExpiresAt())
                    || token.getIssuedAt()==null || token.getIssuedAt().isBefore(startedAt.minusSeconds(1)) || token.getIssuedAt().isAfter(now)
                    || token.getSubject()==null || token.getSubject().isBlank() || token.getSubject().length()>255) { throw new com.narudzbine.identity.api.InvalidLogin(); }
            return new Subject(c.issuer(),token.getSubject());
        } catch(ExternalFailure e) { throw e; }
        catch(Exception e) { throw new com.narudzbine.identity.api.InvalidLogin(); }
    }
    private Client client(Provider provider) { var c=clients.get(provider);if(c==null) { throw unavailable(); }return c; }
    private static ClientRegistration registration(Provider provider,Client c,String secret) {
        if(secret==null || secret.isBlank()) { throw unavailable(); }
        return ClientRegistration.withRegistrationId(provider.name()).clientId(c.clientId()).clientSecret(secret)
                .clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_POST).authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri(c.callback().toString()).scope("openid","email").authorizationUri(c.authorization().toString())
                .tokenUri(c.token().toString()).jwkSetUri(c.jwks().toString()).issuerUri(c.issuer()).userNameAttributeName("sub").build();
    }
    private static NimbusJwtDecoder decoder(Client c) {
        var factory=new JdkClientHttpRequestFactory(java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(java.net.http.HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(Duration.ofSeconds(5));var rest=new RestTemplate(factory);
        rest.getInterceptors().add((request,body,execution)-> {
            var response=execution.execute(request,body);
            try {
                byte[] bytes=response.getBody().readNBytes(65537);if(bytes.length>65536) { throw new java.io.IOException("OIDC key response too large."); }
                return new org.springframework.http.client.ClientHttpResponse() {
                    public org.springframework.http.HttpStatusCode getStatusCode() throws java.io.IOException { return response.getStatusCode(); }
                    public String getStatusText() throws java.io.IOException { return response.getStatusText(); }
                    public org.springframework.http.HttpHeaders getHeaders() { return response.getHeaders(); }
                    public java.io.InputStream getBody() { return new java.io.ByteArrayInputStream(bytes); }
                    public void close() { response.close(); }
                };
            } catch(Exception e) { response.close();throw e; }
        });
        return NimbusJwtDecoder.withJwkSetUri(c.jwks().toString()).jwsAlgorithm(SignatureAlgorithm.RS256).restOperations(rest).build();
    }
    private static String form(Map<String,String> fields) { return fields.entrySet().stream().map(e->encode(e.getKey())+"="+encode(e.getValue())).collect(java.util.stream.Collectors.joining("&")); }
    private static String encode(String s) { return URLEncoder.encode(s,StandardCharsets.UTF_8); }
    private static ExternalFailure unavailable() { return new ExternalFailure(ExternalFailure.Reason.DEPENDENCY_UNAVAILABLE); }
}
