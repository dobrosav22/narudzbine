package com.narudzbine.audit.api;
import java.util.UUID;
public interface InventoryAudit {void stock(UUID actor,UUID product,String type);void tracking(UUID actor,UUID vendor,boolean enabled);void reconciliation(UUID actor,UUID preview,String action);}
