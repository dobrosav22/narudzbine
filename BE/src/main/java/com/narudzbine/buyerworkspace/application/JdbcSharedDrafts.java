package com.narudzbine.buyerworkspace.application;
import com.narudzbine.buyerworkspace.api.*;
import com.narudzbine.buyerworkspace.api.SharedDrafts.*;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcSharedDrafts implements SharedDrafts {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;
 public JdbcSharedDrafts(JdbcTemplate jdbc,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.clock=clock;this.ids=ids;}
 public Optional<UUID> vendor(UUID buyer,UUID id){return jdbc.query("SELECT vendor_id FROM buyer_draft WHERE buyer_id=? AND id=?",(r,n)->r.getObject(1,UUID.class),buyer,id).stream().findFirst();}
 public Item read(UUID buyer,UUID id){var rows=jdbc.query("SELECT * FROM buyer_draft WHERE buyer_id=? AND id=?",this::map,buyer,id);if(rows.isEmpty()){throw failure(DraftFailure.Reason.NOT_FOUND,null);}return rows.getFirst();}
 public Page list(UUID buyer,int page,int size,boolean total){
  var rows=jdbc.query("""
   WITH filtered AS MATERIALIZED (SELECT * FROM buyer_draft WHERE buyer_id=? AND state='OPEN'),
   page AS (SELECT * FROM filtered ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?)
   SELECT p.*,c.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END total FROM filtered)c
   LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.id ASC
   """,(r,n)->new PageRow(r.getObject("id")==null?null:map(r,n),(Long)r.getObject("total")),buyer,size,Math.multiplyExact(page,size),total);
  return new Page(rows.stream().map(PageRow::item).filter(Objects::nonNull).toList(),rows.getFirst().total());
 }
 public Optional<Item> replay(UUID actor,UUID buyer,UUID id,byte[] digest){
  var rows=jdbc.queryForList("SELECT d.buyer_id,c.creator_id,c.payload_hash,c.original_snapshot::text AS snapshot,c.expires_at FROM buyer_draft d JOIN draft_creation c ON c.draft_id=d.id WHERE d.id=?",id);
  if(rows.isEmpty()){return Optional.empty();}var r=rows.getFirst();
  if(!buyer.equals(r.get("buyer_id"))||!actor.equals(r.get("creator_id"))){throw failure(DraftFailure.Reason.NOT_FOUND,null);}
  if(!java.security.MessageDigest.isEqual(digest,(byte[])r.get("payload_hash"))){throw failure(DraftFailure.Reason.IDEMPOTENCY_MISMATCH,null);}
  if(!clock.instant().isBefore(((Timestamp)r.get("expires_at")).toInstant())){throw failure(DraftFailure.Reason.REPLAY_EXPIRED,id);}
  return Optional.of(JSON.readValue((String)r.get("snapshot"),Item.class));
 }
 public Item create(UUID actor,UUID buyer,UUID id,Intent intent,byte[] digest){
  var now=now();int inserted=jdbc.update("INSERT INTO buyer_draft(id,buyer_id,vendor_id,preparation,creator_id,last_editor_id,created_at,updated_at) VALUES (?,?,?,?::jsonb,?,?,?,?) ON CONFLICT(id) DO NOTHING",id,buyer,intent.vendorId(),JSON.writeValueAsString(intent.preparation()),actor,actor,now,now);
  if(inserted==0){return replay(actor,buyer,id,digest).orElseThrow(()->failure(DraftFailure.Reason.NOT_FOUND,null));}
  lines(id,intent.lines());var item=read(buyer,id);event(actor,buyer,item,"CREATED");
  jdbc.update("INSERT INTO draft_creation(draft_id,creator_id,payload_hash,original_snapshot,expires_at) VALUES (?,?,?,?::jsonb,?)",id,actor,digest,JSON.writeValueAsString(item),Timestamp.from(now.toInstant().plus(7,ChronoUnit.DAYS)));
  return item;
 }
 public Item replace(UUID actor,UUID buyer,UUID id,Intent intent){
  var current=read(buyer,id);open(current);if(!current.intent().vendorId().equals(intent.vendorId())){throw failure(DraftFailure.Reason.INVALID_STATE,null);}if(current.intent().equals(intent)){return current;}
  jdbc.update("DELETE FROM buyer_draft_line WHERE draft_id=?",id);
  jdbc.update("UPDATE buyer_draft SET preparation=?::jsonb,revision=revision+1,last_editor_id=?,updated_at=? WHERE buyer_id=? AND id=?",JSON.writeValueAsString(intent.preparation()),actor,now(),buyer,id);
  lines(id,intent.lines());var result=read(buyer,id);event(actor,buyer,result,"UPDATED");return result;
 }
 public Item discard(UUID actor,UUID buyer,UUID id){var current=read(buyer,id);if(current.state().equals("DISCARDED")){return current;}open(current);jdbc.update("UPDATE buyer_draft SET state='DISCARDED',discarded_from_revision=revision,revision=revision+1,last_editor_id=?,updated_at=? WHERE buyer_id=? AND id=?",actor,now(),buyer,id);var result=read(buyer,id);event(actor,buyer,result,"DISCARDED");return result;}
 public Item consume(UUID actor,UUID buyer,UUID id,UUID order,Instant at){var current=read(buyer,id);open(current);jdbc.update("UPDATE buyer_draft SET state='SUBMITTED',submitted_order_id=?,revision=revision+1,last_editor_id=?,updated_at=? WHERE buyer_id=? AND id=?",order,actor,Timestamp.from(at),buyer,id);var result=read(buyer,id);event(actor,buyer,result,"SUBMITTED");return result;}
 public void compactExpiredReceipts(){jdbc.update("UPDATE draft_creation SET original_snapshot=NULL WHERE draft_id IN (SELECT draft_id FROM draft_creation WHERE expires_at<=? AND original_snapshot IS NOT NULL ORDER BY expires_at,draft_id LIMIT 1000 FOR UPDATE SKIP LOCKED)",now());}
 private void lines(UUID id,List<Line> lines){for(int i=0;i<lines.size();i++){var line=lines.get(i);jdbc.update("INSERT INTO buyer_draft_line(draft_id,position,product_id,quantity) VALUES (?,?,?,?)",id,i,line.productId(),line.quantity());}}
 private Item map(ResultSet r,int n)throws SQLException{UUID id=r.getObject("id",UUID.class),vendor=r.getObject("vendor_id",UUID.class);var p=JSON.readValue(r.getString("preparation"),Preparation.class);var lines=jdbc.query("SELECT product_id,quantity FROM buyer_draft_line WHERE draft_id=? ORDER BY position",(row,i)->new Line(row.getObject(1,UUID.class),row.getInt(2)),id);return new Item(id,r.getObject("buyer_id",UUID.class),r.getLong("revision"),new Intent(vendor,lines,p.deliveryLocationId(),p.contactOverride(),p.instructionsOverride(),p.note(),p.replacementForOrderId(),p.instructionsMode()),r.getString("state"),(Long)r.getObject("discarded_from_revision"),r.getObject("submitted_order_id",UUID.class),r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant());}
 private void event(UUID actor,UUID buyer,Item item,String action){jdbc.update("INSERT INTO draft_event(id,draft_id,buyer_id,actor_id,revision,action,created_at) VALUES (?,?,?,?,?,?,?)",ids.next(),item.id(),buyer,actor,item.revision(),action,now());}
 private void open(Item item){if(!item.state().equals("OPEN")){throw failure(DraftFailure.Reason.INVALID_STATE,null);}}
 private Timestamp now(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));}
 private static DraftFailure failure(DraftFailure.Reason reason,UUID id){return new DraftFailure(reason,id);}
 private record PageRow(Item item,Long total){}
}
