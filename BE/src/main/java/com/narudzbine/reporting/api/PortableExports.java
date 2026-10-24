package com.narudzbine.reporting.api;

import com.narudzbine.audit.api.PrivateCaseReview;
import java.util.UUID;

/** Case-linked fulfillment only. Operator approval never grants a commercial download. */
public interface PortableExports {
    record Scope(UUID actor,UUID session,String transport,UUID organization,String country) {}
    record Context(String reason,String caseReference) {
        @Override public String toString(){return "PortableExportContext[redacted]";}
    }
    record View(UUID id,UUID caseId,String revision,String state,int manifestVersion,
                String createdAt,String expiresAt,String failureCode,Long bytes,Long records) {}
    record Content(byte[] bytes,String failureCode) {
        public Content{bytes=bytes==null?null:bytes.clone();}
        @Override public byte[] bytes(){return bytes==null?null:bytes.clone();}
        @Override public String toString(){return "PortableExportContent[redacted]";}
    }
    View approve(PrivateCaseReview.Actor actor,UUID caseId,UUID id,String expectedCaseRevision,Context context);
    View administrative(PrivateCaseReview.Actor actor,UUID caseId,UUID id);
    View status(Scope scope,UUID caseId,UUID id);
    Content content(Scope scope,UUID caseId,UUID id);
}
