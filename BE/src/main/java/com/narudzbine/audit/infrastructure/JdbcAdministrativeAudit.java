package com.narudzbine.audit.infrastructure;
import com.narudzbine.audit.api.AdministrativeAudit;
import com.narudzbine.shared.api.UuidGenerator;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.sql.Timestamp;
import java.util.*;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcAdministrativeAudit implements AdministrativeAudit {
 private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;
 public JdbcAdministrativeAudit(JdbcTemplate jdbc,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.clock=clock;this.ids=ids;}
 public void closed(UUID actor,UUID organization,String country,String privateReason){append(actor,organization,country,"ADMIN_ORGANIZATION_CLOSED","ORGANIZATION",organization,List.of("state","sessions","invitations","connections"),privateReason);}
 public void organization(UUID actor,UUID organization,String country,List<String> fields,String reason){append(actor,organization,country,"ADMIN_ORGANIZATION_CORRECTED","ORGANIZATION",organization,fields,reason);}
 public void state(UUID actor,UUID organization,String country,boolean active,String reason){append(actor,organization,country,active?"ADMIN_ORGANIZATION_REACTIVATED":"ADMIN_ORGANIZATION_SUSPENDED","ORGANIZATION",organization,active?List.of("state"):List.of("state","sessions"),reason);}
 public void staff(UUID actor,UUID organization,String country,UUID member,boolean active,List<String> fields,String reason){append(actor,organization,country,active?"ADMIN_STAFF_REACTIVATED":"ADMIN_STAFF_DEACTIVATED","MEMBER",member,fields,reason);}
 public void transfer(UUID actor,UUID organization,String country,UUID transfer,boolean expired,String reason){append(actor,organization,country,expired?"ADMIN_TRANSFER_EXPIRED":"ADMIN_TRANSFER_INVALIDATED","OWNERSHIP_TRANSFER",transfer,List.of("state"),reason);}
 private void append(UUID actor,UUID org,String country,String action,String type,UUID resource,List<String> fields,String reason){
  if(fields.isEmpty()||fields.stream().anyMatch(v->!v.matches("[A-Za-z][A-Za-z0-9_]{0,99}")))throw new IllegalArgumentException("Invalid administrative audit field");UUID request=ids.next();String value=MDC.get("requestId");if(value!=null){try{UUID id=UUID.fromString(value);if(id.version()==7&&id.variant()==2&&id.toString().equals(value))request=id;}catch(IllegalArgumentException ignored){}}
  int inserted=jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,reason,target_organization_id,target_country) SELECT ?,'PLATFORM_ADMIN',id,?,?,?,'SUCCESS',?,?,?::text[],?,?,? FROM platform_account WHERE id=?",ids.next(),action,type,resource,request,Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),"{"+String.join(",",fields)+"}",reason,org,country,actor);if(inserted!=1)throw new IllegalStateException("Administrative audit actor unavailable");
 }
}
