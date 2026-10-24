package com.narudzbine.reporting.api;

/** Worker authority for an immutable, previously authorized stored request; no session impersonation. */
public interface ExportAuthority {
    enum Result { ALLOWED, DEFER, REVOKED }
    Result lock(Exports.Scope scope,String kind);
}
