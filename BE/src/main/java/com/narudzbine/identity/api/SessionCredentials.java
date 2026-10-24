package com.narudzbine.identity.api;

/** Request-memory-only secrets. Do not serialize this object directly; the HTTP adapter owns transport projection. */
public final class SessionCredentials {
    private final SessionView session;
    private final String secret;
    private final String csrfToken;

    public SessionCredentials(SessionView session, String secret, String csrfToken) {
        this.session = session;
        this.secret = secret;
        this.csrfToken = csrfToken;
    }

    public SessionView session() {
        return session;
    }

    public String secret() {
        return secret;
    }

    public String csrfToken() {
        return csrfToken;
    }

    @Override
    public String toString() {
        return "SessionCredentials[REDACTED]";
    }
}
