package com.narudzbine.organizations.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/** Internal projection; adapters sign revision and format timestamps explicitly. */
public record OrganizationRecord(UUID id, long revision, String displayName, String legalName,
        OrganizationType type, Country country, String currency, String registrationIdentifier, String taxIdentifier,
        Address registeredAddress, String defaultLanguage, String state, boolean staffSubmissionRestricted,
        UUID partnerContactId, UUID ownerAccountId, Instant createdAt, Instant updatedAt) {
    public record Address(String line1, String line2, String city, String postalCode, Country country,
            BigDecimal latitude, BigDecimal longitude) { }
    public record Values(String displayName, String legalName, Address registeredAddress,
            String defaultLanguage, boolean staffSubmissionRestricted, UUID partnerContactId) { }
    public Values values() { return new Values(displayName, legalName, registeredAddress, defaultLanguage, staffSubmissionRestricted, partnerContactId); }
}
