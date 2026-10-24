package com.narudzbine.identity.api;

public final class RevisionConflict extends RuntimeException {
    private final String currentRevision;
    public RevisionConflict(String currentRevision) {
        super("The resource revision is not current."); this.currentRevision = currentRevision;
    }
    public String currentRevision() { return currentRevision; }
}
