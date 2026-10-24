package com.narudzbine.notifications.api;

import java.time.Instant;
import java.util.UUID;

/** Durable producer only: joins the business transaction and does not call a provider. */
public interface SecurityNotices {
    void recovered(UUID organization,UUID recovery,UUID recipient,String oldEmail,String newEmail,boolean ownerChanged,Instant occurredAt);
    void ownerChanged(UUID organization,UUID transfer,UUID formerOwner,UUID newOwner,Instant occurredAt);
    void passwordChanged(UUID account, UUID operation, Instant occurredAt);
    void emailChangeStarted(UUID account,UUID change,String oldEmail,Instant occurredAt);
    void emailChanged(UUID account,UUID change,UUID operation,String oldEmail,String newEmail,Instant occurredAt);
}
