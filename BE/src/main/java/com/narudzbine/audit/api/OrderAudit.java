package com.narudzbine.audit.api;
import java.util.UUID;
public interface OrderAudit {void messageCreated(UUID actor,UUID message);void progressed(UUID actor,UUID order,boolean delivered);void stageConfigured(UUID actor,UUID resource,String action);void stageAssigned(UUID actor,UUID order);void cancellationRequested(UUID actor,UUID order,String reason);void cancellationResolved(UUID actor,UUID order,String outcome,String reason);void cancelled(UUID actor,UUID order,String reason);void submitted(UUID actor,UUID order);void responded(UUID actor,UUID order,boolean accepted,String reason);}
