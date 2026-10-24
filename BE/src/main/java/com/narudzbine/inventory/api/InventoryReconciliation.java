package com.narudzbine.inventory.api;
import java.time.Instant;
import java.util.*;
import com.narudzbine.inventory.api.VendorInventory.Tracking;
/** Current stock authority and the exclusive organization guard are required for every call. */
public interface InventoryReconciliation {
 record Preview(UUID id,UUID vendor,long revision,long generation,long epoch,Instant expiresAt,long productCount,long confirmedCount,boolean applied){}
 record Line(UUID productId,long sourceRevision,long sourceEpoch,int availableCount,long creditQuantity,boolean acknowledged){}
 record Candidate(UUID productId,long sourceRevision,int availableCount){}
 record Lines(List<Line> items,boolean more){}
 record Receipt(Preview preview,Tracking tracking){}
 Preview prepare(UUID actor,UUID vendor);
 Preview get(UUID vendor,UUID preview);
 Line line(UUID vendor,UUID preview,UUID product);
 Lines lines(UUID vendor,UUID preview,int size,UUID after);
 Preview acknowledge(UUID actor,UUID vendor,UUID preview,List<Candidate> candidates);
 Tracking enable(UUID actor,UUID vendor,UUID preview);
 Tracking disable(UUID actor,UUID vendor);
 Optional<Receipt> replay(UUID actor,UUID vendor,String operation,byte[] identity);
 void remember(UUID actor,UUID vendor,String operation,byte[] identity,Receipt result);
 void compactExpiredReplay();
}
