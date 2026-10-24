package com.narudzbine.audit.api;
import java.util.UUID;
public interface UploadAudit {
    void upload(UUID actor,UUID asset,boolean confirmed);
}
