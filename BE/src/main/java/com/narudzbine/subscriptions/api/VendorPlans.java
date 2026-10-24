package com.narudzbine.subscriptions.api;
import java.util.*;
import java.time.Instant;
/** All calls join the caller transaction; writes require current vendor organization guard/authority. */
public interface VendorPlans {
 record Plan(UUID id,String code,int revision,boolean retired,int productLimit,int activeBuyerLimit){}
 record Assignment(UUID id,long revision,Plan plan,int nonArchivedProductCount,int activeBuyerCount){}
 record Request(UUID id,UUID vendorId,long revision,UUID requestedPlanRevisionId,String state,String resolutionReason,Instant createdAt,Instant updatedAt){}
 record Page<T>(List<T> items,Long total){}
 void supersedeForClosure(UUID actor,UUID vendor);
 Assignment current(UUID vendor);
 Page<Plan> plans(int page,int size,boolean retired,boolean total);
 Page<Request> requests(UUID vendor,int page,int size,String state,boolean total);
 Request request(UUID vendor,UUID id);
 Request create(UUID actor,UUID vendor,UUID target);
 void withdraw(UUID actor,UUID vendor,UUID id);
 Assignment assign(UUID actor,UUID vendor,UUID target,String reason,boolean supersede);
 Request resolve(UUID actor,UUID vendor,UUID id,boolean approve,String reason);
}
