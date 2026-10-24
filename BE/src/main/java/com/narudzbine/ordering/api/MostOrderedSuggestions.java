package com.narudzbine.ordering.api;
import com.narudzbine.organizations.api.Country;
import java.util.*;
/** Internal routing until current buyer/page-vendor guards and current Offer authority are acquired. */
public interface MostOrderedSuggestions {
 record Item(UUID productId,UUID vendorId){}
 record Page(List<Item> items,Long total){}
 Page list(UUID buyer,Country country,UUID vendor,int page,int size,boolean total);
}
