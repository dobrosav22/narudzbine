package com.narudzbine.reporting.api;
import java.util.List;
/** Administrative operational metadata only; caller holds current named-platform authority. */
public interface PlatformSummary {
 record Country(String country,long activeBuyers,long activeVendors,long activeBusinessUsers,long activeConnections,long pendingPlanRequests){}
 List<Country> read();
}
