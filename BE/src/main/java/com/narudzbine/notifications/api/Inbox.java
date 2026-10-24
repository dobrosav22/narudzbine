package com.narudzbine.notifications.api;
import java.time.Instant;
import java.util.*;
public interface Inbox {
 enum Event {ORDER_SUBMITTED,ORDER_STATUS_CHANGED,CANCELLATION_REQUESTED,CANCELLATION_RESOLVED,MESSAGE_CREATED,RELATIONSHIP_DISCONNECTED}
 record Preference(Event event,boolean inApp,boolean email,boolean push){}
 record Preferences(UUID id,long revision,String languageOverride,List<Preference> events){}
 record Item(UUID id,String event,UUID orderId,UUID organizationId,String text,boolean read,Instant createdAt){}
 record Position(Instant at,UUID id){}
 record Page(List<Item> items,boolean more){}
 Preferences preferences(UUID account);
 Preferences replace(UUID account,long expected,List<Preference> values);
 Page list(UUID account,int size,Boolean unread,Position position);
 Item markRead(UUID account,UUID id);
}
