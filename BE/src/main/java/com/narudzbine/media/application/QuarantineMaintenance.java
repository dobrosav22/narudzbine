package com.narudzbine.media.application;
import com.narudzbine.media.api.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
@Service
public final class QuarantineMaintenance {
    private final MediaUploads uploads;private final PrivateQuarantine storage;private final TransactionTemplate tx;
    public QuarantineMaintenance(MediaUploads uploads,PrivateQuarantine storage,PlatformTransactionManager manager){this.uploads=uploads;this.storage=storage;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
    /** Bounded technical TTL sweep; a failed delete/commit keeps its immutable key/claim for retry. */
    public int sweep(){var ids=tx.execute(s->uploads.expiredCandidates(25));int deleted=0;for(var id:ids){var claim=tx.execute(s->uploads.claimCleanup(id));if(claim.isEmpty()){continue;}storage.delete(claim.get().key());storage.fenceProcessed("processed/"+claim.get().vendor()+"/"+claim.get().id());tx.executeWithoutResult(s->uploads.deleted(claim.get()));deleted++;}return deleted;}
}
