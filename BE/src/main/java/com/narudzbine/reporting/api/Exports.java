package com.narudzbine.reporting.api;

import java.time.*;
import java.util.UUID;

/** Current requester/organization authority is held by the HTTP caller. */
public interface Exports {
    record Scope(UUID requester,UUID organization,String country,boolean vendor) {}
    record Command(UUID id,String kind,LocalDate from,LocalDate to) {}
    record View(UUID id,String revision,String state,String expiresAt,String failureCode) {}
    record Content(byte[] bytes,String failureCode) { @Override public String toString(){return "ExportContent[redacted]";} }
    /** System maintenance only: clear expired replay payloads; retain original business/source identity. */
    void compactExpiredCreations();
    View create(Scope scope,Command command);
    View read(Scope scope,UUID id);
    Content download(Scope scope,UUID id);
}
