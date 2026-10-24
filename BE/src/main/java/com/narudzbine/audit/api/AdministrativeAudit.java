package com.narudzbine.audit.api;
import java.util.*;
public interface AdministrativeAudit {
 void closed(UUID actor,UUID organization,String country,String privateReason);
 void organization(UUID actor,UUID organization,String country,List<String> fields,String reason);
 void state(UUID actor,UUID organization,String country,boolean active,String reason);
 void staff(UUID actor,UUID organization,String country,UUID member,boolean active,List<String> fields,String reason);
 void transfer(UUID actor,UUID organization,String country,UUID transfer,boolean expired,String reason);
}
