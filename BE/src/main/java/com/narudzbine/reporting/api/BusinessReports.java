package com.narudzbine.reporting.api;

import java.time.*;
import java.util.*;

/** Caller validates own-organization scope before the snapshot and current authority before publication.
 * All response queries use one read-only repeatable-read transaction. */
public interface BusinessReports {
    record Scope(UUID organizationId, String country, boolean vendor) {}
    record Range(LocalDate from, LocalDate to, ZoneId zone, Instant start, Instant until, Instant asOf) {}
    record Bucket(LocalDate periodStart, long orderCount, long quantity, String goodsTotal) {}
    record Summary(LocalDate from, LocalDate to, String grouping, String timezone, String currency,
            String priceBasis, String asOf, long orderCount, long quantity, String goodsTotal,
            Long activeBuyerCount, List<Bucket> buckets) {}
    record Product(UUID productId, String name, String sku, String unitName, long orderCount,
            long quantity, String goodsTotal) {}
    record Buyer(UUID buyerId, String displayName, boolean activeConnection, long orderCount,
            String goodsTotal, String lastOrderAt) {}
    record Page<T>(List<T> items, int page, int size, Long total) {}
    Summary summary(Scope scope, Range range, String grouping);
    Page<Product> products(Scope scope, Range range, int page, int size, boolean total);
    Page<Buyer> buyers(Scope scope, Range range, int page, int size, boolean total);
}
