package com.narudzbine.identity.api;

public final class InvalidLogin extends RuntimeException {
    public InvalidLogin() {
        super("The supplied credentials could not be accepted.");
    }
}
