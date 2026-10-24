package com.narudzbine.identity.application;
import com.narudzbine.audit.api.SupportAudit;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Internal routing is never authority. Caller locks sorted organizations before current account/session. */
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class SupportAccessService {
 public record Target(UUID id,String country,boolean vendor){}
 public record Context(UUID id,UUID actor,Target target,Instant expires){}
 private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;private final SupportAudit audit;
 public SupportAccessService(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,SupportAudit audit){this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.audit=audit;}
 public boolean platformAccount(UUID actor){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM platform_account WHERE id=?)",Boolean.class,actor));}
 public Optional<UUID> route(UUID context){return jdbc.queryForList("SELECT organization_id FROM support_access WHERE id=?",UUID.class,context).stream().findFirst();}
 public Optional<Target> lock(UUID organization,Set<UUID> partners){var all=new HashSet<>(partners);all.add(organization);String slots=String.join(",",Collections.nCopies(all.size(),"?"));var targets=jdbc.query("SELECT id,country,type FROM organization WHERE id IN("+slots+") ORDER BY id FOR UPDATE",(r,n)->new Target(r.getObject(1,UUID.class),r.getString(2),r.getString(3).equals("VENDOR")),all.toArray());return targets.stream().filter(t->t.id().equals(organization)).findFirst();}
 public Context create(UUID actor,Target target,String reason,String caseReference){var rows=jdbc.queryForList("SELECT security_epoch,credential_generation FROM account_identity WHERE id=? AND kind='PLATFORM_ADMIN' AND state='ACTIVE' AND email_verified AND NOT credential_operation_pending",actor);if(rows.size()!=1)throw new IllegalStateException("Support administrator unavailable");var row=rows.getFirst();Instant now=clock.instant().truncatedTo(ChronoUnit.MILLIS),expires=now.plusSeconds(1800);UUID id=ids.next();jdbc.update("INSERT INTO support_access(id,administrator_id,organization_id,country,security_epoch,credential_generation,reason,case_reference,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)",id,actor,target.id(),target.country(),row.get("security_epoch"),row.get("credential_generation"),reason,caseReference,Timestamp.from(now),Timestamp.from(expires));audit.created(actor,id);return new Context(id,actor,target,expires);}
 public Optional<Context> require(UUID actor,UUID context,Target target){return jdbc.query("SELECT s.expires_at FROM support_access s JOIN account_identity a ON a.id=s.administrator_id WHERE s.id=? AND s.administrator_id=? AND s.organization_id=? AND s.country=? AND s.security_epoch=a.security_epoch AND s.credential_generation=a.credential_generation AND a.kind='PLATFORM_ADMIN' AND a.state='ACTIVE' AND a.email_verified AND NOT a.credential_operation_pending AND s.expires_at>?",(r,n)->new Context(context,actor,target,r.getTimestamp(1).toInstant()),context,actor,target.id(),target.country(),Timestamp.from(clock.instant())).stream().findFirst();}
 public boolean unexpired(Context context){return clock.instant().isBefore(context.expires());}
}
