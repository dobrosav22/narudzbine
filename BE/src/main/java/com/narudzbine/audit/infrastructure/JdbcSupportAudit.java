package com.narudzbine.audit.infrastructure;
import com.narudzbine.audit.api.SupportAudit;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcSupportAudit implements SupportAudit {
 private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;
 public JdbcSupportAudit(JdbcTemplate jdbc,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.clock=clock;this.ids=ids;}
 public void created(UUID actor,UUID context){append(actor,context,"SUPPORT_ACCESS_CREATED");}
 public void read(UUID actor,UUID context,UUID organization,String country,String type,UUID resource,String filters){
  UUID event=append(actor,context,"COMMERCIAL_SUPPORT_READ");
  int count=jdbc.update("INSERT INTO support_read_evidence(audit_id,context_id,organization_id,country,resource_type,resource_id,filters) SELECT ?,id,organization_id,country,?,?,?::jsonb FROM support_access WHERE id=? AND administrator_id=? AND organization_id=? AND country=?",event,type,resource,filters,context,actor,organization,country);
  if(count!=1)throw new IllegalStateException("Support evidence scope unavailable");
 }
 private UUID append(UUID actor,UUID context,String action){
  UUID event=ids.next(),request=ids.next();String value=MDC.get("requestId");
  if(value!=null){try{UUID parsed=UUID.fromString(value);if(parsed.version()==7&&parsed.variant()==2&&parsed.toString().equals(value))request=parsed;}catch(IllegalArgumentException ignored){}}
  int count=jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) SELECT ?,'PLATFORM_ADMIN',id,?,'SUPPORT_ACCESS',?,'SUCCESS',?,?,ARRAY['supportContext'] FROM platform_account WHERE id=?",event,action,context,request,Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),actor);
  if(count!=1)throw new IllegalStateException("Support audit actor unavailable");return event;
 }
}
