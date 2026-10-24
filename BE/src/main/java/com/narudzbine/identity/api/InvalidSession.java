package com.narudzbine.identity.api;

public final class InvalidSession extends RuntimeException {
    public InvalidSession() {
        super("Authentication is required.");
    }
}
