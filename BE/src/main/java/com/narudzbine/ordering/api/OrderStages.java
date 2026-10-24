package com.narudzbine.ordering.api;
import java.time.Instant;
import java.util.*;
/** Configuration is guarded after current organization/account authority. */
public interface OrderStages {
 record Stage(UUID id,long revision,String originalRevision,String name,String state,int position){}
 record Configuration(UUID id,long revision,String originalRevision,List<Stage> stages){public Configuration{stages=List.copyOf(stages);}}
 Configuration list(UUID vendor);
 void lock(UUID vendor);
 Stage read(UUID vendor,UUID stage);
 Stage create(UUID actor,UUID vendor,UUID id,String name,Instant at);
 Stage change(UUID actor,UUID vendor,UUID id,String expected,String name,boolean retire,Instant at);
 Configuration reorder(UUID actor,UUID vendor,String expected,List<UUID> ids,Instant at);
 void compactExpiredCreations();
}
