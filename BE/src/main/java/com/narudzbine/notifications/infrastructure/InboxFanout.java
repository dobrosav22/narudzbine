package com.narudzbine.notifications.infrastructure;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
@Service
public final class InboxFanout {
 private final JdbcTemplate jdbc;private final Clock clock;private final TransactionTemplate tx;
 public InboxFanout(JdbcTemplate jdbc,Clock clock,PlatformTransactionManager manager){this.jdbc=jdbc;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 public int tick(){var ids=jdbc.query("SELECT id FROM inbox_work WHERE state='QUEUED' ORDER BY sequence LIMIT 50",(r,n)->r.getObject(1,UUID.class));int count=0;for(var id:ids){if(publish(id))count++;}return count;}
 public boolean publish(UUID id){return Boolean.TRUE.equals(tx.execute(s->{
  var routes=jdbc.queryForList("SELECT organization_id,recipient_account_id FROM inbox_work WHERE id=?",id);if(routes.isEmpty())return false;
  var route=routes.getFirst();UUID org=(UUID)route.get("organization_id"),account=(UUID)route.get("recipient_account_id");
  if(org!=null)jdbc.queryForObject("SELECT id FROM organization WHERE id=? FOR UPDATE",UUID.class,org);
  jdbc.queryForObject("SELECT id FROM account_identity WHERE id=? FOR UPDATE",UUID.class,account);
  var rows=jdbc.queryForList("SELECT * FROM inbox_work WHERE id=? AND state='QUEUED' FOR UPDATE SKIP LOCKED",id);if(rows.isEmpty())return false;var w=rows.getFirst();
  if(w.get("order_id")!=null&&Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM inbox_work WHERE recipient_account_id=? AND order_id=? AND state='QUEUED' AND sequence<?)",Boolean.class,account,w.get("order_id"),w.get("sequence"))))return false;
  Instant at=clock.instant().truncatedTo(ChronoUnit.MILLIS);Instant created=((Timestamp)w.get("created_at")).toInstant();
  String state="PUBLISHED";boolean mandatory=(Boolean)w.get("mandatory");
  if(!created.plusSeconds(90L*86400).isAfter(at)||!mandatory&&!created.plusSeconds(86400).isAfter(at))state="EXPIRED";
  else if(!mandatory&&!eligible(w))state="SUPPRESSED";
  if(state.equals("PUBLISHED")){
   String text=InboxText.render((String)w.get("locale"),(String)w.get("event_key"),(String)w.get("organization_name"),(String)w.get("order_reference"));
   if(jdbc.update("INSERT INTO notification(id,recipient_account_id,organization_id,event_key,order_id,text,created_at) VALUES (?,?,?,?,?,?,?)",id,account,org,w.get("event_key"),w.get("order_id"),text,w.get("created_at"))!=1)throw new IllegalStateException("Inbox publication missing");
  }
  if(jdbc.update("UPDATE inbox_work SET state=?,completed_at=? WHERE id=?",state,Timestamp.from(at),id)!=1)throw new IllegalStateException("Inbox receipt missing");return true;
 }));}
 private boolean eligible(Map<String,Object> w){
  UUID account=(UUID)w.get("recipient_account_id"),org=(UUID)w.get("organization_id");if(account.equals(w.get("actor_id")))return false;
  var members=jdbc.queryForList("SELECT b.role FROM business_account b JOIN account_identity a ON a.id=b.id JOIN organization o ON o.id=b.organization_id WHERE b.id=? AND b.organization_id=? AND a.state='ACTIVE' AND a.email_verified AND o.state='ACTIVE'",account,org);if(members.isEmpty())return false;
  if(Boolean.FALSE.equals(jdbc.queryForObject("SELECT COALESCE((SELECT in_app FROM notification_preference WHERE account_id=? AND event_key=?),true)",Boolean.class,account,w.get("event_key"))))return false;
  String role=(String)members.getFirst().get("role");if(w.get("source_kind").equals("RELATIONSHIP"))return role.equals("OWNER")||role.equals("ADMIN");
  if(w.get("source_kind").equals("ORDER")){
   var order=jdbc.queryForMap("SELECT vendor_id,buyer_id,submitted_by FROM purchase_order WHERE id=?",w.get("order_id"));
   if(org.equals(order.get("vendor_id")))return true;
   return org.equals(order.get("buyer_id"))&&(account.equals(order.get("submitted_by"))||role.equals("OWNER")||role.equals("ADMIN"));
  }return w.get("source_kind").equals("MESSAGE");
 }
}
