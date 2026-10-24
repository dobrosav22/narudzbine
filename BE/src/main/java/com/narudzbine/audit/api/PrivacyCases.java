package com.narudzbine.audit.api;

import java.util.UUID;

/** Caller holds current organization/account/session guards through commit. */
public interface PrivacyCases {
    View create(Scope scope,Command command);
    View read(Scope scope,UUID id);
    View administrative(UUID actor,UUID id);
    record Scope(UUID actor,UUID organization,String country) {}
    record Command(UUID id,String kind,String reason) {
        @Override public String toString(){return "PrivacyCommand[redacted]";}
    }
    record View(UUID id,String revision,String kind,UUID organizationId,String state,String createdAt) {}
}
