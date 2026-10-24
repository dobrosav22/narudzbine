package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.organizations.api.OrganizationRecord;
import com.narudzbine.shared.api.ResourceRevisions;
final class OrganizationResponses {
    static OrganizationController.Result response(OrganizationRecord o,ResourceRevisions revisions) {
        return new OrganizationController.Result(o.id(), revisions.encode("organization/v1", o.id(), o.revision()), o.displayName(), o.legalName(),
                o.type().name(), o.country().name(), o.currency(), o.registrationIdentifier(), o.taxIdentifier(), o.registeredAddress(),
                o.defaultLanguage(), o.state(), o.staffSubmissionRestricted(), o.partnerContactId(), o.ownerAccountId(),
                AccountResponses.time(o.createdAt()), AccountResponses.time(o.updatedAt()));
    }
}
