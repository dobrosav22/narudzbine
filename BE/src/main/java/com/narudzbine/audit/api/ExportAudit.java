package com.narudzbine.audit.api;
import java.util.UUID;
public interface ExportAudit {void exportCreated(UUID actor,UUID id);void exportDownloaded(UUID actor,UUID id);}
