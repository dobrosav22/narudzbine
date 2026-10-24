package com.narudzbine.audit.api;
import java.time.Instant;
import java.util.*;
/** Both phases require current organization/account/session/qualification guards. */
public interface PrivateCaseReview {
 record Target(UUID organization,String country){}
 record Actor(UUID account,UUID session,String transport){}
 record Context(String reason,String caseReference){@Override public String toString(){return "ReviewContext[redacted]";}}
 record Access(UUID id,UUID caseId,Target target,Actor actor,byte[] nonce,Instant expires){
  public Access{nonce=nonce.clone();}@Override public byte[] nonce(){return nonce.clone();}@Override public String toString(){return "PrivateReviewAccess[redacted]";}
 }
 record Result(UUID id,UUID organizationId,String country,String kind,UUID requesterAccountId,String requestReason,String createdAt,UUID reviewAuthorizationId){@Override public String toString(){return "PrivateCaseReview[redacted]";}}
 Optional<Target> route(UUID caseId);
 long qualify(UUID actor);
 Access authorize(UUID caseId,Target target,Actor actor,Context context);
 Result disclose(Access access);
}
