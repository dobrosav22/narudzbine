package com.narudzbine.notifications.api;
import java.time.Instant;
import java.util.UUID;
public interface OrderNotices {void messageCreated(UUID order,UUID message,UUID recipientOrganization,Instant at);void cancellationRequested(UUID order,UUID event,UUID vendor,Instant at);void cancelled(UUID order,UUID event,UUID buyer,UUID vendor,UUID submitter,UUID actor,UUID actorOrganization,Instant at);void submitted(UUID order,UUID vendor,UUID buyer,Instant at);void responded(UUID order,UUID event,UUID buyer,UUID submitter,Instant at);}
