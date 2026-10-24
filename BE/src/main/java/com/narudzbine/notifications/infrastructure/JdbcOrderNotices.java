package com.narudzbine.notifications.infrastructure;
import com.narudzbine.notifications.api.OrderNotices;
import com.narudzbine.shared.api.UuidGenerator;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcOrderNotices implements OrderNotices {
 private final JdbcTemplate jdbc;private final UuidGenerator ids;
 public JdbcOrderNotices(JdbcTemplate jdbc,UuidGenerator ids){this.jdbc=jdbc;this.ids=ids;}
 public void messageCreated(UUID order,UUID message,UUID organization,Instant at){
  var recipients=jdbc.queryForList("SELECT a.id,COALESCE(a.language_override,o.default_language) AS locale FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE b.organization_id=? AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified ORDER BY a.id",organization);
  enqueue(Kind.MESSAGE,order,message,organization,recipients,at);
 }
 public void cancelled(UUID order,UUID event,UUID buyer,UUID vendor,UUID submitter,UUID actor,UUID actorOrganization,Instant at){
  var recipients=jdbc.queryForList("SELECT a.id,b.organization_id,COALESCE(a.language_override,o.default_language) AS locale FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND a.id<>? AND ((b.organization_id=? AND (a.id=? OR b.role IN ('OWNER','ADMIN'))) OR (b.organization_id=? AND ?::uuid=?::uuid)) ORDER BY a.id",actor,buyer,submitter,vendor,actorOrganization,buyer);
  enqueue(Kind.ORDER_EVENT,order,event,null,recipients,at);
 }
 public void cancellationRequested(UUID order,UUID event,UUID vendor,Instant at){
  var recipients=jdbc.queryForList("SELECT a.id,COALESCE(a.language_override,o.default_language) AS locale FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE b.organization_id=? AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified ORDER BY a.id",vendor);
  enqueue(Kind.ORDER_EVENT,order,event,vendor,recipients,at);
 }
 public void responded(UUID order,UUID event,UUID buyer,UUID submitter,Instant at){
  var recipients=jdbc.queryForList("SELECT a.id,COALESCE(a.language_override,o.default_language) AS locale FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE b.organization_id=? AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified AND (a.id=? OR b.role IN ('OWNER','ADMIN')) ORDER BY a.id",buyer,submitter);
  enqueue(Kind.ORDER_EVENT,order,event,buyer,recipients,at);
 }
 public void submitted(UUID order,UUID vendor,UUID buyer,Instant at){
  var recipients=jdbc.queryForList("SELECT a.id,COALESCE(a.language_override,o.default_language) AS locale FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE b.organization_id=? AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified ORDER BY a.id",vendor);
  enqueue(Kind.ORDER_SUBMITTED,order,null,vendor,recipients,at);
 }

 // Transport batches are bounded; every chunk still belongs to the caller's one business transaction.
 private static final int RECIPIENT_BATCH_SIZE=250;
 private static final List<String> CHANNELS=List.of("IN_APP","EMAIL","PUSH");
 private enum Kind { MESSAGE, ORDER_EVENT, ORDER_SUBMITTED }
 private record Recipient(UUID account,UUID organization,String locale) {}
 private void enqueue(Kind kind,UUID order,UUID source,UUID organization,List<Map<String,Object>> recipients,Instant at){
  String noticeSql=switch(kind){
   case MESSAGE->"INSERT INTO message_notice(id,message_id,order_id,organization_id,recipient_account_id,locale,created_at) VALUES(?,?,?,?,?,?,?)";
   case ORDER_EVENT->"INSERT INTO order_notice(id,order_id,event_id,organization_id,recipient_account_id,locale,created_at) VALUES(?,?,?,?,?,?,?)";
   case ORDER_SUBMITTED->"INSERT INTO order_notice(id,order_id,organization_id,recipient_account_id,locale,created_at) VALUES(?,?,?,?,?,?)";
  };
  String deliverySql=kind==Kind.MESSAGE
   ?"INSERT INTO message_delivery(id,notice_id,channel,state,created_at,expires_at) VALUES(?,?,?,'QUEUED',?,?)"
   :"INSERT INTO order_delivery(id,notice_id,channel,state,created_at,expires_at) VALUES(?,?,?,'QUEUED',?,?)";
  Timestamp created=Timestamp.from(at),expires=Timestamp.from(at.plusSeconds(86400));
  for(int start=0;start<recipients.size();start+=RECIPIENT_BATCH_SIZE){
   int end=Math.min(recipients.size(),start+RECIPIENT_BATCH_SIZE);
   var notices=new ArrayList<Object[]>(end-start);var deliveries=new ArrayList<Object[]>((end-start)*CHANNELS.size());
   for(int index=start;index<end;index++){
    var row=recipients.get(index);
    var recipient=new Recipient((UUID)row.get("id"),organization==null?(UUID)row.get("organization_id"):organization,(String)row.get("locale"));
    UUID notice=ids.next();
    notices.add(switch(kind){
     case MESSAGE->new Object[]{notice,source,order,recipient.organization(),recipient.account(),recipient.locale(),created};
     case ORDER_EVENT->new Object[]{notice,order,source,recipient.organization(),recipient.account(),recipient.locale(),created};
     case ORDER_SUBMITTED->new Object[]{notice,order,recipient.organization(),recipient.account(),recipient.locale(),created};
    });
    for(String channel:CHANNELS)deliveries.add(new Object[]{ids.next(),notice,channel,created,expires});
   }
   persist(noticeSql,notices);persist(deliverySql,deliveries);
  }
 }
 private void persist(String sql,List<Object[]> rows){
  int[] counts=jdbc.batchUpdate(sql,rows);
  if(counts.length!=rows.size()||Arrays.stream(counts).anyMatch(n->n!=1&&n!=java.sql.Statement.SUCCESS_NO_INFO))
   throw new org.springframework.dao.DataIntegrityViolationException("Notification batch incomplete.");
 }

}
