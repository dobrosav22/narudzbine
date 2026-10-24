package com.narudzbine.identity.application;

import com.narudzbine.shared.api.ResourceRevisions;
import java.util.UUID;

public final class AccountRevisions {
    private final ResourceRevisions revisions;
    public AccountRevisions(byte[] key) { this(new ResourceRevisions(key)); }
    public AccountRevisions(ResourceRevisions revisions) { this.revisions = revisions; }
    public String encode(UUID id, long revision) { return revisions.encode("account/v1", id, revision); }
    public boolean matches(UUID id, long revision, String submitted) { return revisions.matches("account/v1", id, revision, submitted); }
}
