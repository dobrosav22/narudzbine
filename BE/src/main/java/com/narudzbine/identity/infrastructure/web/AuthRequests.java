package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.SessionTransport;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Set;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

final class AuthRequests {
    private static final JsonMapper JSON = JsonMapper.builder().enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).build();
    private static final Set<String> LOGIN_FIELDS = Set.of("email", "password", "transport", "deviceLabel", "preAuthNonce");

    static Login login(HttpServletRequest request) throws IOException {
        var body = object(request, LOGIN_FIELDS);
        return login(body);
    }

    static Reauthentication reauthentication(HttpServletRequest request) throws IOException {
        var body = object(request, Set.of("password"));
        if (!body.path("password").isString()) { throw new AuthHttpFailure(422, "VALIDATION_FAILED", "/password"); }
        String password = body.path("password").asString();
        try { com.narudzbine.identity.application.LoginInput.password(password); }
        catch (IllegalArgumentException exception) { throw new AuthHttpFailure(422, "VALIDATION_FAILED", "/password"); }
        return new Reauthentication(password);
    }

    static Language language(HttpServletRequest request, com.narudzbine.identity.application.SupportedLocales locales) throws IOException {
        var body = object(request, Set.of("expectedRevision", "languageOverride"));
        var errors = new java.util.ArrayList<AuthErrors.FieldError>();
        String revision = body.path("expectedRevision").isString() ? body.path("expectedRevision").asString() : null;
        if (revision == null || revision.isEmpty() || revision.length() > 256) {
            errors.add(new AuthErrors.FieldError("/expectedRevision", "INVALID_VALUE"));
        }
        boolean supplied = body.has("languageOverride");
        String language = null;
        if (supplied && !body.path("languageOverride").isNull()) {
            try {
                if (!body.path("languageOverride").isString()) { throw new IllegalArgumentException(); }
                language = locales.canonical(body.path("languageOverride").asString());
            } catch (IllegalArgumentException exception) {
                errors.add(new AuthErrors.FieldError("/languageOverride", "INVALID_VALUE"));
            }
        }
        if (!errors.isEmpty()) { throw new AuthHttpFailure(errors); }
        return new Language(revision, supplied, language);
    }

    static Profile profile(HttpServletRequest request) throws IOException {
        var body = object(request,Set.of("expectedRevision","displayName","homeLocationId"));
        var errors = new java.util.ArrayList<AuthErrors.FieldError>();
        String revision = body.path("expectedRevision").isString() ? body.path("expectedRevision").asString() : null;
        if (revision == null || revision.isEmpty() || revision.length() > 256) { errors.add(new AuthErrors.FieldError("/expectedRevision","INVALID_VALUE")); }
        String name = null;
        try {
            if (!body.path("displayName").isString()) { throw new IllegalArgumentException(); }
            name = com.narudzbine.identity.application.OwnAccountService.profileName(body.path("displayName").asString());
        } catch (IllegalArgumentException exception) { errors.add(new AuthErrors.FieldError("/displayName","INVALID_VALUE")); }
        java.util.UUID location = null;
        if (!(body.has("homeLocationId") && body.path("homeLocationId").isNull())) {
            try {
                location = LocationRequests.id(body.path("homeLocationId").isString() ? body.path("homeLocationId").asString() : null,"BODY","/homeLocationId");
            } catch (AuthHttpFailure failure) { errors.addAll(failure.fields); }
        }
        if (!errors.isEmpty()) { errors.sort(java.util.Comparator.comparing(AuthErrors.FieldError::path)); throw new AuthHttpFailure(errors); }
        return new Profile(revision,name,location);
    }
    record Profile(String expectedRevision,String displayName,java.util.UUID homeLocationId) {
        @Override public String toString() { return "Profile[redacted]"; }
    }

    record Language(String expectedRevision, boolean supplied, String languageOverride) {
        @Override public String toString() { return "Language[redacted]"; }
    }

    static tools.jackson.databind.JsonNode object(HttpServletRequest request, Set<String> fields) throws IOException {
        return object(request, fields, 16384);
    }

    static tools.jackson.databind.JsonNode object(HttpServletRequest request, Set<String> fields, int maximumBytes) throws IOException {
        if (request.getContentType() == null || !request.getContentType().split(";", 2)[0].strip().equalsIgnoreCase("application/json")) {
            throw new AuthHttpFailure(415, "UNSUPPORTED_MEDIA_TYPE");
        }
        byte[] bytes = request.getInputStream().readNBytes(maximumBytes + 1);
        if (bytes.length > maximumBytes) { throw new AuthHttpFailure(413, "PAYLOAD_TOO_LARGE"); }
        tools.jackson.databind.JsonNode body;
        try { body = JSON.readTree(bytes); }
        catch (RuntimeException exception) { throw new AuthHttpFailure(400, "MALFORMED_JSON"); }
        if (body == null || !body.isObject()) { throw new AuthHttpFailure(422, "VALIDATION_FAILED", ""); }
        for (String name : body.propertyNames()) {
            if (!fields.contains(name)) { throw new AuthHttpFailure(422, "VALIDATION_FAILED", ""); }
        }
        return body;
    }

    private static Login login(tools.jackson.databind.JsonNode body) {
        var errors = new java.util.ArrayList<AuthErrors.FieldError>();
        for (String name : LOGIN_FIELDS.stream().sorted().toList()) {
            if (name.equals("preAuthNonce") && !body.has(name)) { continue; }
            if (!body.path(name).isString()) { errors.add(new AuthErrors.FieldError("/" + name, "INVALID_VALUE")); continue; }
            String value = body.path(name).asString();
            try {
                switch (name) {
                    case "email" -> com.narudzbine.identity.application.LoginInput.email(value);
                    case "password" -> com.narudzbine.identity.application.LoginInput.password(value);
                    case "deviceLabel" -> com.narudzbine.identity.application.SessionService.normalizeLabel(value);
                    case "transport" -> SessionTransport.valueOf(value);
                    case "preAuthNonce" -> { if (!value.matches("[A-Za-z0-9_-]{43}")) { throw new IllegalArgumentException(); } }
                    default -> throw new IllegalStateException();
                }
            } catch (IllegalArgumentException exception) { errors.add(new AuthErrors.FieldError("/" + name, "INVALID_VALUE")); }
        }
        if (!errors.isEmpty()) { throw new AuthHttpFailure(errors); }
        SessionTransport transport;
        try { transport = SessionTransport.valueOf(body.path("transport").asString()); }
        catch (IllegalArgumentException exception) { throw new AuthHttpFailure(422, "VALIDATION_FAILED", "/transport"); }
        return new Login(body.path("email").asString(), body.path("password").asString(), transport,
                body.path("deviceLabel").asString(), body.has("preAuthNonce") ? body.path("preAuthNonce").asString() : null);
    }

    record Login(String email, String password, SessionTransport transport, String deviceLabel, String preAuthNonce) {
        @Override public String toString() { return "Login[redacted]"; }
    }

    record Reauthentication(String password) {
        @Override public String toString() { return "Reauthentication[redacted]"; }
    }
}
