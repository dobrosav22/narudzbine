package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.DeviceService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

final class DeviceMaintenance {
    private final DeviceService devices;
    private final TransactionTemplate tx;
    private final System.Logger logger;
    DeviceMaintenance(DeviceService devices,PlatformTransactionManager manager) {
        this(devices,manager,System.getLogger(DeviceMaintenance.class.getName()));
    }
    DeviceMaintenance(DeviceService devices,PlatformTransactionManager manager,System.Logger logger) {
        this.devices=devices;this.logger=logger;tx=new TransactionTemplate(manager);tx.setTimeout(10);
    }
    @Scheduled(fixedDelay=60000,initialDelayString="${identity.http.maintenance.initial-delay-ms:60000}")
    public void tick() {
        try { tx.executeWithoutResult(s->devices.cleanup()); }
        catch(RuntimeException deferred) { logger.log(System.Logger.Level.WARNING,"Device cleanup deferred; inspect runtime configuration and retained registrations"); }
    }
}
