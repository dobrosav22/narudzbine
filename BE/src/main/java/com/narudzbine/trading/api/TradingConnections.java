package com.narudzbine.trading.api;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
/** Caller commits current party authorization and sorted organization guards with every command. */
public interface TradingConnections {
 /** Routing only until every current party guard is held; no pilot/lifetime row cap. */
 List<View> activeConnections(UUID organization);
    View updatePriceConfirmation(UUID vendor,UUID relationship,boolean required);
    void requireCapacity(UUID vendor);
    View connect(UUID vendor,UUID buyer,UUID actor);
    View disconnect(UUID organization,UUID relationship,String reason,UUID actor);
    java.util.Optional<View> find(UUID vendor,UUID buyer);
    View get(UUID organization,UUID relationship);
    Partner partner(UUID organization,UUID partner);
    /** Safe optional projection when a retained reference has no current live partner. */
    java.util.Optional<Partner> findPartner(UUID organization,UUID partner);
    Page list(UUID organization,int page,int size,String state,boolean total);
    record View(UUID id,long revision,UUID vendorId,UUID buyerId,String country,String state,String disconnectedReason,long generation,boolean confirmationRequired,Instant createdAt,Instant updatedAt){}
    record Contact(String name,String phone,String email){}
    record Partner(UUID id,String displayName,String legalName,String country,String currency,String registrationIdentifier,String taxIdentifier,Contact businessContact,UUID relationshipId,String relationshipState){}
    record Page(List<View> items,Long total){}
}
