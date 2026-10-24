package com.narudzbine.identity.application;

import java.util.Locale;

public final class LoginInput {
    private LoginInput() {
    }

    public static String email(String value) {
        if (value == null) {
            throw new IllegalArgumentException("Login input is invalid.");
        }
        String email = value.strip().toLowerCase(Locale.ROOT);
        int separator = email.indexOf('@');
        if (email.length() > 254 || separator < 1 || separator > 64 || separator != email.lastIndexOf('@')
                || !email.substring(0, separator).matches("[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*")
                || !email.substring(separator + 1).matches("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+")) {
            throw new IllegalArgumentException("Login input is invalid.");
        }
        return email;
    }

    public static void password(String value) {
        if (value == null || value.codePointCount(0, value.length()) < 15
                || value.codePointCount(0, value.length()) > 128
                || value.codePoints().anyMatch(point -> point >= 0xD800 && point <= 0xDFFF)) {
            throw new IllegalArgumentException("Login input is invalid.");
        }
        // No trim, Unicode normalization, character mixture or password storage is performed here.
    }
}
