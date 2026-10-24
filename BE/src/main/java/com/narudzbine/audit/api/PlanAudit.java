package com.narudzbine.audit.api;
import java.util.UUID;
public interface PlanAudit { void plan(UUID actor,UUID resource,String action,String reason); }
