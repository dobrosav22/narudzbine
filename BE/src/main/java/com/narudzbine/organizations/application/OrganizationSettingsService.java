package com.narudzbine.organizations.application;

import com.narudzbine.audit.api.OrganizationAudit;
import com.narudzbine.organizations.api.Country;
import com.narudzbine.organizations.api.OrganizationRecord;
import com.narudzbine.organizations.api.OrganizationSettings;
import com.narudzbine.organizations.api.OrganizationType;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class OrganizationSettingsService implements OrganizationSettings {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final OrganizationAudit audit;

    public OrganizationSettingsService(JdbcTemplate jdbc, Clock clock, OrganizationAudit audit) {
        this.jdbc = jdbc; this.clock = clock; this.audit = audit;
    }

    @Override public OrganizationRecord read(UUID organizationId) {
        requireTransaction();
        return jdbc.queryForObject("SELECT * FROM organization WHERE id = ?", OrganizationRows::map, organizationId);
    }

    @Override public OrganizationRecord replace(UUID actorId, UUID organizationId, OrganizationRecord.Values values) {
        requireTransaction();
        var current = read(organizationId);
        if (current.country() != values.registeredAddress().country()
                || (current.type() == OrganizationType.VENDOR && values.staffSubmissionRestricted())) {
            throw new IllegalArgumentException("Invalid organization settings.");
        }
        if(values.partnerContactId()!=null && jdbc.queryForObject("SELECT count(*) FROM business_contact WHERE organization_id=? AND id=? AND state='ACTIVE'",Integer.class,organizationId,values.partnerContactId())!=1){throw new com.narudzbine.organizations.api.InvalidPartnerContact();}
        var fields = new ArrayList<OrganizationAudit.Field>();
        if(!Objects.equals(current.partnerContactId(),values.partnerContactId())){fields.add(OrganizationAudit.Field.partnerContactId);}
        if (!current.displayName().equals(values.displayName())) { fields.add(OrganizationAudit.Field.displayName); }
        if (!current.legalName().equals(values.legalName())) { fields.add(OrganizationAudit.Field.legalName); }
        if (!Objects.equals(current.registeredAddress(), values.registeredAddress())) { fields.add(OrganizationAudit.Field.registeredAddress); }
        if (!current.defaultLanguage().equals(values.defaultLanguage())) { fields.add(OrganizationAudit.Field.defaultLanguage); }
        if (current.staffSubmissionRestricted() != values.staffSubmissionRestricted()) { fields.add(OrganizationAudit.Field.staffSubmissionRestricted); }
        if (fields.isEmpty()) { return current; }
        var a = values.registeredAddress();
        jdbc.update("""
                UPDATE organization SET display_name=?, legal_name=?, address_line1=?, address_line2=?, address_city=?,
                    address_postal_code=?, address_latitude=?, address_longitude=?, default_language=?,
                    staff_submission_restricted=?, partner_contact_id=?, revision=?, updated_at=? WHERE id=?
                """, values.displayName(), values.legalName(), a.line1(), a.line2(), a.city(), a.postalCode(), a.latitude(),
                a.longitude(), values.defaultLanguage(), values.staffSubmissionRestricted(), values.partnerContactId(), Math.addExact(current.revision(), 1),
                Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)), organizationId);
        audit.settingsChanged(actorId, organizationId, fields);
        return read(organizationId);
    }

    private static BigDecimal normalized(BigDecimal value) { return value == null ? null : value.stripTrailingZeros(); }
    private static void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive() || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("Organization settings require the authorized writable transaction.");
        }
    }
}
