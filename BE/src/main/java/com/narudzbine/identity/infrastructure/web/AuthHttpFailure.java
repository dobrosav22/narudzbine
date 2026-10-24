package com.narudzbine.identity.infrastructure.web;

final class AuthHttpFailure extends RuntimeException {
    final int status;
    final String code;
    final String path;
    final java.util.List<AuthErrors.FieldError> fields;
    AuthHttpFailure(int status, String code) { this(status, code, null); }
    AuthHttpFailure(int status, String code, String path) {
        super("Authentication request could not be accepted.");
        this.status = status; this.code = code; this.path = path;
        fields = path == null ? java.util.List.of() : java.util.List.of(new AuthErrors.FieldError(path, "INVALID_VALUE"));
    }
    AuthHttpFailure(java.util.List<AuthErrors.FieldError> fields) {
        super("Authentication request could not be accepted.");
        status = 422; code = "VALIDATION_FAILED"; path = null; this.fields = java.util.List.copyOf(fields);
    }
}
