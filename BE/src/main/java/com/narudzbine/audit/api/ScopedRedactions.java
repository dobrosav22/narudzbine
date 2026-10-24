package com.narudzbine.audit.api;
import java.util.*;
/** Scoped action lifecycle; completion does not establish whole-case fulfillment. */
public interface ScopedRedactions {
 record References(String requesterVerification,String legalApplicability,String containment,String retainedScope){@Override public String toString(){return "RedactionReferences[redacted]";}}
 record Command(UUID id,String expectedCaseRevision,String scopePolicy,References references,PrivateCaseReview.Context context){}
 record View(UUID id,UUID caseId,UUID organizationId,String country,String scopePolicy,String state,String revision,String createdAt,String approvalExpiresAt,String outcome,Boolean fieldChanged,String resolvedAt,String completedAt,boolean wholeCaseFulfillment){}
 View approve(PrivateCaseReview.Access authorization,Command command);
 View read(PrivateCaseReview.Actor actor,UUID caseId,UUID id);
 View cancel(PrivateCaseReview.Access authorization,UUID id,String expectedRevision,PrivateCaseReview.Context context);
}
