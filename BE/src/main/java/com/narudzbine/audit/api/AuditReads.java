package com.narudzbine.audit.api;
import java.time.Instant;
import java.util.*;

/** Caller holds current named-platform or own-organization owner/admin authority through the response. */
public interface AuditReads {
    record Event(UUID id,UUID actorAccountId,String action,UUID resourceId,UUID requestId,String reason,List<String> changedFields,Instant createdAt) {}
    record Page(List<Event> items,boolean more) {}
    Page organization(UUID organization,String country,String action,int size,Instant before,UUID afterId);
    Page platform(UUID organizationFilter,String action,int size,Instant before,UUID afterId);
}
