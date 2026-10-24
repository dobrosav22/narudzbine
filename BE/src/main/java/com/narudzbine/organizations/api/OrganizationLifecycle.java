package com.narudzbine.organizations.api;
import java.util.UUID;
/** Caller holds target organization and all committing actor/member guards; no provider calls. */
public interface OrganizationLifecycle {
 OrganizationRecord close(UUID actor,UUID organization,String privateReason,boolean administrative);
}
