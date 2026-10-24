package com.narudzbine.inventory.api;
import java.util.UUID;
/** Caller holds both organization guards and current domestic buyer offer access; read-only, no stock hold. */
public interface ReviewStock {
 enum Status {READY,CONFIRMATION_REQUIRED,INSUFFICIENT}
 Status eligibility(UUID vendor,UUID product,int quantity);

 default java.util.Map<UUID,Status> eligibilityMany(UUID vendor,java.util.Map<UUID,Integer> quantities){
  if(quantities.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var result=new java.util.LinkedHashMap<UUID,Status>();quantities.forEach((id,quantity)->result.put(id,eligibility(vendor,id,quantity)));return java.util.Map.copyOf(result);
 }
}
