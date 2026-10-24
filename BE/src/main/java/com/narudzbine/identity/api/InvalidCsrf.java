package com.narudzbine.identity.api;

public final class InvalidCsrf extends RuntimeException {
    public InvalidCsrf() {
        super("Browser request verification failed.");
    }
}
