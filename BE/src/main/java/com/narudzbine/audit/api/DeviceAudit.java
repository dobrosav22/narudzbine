package com.narudzbine.audit.api;

import java.util.UUID;

public interface DeviceAudit {
    enum Action { DEVICE_REGISTERED, DEVICE_REPLACED, DEVICE_REMOVED }
    void deviceChanged(UUID account, UUID device, Action action);
}
