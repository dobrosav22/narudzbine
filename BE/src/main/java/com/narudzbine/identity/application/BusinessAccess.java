package com.narudzbine.identity.application;

import com.narudzbine.identity.api.BusinessAccessDenied;
import com.narudzbine.identity.api.BusinessAuthorization;
import com.narudzbine.identity.api.BusinessCapability;
import com.narudzbine.identity.api.BusinessScope;
import com.narudzbine.organizations.api.Country;
import com.narudzbine.organizations.api.MembershipAccess;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class BusinessAccess implements BusinessAuthorization {
    private final MembershipAccess memberships;
    private final JdbcTemplate jdbc;

    public BusinessAccess(MembershipAccess memberships, JdbcTemplate jdbc) {
        this.memberships = memberships;
        this.jdbc = jdbc;
    }

    /** authenticatedAccountId must come from verified server authentication, never a request's actor field. */
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public BusinessScope require(UUID authenticatedAccountId, UUID targetOrganizationId, Country targetCountry,
            BusinessCapability capability) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("Authorization requires a writable transaction.");
        }
        Objects.requireNonNull(authenticatedAccountId);
        Objects.requireNonNull(targetOrganizationId);
        Objects.requireNonNull(targetCountry);
        Objects.requireNonNull(capability);
        var membership = memberships.lockForAuthorization(authenticatedAccountId)
                .orElseThrow(BusinessAccess::inaccessible);
        var accounts = jdbc.query("""
                SELECT state, email_verified, credential_operation_pending
                FROM account_identity WHERE id = ? AND kind = 'BUSINESS' FOR SHARE
                """, (row, index) -> "ACTIVE".equals(row.getString("state")) && row.getBoolean("email_verified")
                        && !row.getBoolean("credential_operation_pending"),
                authenticatedAccountId);
        if (accounts.isEmpty() || !accounts.getFirst() || !membership.organizationActive()
                || !membership.organizationId().equals(targetOrganizationId) || membership.country() != targetCountry) {
            throw inaccessible();
        }
        if (!BusinessPermissions.allows(membership, capability)) {
            throw new BusinessAccessDenied(BusinessAccessDenied.Reason.CAPABILITY_DENIED);
        }
        return new BusinessScope(authenticatedAccountId, membership.organizationId(), membership.country(),
                membership.type(), membership.role());
    }

    private static BusinessAccessDenied inaccessible() {
        return new BusinessAccessDenied(BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
    }
}
