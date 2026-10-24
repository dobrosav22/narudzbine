package com.narudzbine.audit.api;
import java.util.*;
/** Accountable assisted review; terminal resolution never asserts that all data was erased. */
public interface CaseDispositions {
 List<String> FAMILIES=List.of("CURRENT_DISPLAY_NAME","HISTORICAL_ATTRIBUTION","LOGIN_EMAIL","SHARED_MESSAGE_TEXT","CONTACTS_LOCATIONS","COMMERCIAL_DOCUMENTS_MEDIA","AUDIT_IDENTITY_HISTORY","PROVIDER_DELIVERY_COPIES","BACKUPS_ARCHIVES","ADDITIONAL_SCOPE");
 record Item(String family,String disposition,UUID jobId,String reference){@Override public String toString(){return "DispositionItem[redacted]";}}
 record Command(UUID id,String expectedCaseRevision,List<Item> items,boolean resolveCase,boolean acceptRetainedScope,ScopedRedactions.References references,PrivateCaseReview.Context context){public Command{items=List.copyOf(items);}@Override public String toString(){return "DispositionCommand[redacted]";}}
 record View(UUID id,UUID caseId,UUID organizationId,String country,String state,String revision,String createdAt,boolean assistedReviewResolved,boolean allDataErased,List<Item> items){public View{items=List.copyOf(items);}@Override public String toString(){return "DispositionView[redacted]";}}
 View record(PrivateCaseReview.Access access,Command command);
 View read(PrivateCaseReview.Actor actor,UUID caseId,UUID id);
}
