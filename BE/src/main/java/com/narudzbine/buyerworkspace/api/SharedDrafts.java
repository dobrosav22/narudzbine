package com.narudzbine.buyerworkspace.api;
import java.time.Instant;
import java.util.*;
/** Caller holds current buyer authority and organization guards for the entire transaction. */
public interface SharedDrafts {
 record Line(UUID productId,int quantity){}
 record Contact(String name,String phone,String email){}
 record Preparation(UUID deliveryLocationId,Contact contactOverride,String instructionsOverride,String note,UUID replacementForOrderId,String instructionsMode){}
 record Intent(UUID vendorId,List<Line> lines,UUID deliveryLocationId,Contact contactOverride,String instructionsOverride,String note,UUID replacementForOrderId,String instructionsMode){public Intent{lines=List.copyOf(lines);}public Preparation preparation(){return new Preparation(deliveryLocationId,contactOverride,instructionsOverride,note,replacementForOrderId,instructionsMode);}}
 record Item(UUID id,UUID buyerId,long revision,Intent intent,String state,Long discardedFromRevision,UUID submittedOrderId,Instant createdAt,Instant updatedAt){}
 record Page(List<Item> items,Long total){}
 Optional<UUID> vendor(UUID buyer,UUID id);
 Item read(UUID buyer,UUID id);
 Page list(UUID buyer,int page,int size,boolean total);
 Optional<Item> replay(UUID actor,UUID buyer,UUID id,byte[] digest);
 Item create(UUID actor,UUID buyer,UUID id,Intent intent,byte[] digest);
 Item replace(UUID actor,UUID buyer,UUID id,Intent intent);
 Item discard(UUID actor,UUID buyer,UUID id);
 Item consume(UUID actor,UUID buyer,UUID id,UUID order,Instant at);
 void compactExpiredReceipts();
}
