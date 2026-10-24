package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.SessionView;
import com.narudzbine.identity.application.AccountRevisions;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

final class AccountResponses {
    private static final DateTimeFormatter TIME = new DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private final JdbcTemplate jdbc;
    private final AccountRevisions revisions;
    AccountResponses(JdbcTemplate jdbc, AccountRevisions revisions) {
        this.jdbc = jdbc; this.revisions = revisions;
    }

    Account account(UUID id) {
        return jdbc.queryForObject("""
                SELECT a.*, b.organization_id, b.role, b.home_location_id FROM account_identity a
                LEFT JOIN business_account b ON b.id = a.id WHERE a.id = ?
                """, (row, index) -> new Account(id, revisions.encode(id, row.getLong("revision")),
                        row.getObject("organization_id", UUID.class), row.getString("kind"), row.getString("email"),
                        row.getString("display_name"), row.getString("role"), row.getString("state"),
                        row.getString("language_override"), row.getObject("home_location_id", UUID.class), time(row.getTimestamp("created_at").toInstant()),
                        time(row.getTimestamp("updated_at").toInstant())), id);
    }

    static String time(Instant value) { return TIME.format(value); }
    static Session session(SessionView value) {
        return new Session(value.id(), value.deviceLabel(), time(value.createdAt()), time(value.lastActivityAt()), time(value.expiresAt()), value.current());
    }
    record Account(UUID id, String revision, UUID organizationId, String kind, String email, String displayName,
            String role, String state, String languageOverride, UUID homeLocationId, String createdAt, String updatedAt) { }
    record Session(UUID id, String deviceLabel, String createdAt, String lastActivityAt, String expiresAt, boolean current) { }
}
