package com.narudzbine.ordering.api;
import com.narudzbine.organizations.api.*;
import java.time.Instant;
import java.util.*;
/** Caller owns sorted party guards and current account/session/role authority. */
public interface Orders {
 /** Final query requires target organization guard; latest core event revision is authoritative. */
 boolean hasNonterminal(UUID organization);
 record Message(UUID id,UUID orderId,UUID authorOrganizationId,UUID authorAccountId,String authorDisplayName,String text,Instant createdAt){@Override public String toString(){return "Message[redacted]";}}
 Page<Message> messages(UUID organization,UUID order,int size,Instant afterAt,UUID afterId);
 Optional<Message> replayMessage(UUID actor,UUID organization,UUID order,byte[] identity,byte[] payload,Instant at);
 Message message(UUID actor,String actorName,UUID organization,UUID order,String text,byte[] identity,byte[] payload,Instant at);
 record Party(UUID organizationId,String displayName,String legalName,Country country,String registrationIdentifier,String taxIdentifier,OrganizationRecord.Address registeredAddress){}
 record Snapshot(UUID id,long revision,String number,Party vendor,Party buyer,String state,String originalRevision,OrderReviews.Result terms,UUID submittedByAccountId,String submittedByDisplayName,Instant submittedAt,Fulfillment fulfillment,Instant updatedAt,UUID cancellationRequestId,StageAssignment stage){}
 record StageAssignment(UUID id,String name){}
 record ProgressCommand(String action,String expectedRevision){}
 Optional<Snapshot> replayProgress(UUID vendor,UUID order,ProgressCommand command);
 Snapshot progress(UUID actor,String actorName,UUID vendor,UUID order,ProgressCommand command,Instant at);
 record StageCommand(String expectedRevision,UUID stageId){}
 record Fulfillment(LocationRecord location,String revision){}
 record RequestSnapshot(UUID id,long revision,String originalRevision,UUID orderId,String reason,String state,String resolutionReason,Instant createdAt,Instant updatedAt){}
 record RequestResolution(String action,String expectedRevision,String reason){}
 record CancellationCommand(String expectedRevision,String reason){}
 record ResponseCommand(String action,String expectedRevision,UUID fulfillmentLocationId,String reason){}
 record Outcome(Snapshot order,OrderReviews.Result currentTerms,List<OrderReviews.Issue> unavailableLines){public Outcome{unavailableLines=List.copyOf(unavailableLines);}}
 record Filter(String state,UUID partner,Instant from,Instant until){}
 record Event(UUID id,UUID orderId,String state,UUID actorOrganizationId,UUID actorAccountId,String actorDisplayName,Instant createdAt,String previousState,String reason,UUID cancellationRequestId,String cancellationRequestState,UUID stageId,String stageName,UUID previousStageId,String previousStageName,String stageConfigurationRevision){}
 record Page<T>(List<T> items,boolean more){public Page{items=List.copyOf(items);}}
 Page<Snapshot> list(UUID organization,OrganizationType type,Filter filter,int size,Instant afterAt,UUID afterId);
 Page<Event> events(UUID organization,UUID order,int size,Instant afterAt,UUID afterId);
 void lockReplay(UUID actor,UUID buyer,byte[] identity);
 Optional<UUID> replayVendor(UUID actor,UUID buyer,byte[] identity);
 /** Original-buyer routing only; caller must lock and authorize before returning source/live data. */
 Optional<UUID> buyerVendor(UUID buyer,UUID order);
 /** Vendor-party routing only; final authority/guards still required. */
 Optional<UUID> responseBuyer(UUID vendor,UUID order);
 Optional<Snapshot> replayResponse(UUID vendor,UUID order,ResponseCommand command);
 Snapshot respond(UUID actor,String actorName,UUID vendor,Country country,UUID order,ResponseCommand command,Instant at);
 Optional<UUID> cancellationPartner(UUID organization,UUID order);
 Optional<Snapshot> replayCancellation(UUID organization,UUID order,CancellationCommand command);
 Snapshot cancel(UUID actor,String actorName,UUID organization,UUID order,CancellationCommand command,Instant at);
 RequestSnapshot readCancellationRequest(UUID organization,UUID order,UUID request);
 Optional<RequestSnapshot> replayCancellationRequest(UUID buyer,UUID order,CancellationCommand command);
 RequestSnapshot requestCancellation(UUID actor,String actorName,UUID buyer,UUID order,CancellationCommand command,Instant at);
 Optional<RequestSnapshot> replayCancellationResolution(UUID organization,UUID order,UUID request,RequestResolution command);
 RequestSnapshot resolveCancellation(UUID actor,String actorName,UUID organization,UUID order,UUID request,RequestResolution command,Instant at);
 /** Caller owns current vendor authority and sorted pair guards; actual dispatch must use this admission. */
 void requireNoPendingCancellation(UUID vendor,UUID order);
 Optional<Snapshot> replayStage(UUID vendor,UUID order,StageCommand command);
 Snapshot assignStage(UUID actor,String actorName,UUID vendor,UUID order,StageCommand command,Instant at);
 String currentStageName(UUID vendor,UUID stage);
 Snapshot read(UUID organization,UUID order);
 Optional<Snapshot> replay(UUID actor,UUID buyer,UUID review,byte[] identity,byte[] digest,Instant at);
 Outcome submit(UUID actor,String actorName,UUID buyer,Country country,UUID review,byte[] identity,byte[] digest,Instant at);
 Optional<Snapshot> replayDraft(UUID buyer,UUID draft,UUID review,String expected);
 Outcome submitDraft(UUID actor,String actorName,UUID buyer,Country country,UUID draft,long revision,UUID review,String expected,Instant at);
 void compactExpiredReplays();
}
