package com.narudzbine.notifications.api;

/** Internal maintenance port; no customer deletion or provider-retry operation. */
public interface NotificationRetention {
    int inbox();
    int deliveries();
    int callbacks();
}
