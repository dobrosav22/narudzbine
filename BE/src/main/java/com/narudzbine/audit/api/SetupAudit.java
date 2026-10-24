package com.narudzbine.audit.api;
import java.util.UUID;
public interface SetupAudit {
    void setup(UUID actor,UUID resource,String action,String reason);
}
