package com.narudzbine.notifications.infrastructure;
import com.narudzbine.notifications.api.*;
import java.sql.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service @Transactional(propagation=Propagation.MANDATORY)
public class JdbcInbox implements Inbox {
 private final JdbcTemplate jdbc;private final Clock clock;
 public JdbcInbox(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
 public Preferences preferences(UUID account){
  long revision=jdbc.queryForObject("SELECT COALESCE((SELECT revision FROM notification_preferences WHERE account_id=?),1)",Long.class,account);
  String locale=jdbc.queryForObject("SELECT language_override FROM account_identity WHERE id=?",String.class,account);
  var values=new EnumMap<Event,Preference>(Event.class);
  jdbc.query("SELECT * FROM notification_preference WHERE account_id=?",r->{Event e=Event.valueOf(r.getString("event_key"));values.put(e,new Preference(e,r.getBoolean("in_app"),r.getBoolean("email"),r.getBoolean("push")));},account);
  return new Preferences(account,revision,locale,Arrays.stream(Event.values()).map(e->values.getOrDefault(e,new Preference(e,true,false,false))).toList());
 }
 public Preferences replace(UUID account,long expected,List<Preference> supplied){
  // The authenticated caller holds organization/account/session guards; this also serializes internal callers.
  jdbc.queryForObject("SELECT id FROM account_identity WHERE id=? FOR UPDATE",UUID.class,account);
  var current=preferences(account);if(current.revision()!=expected)throw new InboxFailure("REVISION_CONFLICT");
  var values=new EnumMap<Event,Preference>(Event.class);for(var p:supplied){if(values.put(p.event(),p)!=null)throw new IllegalArgumentException("Duplicate preference");}
  var normalized=Arrays.stream(Event.values()).map(e->values.getOrDefault(e,new Preference(e,true,false,false))).toList();
  if(current.events().equals(normalized))return current;
  jdbc.update("INSERT INTO notification_preferences(account_id) VALUES (?) ON CONFLICT DO NOTHING",account);
  jdbc.update("DELETE FROM notification_preference WHERE account_id=?",account);
  for(var p:normalized){if(jdbc.update("INSERT INTO notification_preference(account_id,event_key,in_app,email,push) VALUES (?,?,?,?,?)",account,p.event().name(),p.inApp(),p.email(),p.push())!=1)throw new IllegalStateException("Preference write missing");}
  if(jdbc.update("UPDATE notification_preferences SET revision=revision+1 WHERE account_id=?",account)!=1)throw new IllegalStateException("Preference revision missing");return preferences(account);
 }
 public Page list(UUID account,int size,Boolean unread,Position p){
  var rows=jdbc.query("SELECT * FROM notification WHERE recipient_account_id=? AND created_at>? AND (?::boolean IS NULL OR read=NOT ?::boolean) AND (?::timestamptz IS NULL OR created_at<? OR (created_at=? AND id>?)) ORDER BY created_at DESC,id ASC LIMIT ?",JdbcInbox::map,account,Timestamp.from(clock.instant().minusSeconds(90L*86400)),unread,unread,p==null?null:Timestamp.from(p.at()),p==null?null:Timestamp.from(p.at()),p==null?null:Timestamp.from(p.at()),p==null?null:p.id(),size+1);
  return new Page(List.copyOf(rows.subList(0,Math.min(size,rows.size()))),rows.size()>size);
 }
 public Item markRead(UUID account,UUID id){
  var cutoff=Timestamp.from(clock.instant().minusSeconds(90L*86400));jdbc.update("UPDATE notification SET read=true WHERE id=? AND recipient_account_id=? AND created_at>? AND NOT read",id,account,cutoff);
  return jdbc.query("SELECT * FROM notification WHERE id=? AND recipient_account_id=? AND created_at>?",JdbcInbox::map,id,account,cutoff).stream().findFirst().orElseThrow(()->new InboxFailure("NOT_FOUND"));
 }
 private static Item map(ResultSet r,int n)throws SQLException{return new Item(r.getObject("id",UUID.class),r.getString("event_key"),r.getObject("order_id",UUID.class),r.getObject("organization_id",UUID.class),r.getString("text"),r.getBoolean("read"),r.getTimestamp("created_at").toInstant());}
}
