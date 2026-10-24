package com.narudzbine.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.narudzbine.identity.api.BusinessAccessDenied;
import com.narudzbine.identity.api.BusinessCapability;
import com.narudzbine.identity.application.BusinessAccess;
import com.narudzbine.organizations.api.BusinessRole;
import com.narudzbine.organizations.api.Country;
import com.narudzbine.organizations.infrastructure.JdbcMembershipAccess;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class IdentityBoundariesIT {
    @Container
    private static final PostgreSQLContainer DATABASE = new PostgreSQLContainer(DockerImageName.parse(
            "postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336")
            .asCompatibleSubstituteFor("postgres"));
    private static JdbcTemplate jdbc;
    private static TransactionTemplate transaction;
    private static TransactionTemplate authorizationTransaction;
    private static BusinessAccess access;

    @BeforeAll
    static void migrate() {
        MigrationCommand.migrate(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        var source = new DriverManagerDataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
        jdbc = new JdbcTemplate(source);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
        transaction.setTimeout(10);
        String runtimePassword = UUID.randomUUID().toString();
        jdbc.execute("CREATE ROLE identity_runtime LOGIN PASSWORD '" + runtimePassword + "'");
        jdbc.execute("GRANT USAGE ON SCHEMA public TO identity_runtime");
        jdbc.execute("GRANT SELECT, UPDATE ON organization, business_account, account_identity TO identity_runtime");
        var runtimeSource = new DriverManagerDataSource(DATABASE.getJdbcUrl(), "identity_runtime", runtimePassword);
        var runtimeJdbc = new JdbcTemplate(runtimeSource);
        authorizationTransaction = new TransactionTemplate(new DataSourceTransactionManager(runtimeSource));
        authorizationTransaction.setTimeout(10);
        access = new BusinessAccess(new JdbcMembershipAccess(runtimeJdbc), runtimeJdbc);
    }

    @Test
    void setupRequiresOneVerifiedSameOrganizationOwnerAtCommit() {
        UUID organizationId = UUID.randomUUID();
        assertThatThrownBy(() -> transaction.executeWithoutResult(status ->
                insertOrganization(organizationId, UUID.randomUUID(), "BUYER", Country.RS, uniqueRegistration())))
                .satisfies(IdentityBoundariesIT::assertConstraintFailure);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM organization WHERE id = ?", Integer.class,
                organizationId)).isZero();

        var organization = organization("BUYER", Country.RS);
        UUID stranger = member(organization("VENDOR", Country.RS), "STAFF");
        rejected("UPDATE organization SET owner_account_id = ? WHERE id = ?", stranger, organization.id());
        rejected("UPDATE business_account SET role = 'ADMIN' WHERE id = ?", organization.owner());
        rejected("UPDATE account_identity SET state = 'DEACTIVATED' WHERE id = ?", organization.owner());
        rejected("UPDATE account_identity SET email_verified = false WHERE id = ?", organization.owner());
        assertThat(jdbc.queryForObject("SELECT role FROM business_account WHERE id = ?", String.class,
                organization.owner())).isEqualTo("OWNER");
    }

    @Test
    void accountOrganizationKindAndIdentityCannotChangeEvenAfterDeactivation() {
        var first = organization("BUYER", Country.RS);
        var second = organization("VENDOR", Country.BA);
        UUID staff = member(first, "STAFF");
        jdbc.update("UPDATE account_identity SET state = 'DEACTIVATED' WHERE id = ?", staff);
        rejected("UPDATE business_account SET organization_id = ? WHERE id = ?", second.id(), staff);
        rejected("UPDATE business_account SET id = ? WHERE id = ?", UUID.randomUUID(), staff);
        rejected("UPDATE account_identity SET kind = 'PLATFORM_ADMIN' WHERE id = ?", staff);
        rejected("DELETE FROM business_account WHERE id = ?", staff);
        rejected("DELETE FROM account_identity WHERE id = ?", staff);
        rejected("INSERT INTO platform_account (id) VALUES (?)", staff);
        rejected("INSERT INTO business_account (id, organization_id, role) VALUES (?, ?, 'STAFF')",
                staff, second.id());
    }

    @Test
    void countryTypeCurrencyAndRegistrationScopeAreDatabaseInvariants() {
        var first = organization("BUYER", Country.RS);
        rejected("UPDATE organization SET country = 'BA', currency = 'BAM', address_country = 'BA' WHERE id = ?",
                first.id());
        rejected("UPDATE organization SET type = 'VENDOR' WHERE id = ?", first.id());
        rejected("UPDATE organization SET currency = 'BAM' WHERE id = ?", first.id());
        rejected("UPDATE organization SET address_country = 'BA' WHERE id = ?", first.id());
        var duplicate = organization("BUYER", Country.RS);
        rejected("UPDATE organization SET registration_identifier = ? WHERE id = ?",
                first.registration().toUpperCase(java.util.Locale.ROOT), duplicate.id());
        var vendor = organization("VENDOR", Country.RS);
        var bosnian = organization("BUYER", Country.BA);
        jdbc.update("UPDATE organization SET registration_identifier = ? WHERE id IN (?, ?)",
                first.registration(), vendor.id(), bosnian.id());
        jdbc.update("UPDATE organization SET state = 'CLOSED' WHERE id = ?", first.id());
        rejected("UPDATE organization SET state = 'ACTIVE' WHERE id = ?", first.id());
        rejected("UPDATE organization SET registration_identifier = ? WHERE id = ?",
                first.registration(), duplicate.id());
    }

    @Test
    void currentEmailIsGlobalAndRemainsReservedForDeactivatedAccounts() {
        var organization = organization("BUYER", Country.RS);
        UUID staff = member(organization, "STAFF");
        String email = email(staff);
        jdbc.update("UPDATE account_identity SET state = 'DEACTIVATED' WHERE id = ?", staff);
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            UUID platformId = UUID.randomUUID();
            identity(platformId, "PLATFORM_ADMIN", email);
            jdbc.update("INSERT INTO platform_account (id) VALUES (?)", platformId);
        })).isInstanceOf(DataAccessException.class);
        rejected("UPDATE account_identity SET email = ? WHERE id = ?", "Mixed@EXAMPLE.test", staff);
        rejected("UPDATE account_identity SET email = ? WHERE id = ?", " spaced@example.test ", staff);
        UUID platform = platform();
        rejected("UPDATE account_identity SET email = ? WHERE id = ?", email, platform);
    }

    @Test
    void concurrentEmailClaimsHaveOnlyOneWinner() throws Exception {
        String contestedEmail = email(UUID.randomUUID());
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> claim = () -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) {
                    throw new AssertionError("Email claim race did not start");
                }
                try {
                    transaction.executeWithoutResult(status -> {
                        UUID id = UUID.randomUUID();
                        identity(id, "PLATFORM_ADMIN", contestedEmail);
                        jdbc.update("INSERT INTO platform_account (id) VALUES (?)", id);
                    });
                    return "created";
                } catch (DataAccessException failure) {
                    Throwable root = failure.getMostSpecificCause();
                    assertThat(root).isInstanceOf(SQLException.class);
                    return ((SQLException) root).getSQLState();
                }
            };
            var first = executor.submit(claim);
            var second = executor.submit(claim);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(java.util.List.of(first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder("created", "23505");
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM account_identity WHERE email = ?",
                Integer.class, contestedEmail)).isEqualTo(1);
    }

    @Test
    void subtypeCannotBeMissingOrBecomeBusinessMembershipForPlatformAccount() {
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            UUID orphan = UUID.randomUUID();
            identity(orphan, "BUSINESS", email(orphan));
        })).satisfies(IdentityBoundariesIT::assertConstraintFailure);
        UUID platform = platform();
        var organization = organization("BUYER", Country.RS);
        rejected("INSERT INTO business_account (id, organization_id, role) VALUES (?, ?, 'STAFF')",
                platform, organization.id());
        denied(platform, organization, BusinessCapability.READ_OWN_ORGANIZATION,
                BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
    }

    @Test
    void atomicOwnerRoleSwapPreservesExactlyOneOwner() {
        var organization = organization("BUYER", Country.RS);
        UUID recipient = member(organization, "STAFF");
        rejected("UPDATE business_account SET role = 'OWNER' WHERE id = ?", recipient);
        transaction.executeWithoutResult(status -> {
            jdbc.queryForObject("SELECT id FROM organization WHERE id = ? FOR UPDATE", UUID.class, organization.id());
            // Intentionally create a temporary second owner; only the final committed state matters.
            jdbc.update("UPDATE business_account SET role = 'OWNER' WHERE id = ?", recipient);
            jdbc.update("UPDATE business_account SET role = 'ADMIN' WHERE id = ?", organization.owner());
            jdbc.update("UPDATE organization SET owner_account_id = ? WHERE id = ?", recipient, organization.id());
        });
        assertThat(jdbc.queryForObject("SELECT id FROM business_account WHERE organization_id = ? AND role = 'OWNER'",
                UUID.class, organization.id())).isEqualTo(recipient);
        assertThat(jdbc.queryForObject("SELECT role FROM business_account WHERE id = ?", String.class,
                organization.owner())).isEqualTo("ADMIN");
    }

    @Test
    void roleMatrixKeepsVendorEditsUniformAndBuyerRestrictionOrganizationWide() {
        var vendor = organization("VENDOR", Country.RS);
        UUID vendorStaff = member(vendor, "STAFF");
        for (var capability : new BusinessCapability[] {BusinessCapability.EDIT_CATALOGUE,
                BusinessCapability.EDIT_PRICES, BusinessCapability.EDIT_PROMOTIONS, BusinessCapability.EDIT_STOCK}) {
            allowed(vendorStaff, vendor, capability);
        }
        denied(vendorStaff, vendor, BusinessCapability.MANAGE_STAFF, BusinessAccessDenied.Reason.CAPABILITY_DENIED);
        UUID admin = member(vendor, "ADMIN");
        allowed(admin, vendor, BusinessCapability.MANAGE_STAFF);
        denied(admin, vendor, BusinessCapability.MANAGE_ADMIN_ROLES, BusinessAccessDenied.Reason.CAPABILITY_DENIED);
        allowed(vendor.owner(), vendor, BusinessCapability.MANAGE_ADMIN_ROLES);
        denied(vendorStaff, vendor, BusinessCapability.SUBMIT_OR_CANCEL_BUYER_ORDER,
                BusinessAccessDenied.Reason.CAPABILITY_DENIED);

        var buyer = organization("BUYER", Country.BA);
        UUID buyerStaff = member(buyer, "STAFF");
        UUID otherStaff = member(buyer, "STAFF");
        allowed(buyerStaff, buyer, BusinessCapability.SUBMIT_OR_CANCEL_BUYER_ORDER);
        jdbc.update("UPDATE organization SET staff_submission_restricted = true WHERE id = ?", buyer.id());
        for (UUID staff : new UUID[] {buyerStaff, otherStaff}) {
            denied(staff, buyer, BusinessCapability.SUBMIT_OR_CANCEL_BUYER_ORDER,
                    BusinessAccessDenied.Reason.CAPABILITY_DENIED);
            allowed(staff, buyer, BusinessCapability.PREPARE_BUYER_ORDER);
        }
        allowed(buyer.owner(), buyer, BusinessCapability.SUBMIT_OR_CANCEL_BUYER_ORDER);
        denied(buyer.owner(), buyer, BusinessCapability.EDIT_PRICES, BusinessAccessDenied.Reason.CAPABILITY_DENIED);
    }

    @Test
    void forgedScopeAndCurrentInactiveStatesAreDenied() {
        var own = organization("VENDOR", Country.RS);
        var sameCountry = organization("VENDOR", Country.RS);
        var otherCountry = organization("VENDOR", Country.BA);
        denied(own.owner(), sameCountry, BusinessCapability.READ_OWN_ORGANIZATION,
                BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        denied(own.owner(), otherCountry, BusinessCapability.READ_OWN_ORGANIZATION,
                BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        denied(own.owner(), new Organization(own.id(), own.owner(), Country.BA, own.registration()),
                BusinessCapability.READ_OWN_ORGANIZATION, BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        denied(UUID.randomUUID(), own, BusinessCapability.READ_OWN_ORGANIZATION,
                BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        UUID staff = member(own, "STAFF");
        for (String state : new String[] {"PENDING", "DEACTIVATED"}) {
            jdbc.update("UPDATE account_identity SET state = ? WHERE id = ?", state, staff);
            denied(staff, own, BusinessCapability.READ_OWN_ORGANIZATION,
                    BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        }
        jdbc.update("UPDATE account_identity SET state = 'ACTIVE' WHERE id = ?", staff);
        for (String state : new String[] {"SUSPENDED", "CLOSED"}) {
            jdbc.update("UPDATE organization SET state = ? WHERE id = ?", state, own.id());
            denied(staff, own, BusinessCapability.READ_OWN_ORGANIZATION,
                    BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
        }
    }

    @Test
    void authorizationCannotEscapeItsWritableTransaction() {
        var organization = organization("BUYER", Country.RS);
        assertThatThrownBy(() -> access.require(organization.owner(), organization.id(), organization.country(),
                BusinessCapability.READ_OWN_ORGANIZATION)).isInstanceOf(IllegalStateException.class);
        var readOnly = new TransactionTemplate(authorizationTransaction.getTransactionManager());
        readOnly.setReadOnly(true);
        assertThatThrownBy(() -> readOnly.execute(status -> access.require(organization.owner(), organization.id(),
                organization.country(), BusinessCapability.READ_OWN_ORGANIZATION)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void committingAuthorizationLocksBlockConcurrentRevocationThenRejectNextAction() {
        var organization = organization("VENDOR", Country.RS);
        UUID staff = member(organization, "ADMIN");
        String[] changes = {
            "UPDATE business_account SET role = 'STAFF' WHERE id = '" + staff + "'",
            "UPDATE account_identity SET state = 'DEACTIVATED' WHERE id = '" + staff + "'",
            "UPDATE organization SET state = 'SUSPENDED' WHERE id = '" + organization.id() + "'"
        };
        try (var executor = Executors.newSingleThreadExecutor()) {
            authorizationTransaction.executeWithoutResult(status -> {
                var scope = access.require(staff, organization.id(), organization.country(),
                        BusinessCapability.MANAGE_STAFF);
                assertThat(scope.role()).isEqualTo(BusinessRole.ADMIN);
                for (String change : changes) {
                    try {
                        String sqlState = executor.submit(() -> lockAttempt(change)).get(5, TimeUnit.SECONDS);
                        assertThat(sqlState).isEqualTo("55P03");
                    } catch (Exception exception) {
                        throw new AssertionError("Concurrent revocation did not encounter the authorization lock", exception);
                    }
                }
            });
        }
        jdbc.update(changes[0]);
        denied(staff, organization, BusinessCapability.MANAGE_STAFF, BusinessAccessDenied.Reason.CAPABILITY_DENIED);
        allowed(staff, organization, BusinessCapability.EDIT_PRICES);
        jdbc.update(changes[1]);
        denied(staff, organization, BusinessCapability.EDIT_PRICES, BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE);
    }

    private static String lockAttempt(String change) throws SQLException {
        try (var connection = DriverManager.getConnection(DATABASE.getJdbcUrl(),
                DATABASE.getUsername(), DATABASE.getPassword()); var sql = connection.createStatement()) {
            connection.setAutoCommit(false);
            sql.execute("SET LOCAL lock_timeout = '200ms'");
            sql.execute("SET LOCAL statement_timeout = '2s'");
            try {
                sql.executeUpdate(change);
                return "unexpected-success";
            } catch (SQLException exception) {
                return exception.getSQLState();
            } finally {
                connection.rollback();
            }
        }
    }

    private static Organization organization(String type, Country country) {
        var organization = new Organization(UUID.randomUUID(), UUID.randomUUID(), country, uniqueRegistration());
        transaction.executeWithoutResult(status -> {
            insertOrganization(organization.id(), organization.owner(), type, country, organization.registration());
            identity(organization.owner(), "BUSINESS", email(organization.owner()));
            jdbc.update("INSERT INTO business_account (id, organization_id, role) VALUES (?, ?, 'OWNER')",
                    organization.owner(), organization.id());
        });
        return organization;
    }

    private static void insertOrganization(UUID id, UUID owner, String type, Country country, String registration) {
        jdbc.update("""
                INSERT INTO organization (id, owner_account_id, type, country, currency, display_name, legal_name,
                    registration_identifier, address_line1, address_city, address_postal_code, address_country,
                    default_language, state)
                VALUES (?, ?, ?, ?, ?, 'Synthetic organization', 'Synthetic legal name', ?, 'Test street',
                    'Test city', '00000', ?, 'en', 'ACTIVE')
                """, id, owner, type, country.name(), country == Country.RS ? "RSD" : "BAM", registration, country.name());
    }

    private static UUID member(Organization organization, String role) {
        UUID id = UUID.randomUUID();
        transaction.executeWithoutResult(status -> {
            identity(id, "BUSINESS", email(id));
            jdbc.update("INSERT INTO business_account (id, organization_id, role) VALUES (?, ?, ?)",
                    id, organization.id(), role);
        });
        return id;
    }

    private static UUID platform() {
        UUID id = UUID.randomUUID();
        transaction.executeWithoutResult(status -> {
            identity(id, "PLATFORM_ADMIN", email(id));
            jdbc.update("INSERT INTO platform_account (id) VALUES (?)", id);
        });
        return id;
    }

    private static void identity(UUID id, String kind, String email) {
        jdbc.update("""
                INSERT INTO account_identity (id, kind, email, email_verified, display_name, state)
                VALUES (?, ?, ?, true, 'Synthetic member', 'ACTIVE')
                """, id, kind, email);
    }

    private static void rejected(String sql, Object... arguments) {
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> jdbc.update(sql, arguments)))
                .satisfies(IdentityBoundariesIT::assertConstraintFailure);
    }

    private static void assertConstraintFailure(Throwable failure) {
        Throwable root = failure;
        while (root.getCause() != null) {
            root = root.getCause();
        }
        assertThat(root).isInstanceOfSatisfying(SQLException.class,
                exception -> assertThat(exception.getSQLState()).startsWith("23"));
    }

    private static void allowed(UUID account, Organization organization, BusinessCapability capability) {
        var scope = authorizationTransaction.execute(status ->
                access.require(account, organization.id(), organization.country(), capability));
        assertThat(scope.accountId()).isEqualTo(account);
        assertThat(scope.organizationId()).isEqualTo(organization.id());
    }

    private static void denied(UUID account, Organization organization, BusinessCapability capability,
            BusinessAccessDenied.Reason reason) {
        assertThatThrownBy(() -> authorizationTransaction.execute(status ->
                access.require(account, organization.id(), organization.country(), capability)))
                .isInstanceOfSatisfying(BusinessAccessDenied.class, exception -> assertThat(exception.reason()).isEqualTo(reason));
    }

    private static String email(UUID id) {
        return id + "@example.test";
    }

    private static String uniqueRegistration() {
        return UUID.randomUUID().toString();
    }

    private record Organization(UUID id, UUID owner, Country country, String registration) {
    }
}
