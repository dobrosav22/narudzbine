package com.narudzbine.audit.api;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/** Safe current workflow projection; the original private intake and creation replay stay immutable. */
public interface PrivacyFulfillment {
    record State(long revision,String state) {
        public State{if(revision<1||!Set.of("REQUESTED","REVIEWING","HELD","READY","COMPLETED","REJECTED").contains(state))throw new IllegalArgumentException("Valid privacy workflow state required");}
    }
    Optional<State> current(UUID caseId);
}
