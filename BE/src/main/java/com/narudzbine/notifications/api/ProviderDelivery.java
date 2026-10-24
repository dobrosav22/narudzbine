package com.narudzbine.notifications.api;

import java.util.Map;
import java.util.UUID;

public final class ProviderDelivery {
    private ProviderDelivery() {}
    public enum Status { ACCEPTED, RETRY, REJECTED, UNKNOWN, INVALID_TOKEN }
    public record Result(Status status,String reference,long retryAfterSeconds) {
        public static Result of(Status status) { return new Result(status,null,0); }
    }
    public record Mail(String from,String to,String subject,String text,String html) {
        @Override public String toString() { return "Mail[redacted]"; }
    }
    public interface Email { Result send(UUID delivery,Mail mail); }
    public interface Push { Result send(String token,Map<String,String> data); String environment();String projectId(); }
    public record Technical(String to,String locale,String event,String link,long expiryMinutes) {
        @Override public String toString() { return "Technical[redacted]"; }
    }
    /** Called only inside a committing transaction after source organization/account guards. Null suppresses stale work. */
    public interface TechnicalEmails { Technical resolve(String kind,UUID source); }
    public interface Devices {
        record Address(UUID id,long revision,String tokenHash,String token) {
            @Override public String toString() { return "PushAddress[redacted]"; }
        }
        Address address(UUID account,UUID device);
        void invalid(UUID account,UUID device,long revision,String tokenHash);
    }
}
