package com.narudzbine.shared.infrastructure.web;

import org.springframework.boot.web.server.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public final class ListenerPorts implements com.narudzbine.shared.api.ListenerAccess {
    private volatile int managementPort = -1;

    @EventListener
    public void initialized(WebServerInitializedEvent event) {
        if ("management".equals(event.getApplicationContext().getServerNamespace())) {
            managementPort = event.getWebServer().getPort();
        }
    }

    public boolean isManagement(int port) {
        return port == managementPort;
    }
}
