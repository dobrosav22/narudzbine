package com.narudzbine.identity.application;

import com.narudzbine.audit.api.AccountAudit;
import com.narudzbine.identity.api.RevisionConflict;
import com.narudzbine.identity.api.SessionTransport;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Transactional(propagation = Propagation.MANDATORY)
public class OwnAccountService {
    private final JdbcTemplate jdbc;
    private final SessionService sessions;
    private final AccountRevisions revisions;
    private final SupportedLocales locales;
    private final AccountAudit audit;
    private final Clock clock;
    private final com.narudzbine.organizations.api.Locations locations;

    public OwnAccountService(JdbcTemplate jdbc, SessionService sessions, AccountRevisions revisions,
            SupportedLocales locales, AccountAudit audit, Clock clock, com.narudzbine.organizations.api.Locations locations) {
        this.jdbc = jdbc; this.sessions = sessions; this.revisions = revisions;
        this.locales = locales; this.audit = audit; this.clock = clock; this.locations = locations;
    }

    public UUID updateLanguage(String token, SessionTransport transport, String csrf, String expectedRevision,
            boolean supplied, String languageOverride) {
        var principal = sessions.authenticate(token, transport);
        if (transport == SessionTransport.BROWSER) { sessions.requireCsrf(token, csrf); }
        if (expectedRevision == null || expectedRevision.isEmpty() || expectedRevision.length() > 256
                || (!supplied && languageOverride != null)) {
            throw new IllegalArgumentException("Invalid language command.");
        }
        String canonical = languageOverride == null ? null : locales.canonical(languageOverride);
        var current = jdbc.queryForObject("SELECT revision, language_override FROM account_identity WHERE id = ?",
                (row, index) -> new Current(row.getLong(1), row.getString(2)), principal.accountId());
        if (!revisions.matches(principal.accountId(), current.revision(), expectedRevision)) { throw new RevisionConflict(revisions.encode(principal.accountId(), current.revision())); }
        if (supplied && !Objects.equals(current.language(), canonical)) {
            jdbc.update("""
                    UPDATE account_identity SET language_override = ?, revision = ?, updated_at = ? WHERE id = ?
                    """, canonical, Math.addExact(current.revision(), 1),
                    Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)), principal.accountId());
            audit.languageChanged(principal.accountId());
        }
        sessions.recordSuccessfulActivity(token, transport);
        return principal.accountId();
    }

    public UUID updateProfile(String token, SessionTransport transport, String csrf, String expectedRevision,
            String displayName, UUID homeLocationId) {
        var principal = sessions.authenticateForProfileWrite(token, transport);
        if (transport == SessionTransport.BROWSER) { sessions.requireCsrf(token, csrf); }
        if (expectedRevision == null || expectedRevision.isEmpty() || expectedRevision.length() > 256) {
            throw new IllegalArgumentException("Invalid profile revision.");
        }
        String name = profileName(displayName);
        var current = jdbc.queryForObject("""
                SELECT a.revision,a.display_name,b.organization_id,b.home_location_id FROM account_identity a
                LEFT JOIN business_account b ON b.id=a.id WHERE a.id=?
                """, (row,index) -> new Profile(row.getLong(1),row.getString(2),row.getObject(3,UUID.class),row.getObject(4,UUID.class)), principal.accountId());
        if (!revisions.matches(principal.accountId(),current.revision(),expectedRevision)) {
            throw new RevisionConflict(revisions.encode(principal.accountId(),current.revision()));
        }
        if (homeLocationId != null) {
            if (principal.platformAdministrator()) {
                throw new com.narudzbine.identity.api.InvalidProfileLocation(com.narudzbine.identity.api.InvalidProfileLocation.Reason.NOT_APPLICABLE);
            }
            var location = locations.read(current.organizationId(),homeLocationId);
            if (!"ACTIVE".equals(location.state())) {
                throw new com.narudzbine.identity.api.InvalidProfileLocation(com.narudzbine.identity.api.InvalidProfileLocation.Reason.ARCHIVED);
            }
        }
        var fields = new java.util.ArrayList<AccountAudit.ProfileField>();
        if (!current.name().equals(name)) { fields.add(AccountAudit.ProfileField.displayName); }
        if (!Objects.equals(current.homeLocationId(),homeLocationId)) { fields.add(AccountAudit.ProfileField.homeLocationId); }
        if (!fields.isEmpty()) {
            jdbc.update("UPDATE account_identity SET display_name=?,revision=?,updated_at=? WHERE id=?",name,
                    Math.addExact(current.revision(),1),Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),principal.accountId());
            if (fields.contains(AccountAudit.ProfileField.homeLocationId)) {
                jdbc.update("UPDATE business_account SET home_location_id=? WHERE id=? AND organization_id=?",
                        homeLocationId,principal.accountId(),current.organizationId());
            }
            audit.profileChanged(principal.accountId(),fields);
        }
        sessions.recordSuccessfulActivity(token,transport);
        return principal.accountId();
    }

    public static String profileName(String input) {
        if (input == null) { throw new IllegalArgumentException("Invalid profile name."); }
        String name = java.text.Normalizer.normalize(input.strip(),java.text.Normalizer.Form.NFC);
        if (name.isBlank() || name.codePointCount(0,name.length()) > 100
                || name.codePoints().anyMatch(c -> Character.isISOControl(c) || (c>=0xd800 && c<=0xdfff))) {
            throw new IllegalArgumentException("Invalid profile name.");
        }
        return name;
    }
    private record Profile(long revision,String name,UUID organizationId,UUID homeLocationId) { }

    private record Current(long revision, String language) { }
}
