package com.narudzbine.identity.api;

import java.time.Instant;
import java.util.UUID;

/** Trusted operator-system boundary, not a request boolean. X-05 blocks any real adapter until established. */
public interface RecoveryEvidence {
    NoticeProof inspect(Context context,String creatorReference,String reviewerReference);
    record Context(UUID caseId,String kind,UUID organizationId,UUID targetAccountId,UUID formerOwnerId,
                   String oldEmail,String newEmail,UUID creatorId,UUID reviewerId,Instant createdAt) {
        @Override public String toString() { return "RecoveryEvidenceContext[redacted]"; }
    }
    record NoticeProof(boolean registrationVerified,boolean requesterVerified,boolean independentContactVerified,
                       boolean challengeClear,Instant noticeCompletedAt) { }
}
