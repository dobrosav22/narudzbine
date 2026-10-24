package com.narudzbine.identity.api;

public final class LoginThrottled extends RuntimeException {
    private final long retryAfterSeconds;

    public LoginThrottled(long retryAfterSeconds) {
        super("Please retry later.");
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long retryAfterSeconds() {
        return retryAfterSeconds;
    }
}
