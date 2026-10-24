package com.narudzbine.audit.api;
import java.util.UUID;
public interface ImportAudit {void imported(UUID actor,UUID preview,boolean confirmed);}
