package com.narudzbine.organizations.infrastructure;

import com.narudzbine.organizations.api.BusinessRole;
import com.narudzbine.organizations.api.Country;
import com.narudzbine.organizations.api.LockedMembership;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.organizations.api.OrganizationType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Repository
public class JdbcMembershipAccess implements MembershipAccess {
    private final JdbcTemplate jdbc;

    public JdbcMembershipAccess(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<LockedMembership> lockForAuthorization(UUID accountId) {
        return lock(accountId, false);
    }

    @Override
    public Optional<LockedMembership> lockForOrganizationWrite(UUID accountId) {
        return lock(accountId, true);
    }

    private Optional<LockedMembership> lock(UUID accountId, boolean exclusive) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("Authorization requires a writable transaction.");
        }
        // The preliminary lookup is safe only because the binding and account identity cannot change or be deleted.
        var organizations = jdbc.query("SELECT organization_id FROM business_account WHERE id = ?",
                (row, index) -> row.getObject(1, UUID.class), accountId);
        if (organizations.isEmpty()) {
            return Optional.empty();
        }
        UUID organizationId = organizations.getFirst();
        var organization = jdbc.query("""
                SELECT country, type, state, staff_submission_restricted
                FROM organization WHERE id = ? FOR %s
                """.formatted(exclusive ? "UPDATE" : "SHARE"), (row, index) -> new OrganizationFacts(Country.valueOf(row.getString("country")),
                        OrganizationType.valueOf(row.getString("type")), "ACTIVE".equals(row.getString("state")),
                        row.getBoolean("staff_submission_restricted")), organizationId);
        var roles = jdbc.query("""
                SELECT role FROM business_account WHERE organization_id = ? AND id = ? FOR SHARE
                """, (row, index) -> BusinessRole.valueOf(row.getString(1)), organizationId, accountId);
        if (organization.isEmpty() || roles.isEmpty()) {
            return Optional.empty();
        }
        var facts = organization.getFirst();
        return Optional.of(new LockedMembership(organizationId, facts.country(), facts.type(), roles.getFirst(),
                facts.active(), facts.restricted()));
    }

    private record OrganizationFacts(Country country, OrganizationType type, boolean active, boolean restricted) {
    }
}
