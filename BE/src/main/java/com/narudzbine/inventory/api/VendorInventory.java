package com.narudzbine.inventory.api;
import java.time.Instant;
import java.util.*;
/** Caller holds current vendor stock authority and organization guard throughout the business transaction. */
public interface VendorInventory {
 record Receipt(Item item,String originalRevision){}
 record Tracking(UUID vendor,long revision,boolean enabled,long epoch,long generation){}
 record Item(UUID productId,long revision,Integer availableCount,boolean trackingEnabled,boolean confirmationRequired,long creditQuantity,long maximumSettableCount,long epoch,UUID vendor){}
 record Event(UUID id,UUID productId,String type,Integer before,int after,int delta,String reason,UUID actorAccountId,UUID orderId,Instant createdAt){}
 record Page(List<Event> items,boolean more){}
 Tracking tracking(UUID vendor);
 Item get(UUID vendor,UUID product);
 Item set(UUID actor,UUID vendor,UUID product,int count,String reason);
 Item adjust(UUID actor,UUID vendor,UUID product,int delta,String reason);
 Item confirm(UUID actor,UUID vendor,UUID product);
 Page events(UUID vendor,UUID product,int size,Instant after,UUID afterId);
 void lockReplay(UUID actor,String operation,byte[] identity);
 Optional<Receipt> replay(UUID actor,UUID vendor,UUID product,String operation,byte[] identity,byte[] digest);
 void remember(UUID actor,String operation,byte[] identity,byte[] digest,Item result,String originalRevision);
 void compactExpiredReplay();
}
