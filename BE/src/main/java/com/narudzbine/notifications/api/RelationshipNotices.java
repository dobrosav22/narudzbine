package com.narudzbine.notifications.api;
import java.time.Instant;
import java.util.UUID;
/** Durable ordinary intent only. Delivery must recheck access and event/channel preferences. */
public interface RelationshipNotices {
    void disconnected(UUID relationship,long revision,UUID vendor,UUID buyer,UUID actor,Instant now);
}
