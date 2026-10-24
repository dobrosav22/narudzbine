package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.AccountAudit;
import com.narudzbine.audit.api.LocationAudit;
import com.narudzbine.audit.api.OrganizationAudit;
import java.util.List;
import java.util.stream.Collectors;
import com.narudzbine.audit.api.SessionAudit;
import com.narudzbine.audit.api.SessionAuditAction;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class JdbcIdentityAudit implements com.narudzbine.audit.api.ExportAudit, com.narudzbine.audit.api.DeviceAudit, com.narudzbine.audit.api.UploadAudit, com.narudzbine.audit.api.ImportAudit, com.narudzbine.audit.api.OrderAudit, com.narudzbine.audit.api.InventoryAudit, com.narudzbine.audit.api.PricingAudit, com.narudzbine.audit.api.ProductAudit, com.narudzbine.audit.api.TaxonomyAudit, com.narudzbine.audit.api.PlanAudit, com.narudzbine.audit.api.TradingAudit, com.narudzbine.audit.api.SetupAudit, com.narudzbine.audit.api.RecoveryAudit, SessionAudit, AccountAudit, OrganizationAudit, LocationAudit, com.narudzbine.audit.api.ContactAudit, com.narudzbine.audit.api.MemberAudit, com.narudzbine.audit.api.TransferAudit, com.narudzbine.audit.api.PasswordAudit, com.narudzbine.audit.api.EmailAudit, com.narudzbine.audit.api.ExternalAudit {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final UuidGenerator ids;

    public JdbcIdentityAudit(JdbcTemplate jdbc, Clock clock, UuidGenerator ids) {
        this.jdbc = jdbc;
        this.clock = clock;
        this.ids = ids;
    }

    @Override public void deviceChanged(UUID account,UUID device,com.narudzbine.audit.api.DeviceAudit.Action action) {
        append(action.name(),"DEVICE",account,device,"{registration}");
    }

    @Override
    public void record(SessionAuditAction action, UUID accountId, UUID sessionId) {
        Objects.requireNonNull(action);
        append(action.name(), "SESSION", accountId, sessionId, action.changedFields());
    }

    @Override
    public void languageChanged(UUID accountId) {
        append("ACCOUNT_LANGUAGE_CHANGED", "ACCOUNT", accountId, accountId, "{languageOverride}");
    }

    @Override
    public void profileChanged(UUID accountId, List<AccountAudit.ProfileField> fields) {
        if (fields.isEmpty()) { throw new IllegalArgumentException("Changed fields are required."); }
        String names = fields.stream().map(Enum::name).distinct().sorted().collect(Collectors.joining(",", "{", "}"));
        append("ACCOUNT_PROFILE_UPDATED", "ACCOUNT", accountId, accountId, names);
    }

    @Override
    public void settingsChanged(UUID actorId, UUID organizationId, List<OrganizationAudit.Field> fields) {
        if (fields.isEmpty()) { throw new IllegalArgumentException("Changed fields are required."); }
        String names = fields.stream().map(Enum::name).distinct().sorted().collect(Collectors.joining(",", "{", "}"));
        append("ORGANIZATION_UPDATED", "ORGANIZATION", actorId, organizationId, names);
    }

    @Override
    public void changed(UUID actor, UUID location, LocationAudit.Action action, List<LocationAudit.Field> fields) {
        if (fields.isEmpty()) { throw new IllegalArgumentException("Changed fields are required."); }
        String names = fields.stream().map(Enum::name).distinct().sorted().collect(Collectors.joining(",", "{", "}"));
        append(action.name(), "LOCATION", actor, location, names);
    }

    @Override
    public void changed(UUID actor, UUID contact, com.narudzbine.audit.api.ContactAudit.Action action,
            List<com.narudzbine.audit.api.ContactAudit.Field> fields) {
        if (fields.isEmpty()) { throw new IllegalArgumentException("Changed fields are required."); }
        String names=fields.stream().map(Enum::name).distinct().sorted().collect(Collectors.joining(",","{","}"));
        append(action.name(),"CONTACT",actor,contact,names);
    }

    @Override
    public void changed(UUID actor, UUID member, com.narudzbine.audit.api.MemberAudit.Action action,
            List<com.narudzbine.audit.api.MemberAudit.Field> fields) {
        if (fields.isEmpty()) { throw new IllegalArgumentException("Changed fields are required."); }
        String names=fields.stream().map(Enum::name).distinct().sorted().collect(Collectors.joining(",","{","}"));
        append(action.name(),"MEMBER",actor,member,names);
    }

    @Override
    public void changed(UUID actor,UUID transfer,com.narudzbine.audit.api.TransferAudit.Action action) {
        append(action.name(),"OWNERSHIP_TRANSFER",actor,transfer,
                action==com.narudzbine.audit.api.TransferAudit.Action.TRANSFER_ACCEPTED?"{ownerAccountId,roles,securityEpoch,sessions,state}":"{state}");
    }

    @Override
    public void passwordOperation(UUID account, UUID operation, com.narudzbine.audit.api.PasswordAudit.Action action) {
        append(action.name(), "CREDENTIAL_OPERATION", account, operation, "{credentialGeneration,securityEpoch,sessions,state}");
    }
    @Override public void emailChange(UUID account,UUID change,com.narudzbine.audit.api.EmailAudit.Action action) {
        append(action.name(),"EMAIL_CHANGE",account,change,"{state,mailboxVerification}");
    }
    @Override public void externalIdentity(UUID account,UUID identity,com.narudzbine.audit.api.ExternalAudit.Action action) {
        append(action.name(),"EXTERNAL_IDENTITY",account,identity,"{signInMethods,credentialGeneration,securityEpoch,sessions}");
    }
    @Override public void emailOperation(UUID account,UUID operation,com.narudzbine.audit.api.EmailAudit.OperationAction action) {
        append(action.name(),"CREDENTIAL_OPERATION",account,operation,"{email,credentialGeneration,securityEpoch,sessions,state}");
    }

    @Override public void recovery(UUID actor,UUID caseId,com.narudzbine.audit.api.RecoveryAudit.Action action,String reason) {
        append(action.name(),"RECOVERY_CASE",actor,caseId,"{state,authority,evidenceReference}",reason);
    }
    @Override public void setup(UUID actor,UUID resource,String action,String reason) {
        append(action,"SETUP",actor,resource,"{state,generation,organization,owner,plan}",reason);
    }
    @Override public void closed(UUID actor,UUID organization,String privateReason){append("ORGANIZATION_CLOSED","ORGANIZATION",actor,organization,"{state,sessions,invitations,connections}",privateReason);}
    @Override public void plan(UUID actor,UUID resource,String action,String reason){append(action,action.equals("PLAN_ASSIGNED")?"VENDOR_PLAN":"PLAN_REQUEST",actor,resource,"{state,planRevision,revision}",reason);}
    @Override public void administrativeConnection(UUID actor,UUID relationship,String reason){append("TRADING_ADMIN_CONNECTED","RELATIONSHIP",actor,relationship,"{state,generation}",reason);}
    @Override public void disconnected(UUID actor,UUID relationship,String reason){append("TRADING_DISCONNECTED","RELATIONSHIP",actor,relationship,"{state,disconnectedReason}",reason);}
    @Override public void connected(UUID actor,UUID relationship,boolean reconnected){append(reconnected?"TRADING_RECONNECTED":"TRADING_CONNECTED","RELATIONSHIP",actor,relationship,"{state,generation}",null);}
    @Override public void taxonomy(UUID actor,UUID resource,com.narudzbine.audit.api.TaxonomyAudit.Kind kind,com.narudzbine.audit.api.TaxonomyAudit.Action action){append(action.name(),kind.name(),actor,resource,action==com.narudzbine.audit.api.TaxonomyAudit.Action.TAXONOMY_DELETED?"{deleted}":"{name}");}
    @Override public void upload(UUID actor,UUID asset,boolean confirmed){append(confirmed?"UPLOAD_QUARANTINED":"UPLOAD_RESERVED","MEDIA_ASSET",actor,asset,"{upload}");}
    @Override public void product(UUID actor,UUID resource,com.narudzbine.audit.api.ProductAudit.Action action,List<com.narudzbine.audit.api.ProductAudit.Field> fields){append(action.name(),"PRODUCT",actor,resource,"{"+fields.stream().map(Enum::name).collect(java.util.stream.Collectors.joining(","))+"}");}
    @Override public void agreedPricesReviewed(UUID actor,UUID relationship){append("AGREED_PRICES_REVIEWED","RELATIONSHIP",actor,relationship,"{agreedPriceConfirmationRequired}");}
    @Override public void agreedPrice(UUID actor,UUID price,String action){if(!java.util.Set.of("AGREED_PRICE_SAVED","AGREED_PRICE_REMOVED","AGREED_PRICE_CONFIRMED").contains(action)){throw new IllegalArgumentException("Invalid agreed-price audit action");}append(action,"AGREED_PRICE",actor,price,"{unitPrice,confirmationRequired}");}
    @Override public void promotion(UUID actor,UUID promotion,String action){if(!java.util.Set.of("PROMOTION_CREATED","PROMOTION_UPDATED","PROMOTION_STOPPED","PROMOTION_ARCHIVED").contains(action)){throw new IllegalArgumentException("Invalid promotion audit action");}append(action,"PROMOTION",actor,promotion,"{definition,state,archived}");}
    @Override public void tracking(UUID actor,UUID vendor,boolean enabled){append(enabled?"TRACKING_ENABLED":"TRACKING_DISABLED","TRACKING",actor,vendor,"{enabled,confirmationEpoch}");}
    @Override public void reconciliation(UUID actor,UUID preview,String action){if(!java.util.Set.of("PREPARED","ACKNOWLEDGED","APPLIED").contains(action)){throw new IllegalArgumentException("Invalid reconciliation action");}append("RECONCILIATION_"+action,"RECONCILIATION",actor,preview,"{confirmedCount}");}
    @Override public void stock(UUID actor,UUID product,String type){if(!java.util.Set.of("INITIALIZED","SET","ADJUSTED","CONFIRMED").contains(type)){throw new IllegalArgumentException("Invalid stock audit type");}append("STOCK_"+type,"STOCK",actor,product,"{availableCount,confirmationRequired}");}
    @Override public void pricing(UUID actor,UUID product,List<com.narudzbine.audit.api.PricingAudit.Field> fields){append("PRICING_UPDATED","PRODUCT_PRICING",actor,product,"{"+fields.stream().map(Enum::name).collect(java.util.stream.Collectors.joining(","))+"}");}
    @Override public void stageConfigured(UUID actor,UUID resource,String action){append(action,"ORDER_STAGE",actor,resource,"{stageConfiguration}");}
    @Override public void progressed(UUID actor,UUID order,boolean delivered){append(delivered?"ORDER_DELIVERED":"ORDER_DISPATCHED","ORDER",actor,order,"{state}");}
    @Override public void messageCreated(UUID actor,UUID message){append("MESSAGE_CREATED","ORDER_MESSAGE",actor,message,"{message}");}
    @Override public void imported(UUID actor,UUID preview,boolean confirmed){append(confirmed?"IMPORT_CONFIRMED":"IMPORT_PREVIEWED","IMPORT",actor,preview,"{import}");}
    @Override public void stageAssigned(UUID actor,UUID order){append("ORDER_STAGE_CHANGED","ORDER",actor,order,"{stage}");}
    @Override public void cancellationRequested(UUID actor,UUID order,String reason){append("CANCELLATION_REQUESTED","ORDER",actor,order,"{cancellationRequest}",reason);}
    @Override public void cancellationResolved(UUID actor,UUID order,String outcome,String reason){append("CANCELLATION_"+outcome,"ORDER",actor,order,"{cancellationRequest}",reason);}
    @Override public void cancelled(UUID actor,UUID order,String reason){append("ORDER_CANCELLED","ORDER",actor,order,"{state,reason}",reason);}
    @Override public void responded(UUID actor,UUID order,boolean accepted,String reason){append(accepted?"ORDER_ACCEPTED":"ORDER_REJECTED","ORDER",actor,order,accepted?"{state,fulfillmentLocation}":"{state,reason}",reason);}
    @Override public void submitted(UUID actor,UUID order){append("ORDER_SUBMITTED","ORDER",actor,order,"{state,lines,delivery,parties,number}");}
    @Override public void exportCreated(UUID actor,UUID id){append("EXPORT_CREATED","EXPORT",actor,id,"{state}");}
    @Override public void exportDownloaded(UUID actor,UUID id){append("EXPORT_DOWNLOADED","EXPORT",actor,id,"{content}");}
    private void append(String action, String resourceType, UUID accountId, UUID resourceId, String changedFields) {
        append(action,resourceType,accountId,resourceId,changedFields,null);
    }
    private void append(String action,String resourceType,UUID accountId,UUID resourceId,String changedFields,String reason) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("Audit requires the command's writable transaction.");
        }
        Objects.requireNonNull(accountId);
        Objects.requireNonNull(resourceId);
        int inserted = jdbc.update("""
                INSERT INTO audit_event (id, actor_type, actor_id, organization_id, country, action,
                    resource_type, resource_id, outcome, request_id, occurred_at, changed_fields, reason)
                SELECT ?, a.kind, a.id, b.organization_id, o.country, ?, ?, ?, 'SUCCESS', ?, ?, ?::text[], ?
                FROM account_identity a
                LEFT JOIN business_account b ON b.id = a.id
                LEFT JOIN organization o ON o.id = b.organization_id
                WHERE a.id = ?
                """, ids.next(), action, resourceType, resourceId, requestId(),
                Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)), changedFields, reason, accountId);
        if (inserted != 1) {
            throw new IllegalStateException("Audit actor is unavailable.");
        }
    }

    private UUID requestId() {
        String context = MDC.get("requestId");
        if (context != null) {
            try {
                UUID id = UUID.fromString(context);
                if (id.version() == 7 && id.variant() == 2 && id.toString().equals(context)) {
                    return id;
                }
            } catch (IllegalArgumentException ignored) {
                // Never store arbitrary context or use it in an error message.
            }
        }
        return ids.next();
    }
}
