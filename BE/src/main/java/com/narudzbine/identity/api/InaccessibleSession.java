package com.narudzbine.identity.api;

public final class InaccessibleSession extends RuntimeException {
    public InaccessibleSession() {
        super("Session was not found.");
    }
}
