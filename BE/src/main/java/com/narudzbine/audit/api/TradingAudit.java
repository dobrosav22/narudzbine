package com.narudzbine.audit.api;
import java.util.UUID;
public interface TradingAudit {
    void connected(UUID actor,UUID relationship,boolean reconnected);
    void administrativeConnection(UUID actor,UUID relationship,String reason);
    void disconnected(UUID actor,UUID relationship,String reason);
}
