package com.narudzbine.audit.api;
import java.util.*;
/** Read-only assessment; not an executable plan or legal erasure result. */
public interface RedactionPreviews {
 record FieldAction(String family,String field,String proposedAction,long relatedRecords){}
 record RetainedFamily(String family,String sourceScope,Long relatedRecords,String reviewCode){}
 record Preview(UUID caseId,UUID organizationId,String country,UUID subjectAccountId,String policy,String evaluatedAt,UUID reviewAuthorizationId,List<FieldAction> fieldActions,List<RetainedFamily> retainedFamilies,List<String> blockers,boolean executionAvailable){public Preview{fieldActions=List.copyOf(fieldActions);retainedFamilies=List.copyOf(retainedFamilies);blockers=List.copyOf(blockers);}@Override public String toString(){return "RedactionPreview[redacted]";}}
 Preview inspect(PrivateCaseReview.Access authorization);
}
