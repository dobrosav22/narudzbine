package com.narudzbine.buyerworkspace.api;
import java.time.Instant;
import java.util.*;
/** Caller owns the transaction and current buyer organization guard; this port grants no catalogue access. */
public interface SharedFavorites {
 record Item(UUID productId,UUID vendorId,Instant createdAt){}
 record Page(List<Item> items,Long total){}
 Page list(UUID buyer,int page,int size,boolean total);
 Item add(UUID buyer,UUID vendor,UUID product);
 void remove(UUID buyer,UUID product);
}
