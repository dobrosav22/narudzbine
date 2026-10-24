package com.narudzbine.audit.api;
import java.util.UUID;
public interface SupportAudit {
 void created(UUID actor,UUID context);
 void read(UUID actor,UUID context,UUID organization,String country,String resourceType,UUID resource,String filters);
}
