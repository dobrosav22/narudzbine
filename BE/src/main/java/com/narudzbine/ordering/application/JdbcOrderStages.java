package com.narudzbine.ordering.application;
import com.narudzbine.ordering.api.*;
import com.narudzbine.ordering.api.OrderStages.*;
import com.narudzbine.audit.api.OrderAudit;
import com.narudzbine.shared.api.ResourceRevisions;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcOrderStages implements OrderStages {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private static final Set<String> CORE=Set.of("awaiting acceptance","awaiting_acceptance","accepted","dispatched","delivered","rejected","cancelled","canceled","čeka prihvatanje","čeka prihvaćanje","čeka potvrdu","prihvaćeno","poslato","poslano","otpremljeno","isporučeno","odbijeno","otkazano");
 private final JdbcTemplate jdbc;private final Clock clock;private final OrderAudit audit;private final org.springframework.beans.factory.ObjectProvider<ResourceRevisions> revisions;
 public JdbcOrderStages(JdbcTemplate jdbc,Clock clock,OrderAudit audit,org.springframework.beans.factory.ObjectProvider<ResourceRevisions> revisions){this.jdbc=jdbc;this.clock=clock;this.audit=audit;this.revisions=revisions;}
 public void lock(UUID vendor){jdbc.update("INSERT INTO order_stage_configuration(vendor_id) VALUES(?) ON CONFLICT DO NOTHING",vendor);jdbc.queryForObject("SELECT vendor_id FROM order_stage_configuration WHERE vendor_id=? FOR UPDATE",UUID.class,vendor);}
 public Configuration list(UUID vendor){var rows=jdbc.queryForList("SELECT revision FROM order_stage_configuration WHERE vendor_id=?",Long.class,vendor);long revision=rows.isEmpty()?1:rows.getFirst();var stages=jdbc.query("SELECT * FROM order_stage WHERE vendor_id=? ORDER BY position,id",(r,n)->stage(r.getObject("id",UUID.class),r.getLong("revision"),r.getString("name"),r.getString("state"),r.getInt("position")),vendor);return new Configuration(vendor,revision,token("stageconfig/v1",vendor,revision),stages);}
 public Stage read(UUID vendor,UUID id){return jdbc.query("SELECT * FROM order_stage WHERE vendor_id=? AND id=?",(r,n)->stage(id,r.getLong("revision"),r.getString("name"),r.getString("state"),r.getInt("position")),vendor,id).stream().findFirst().orElseThrow(()->fail(StageFailure.Reason.NOT_FOUND));}
 public Stage create(UUID actor,UUID vendor,UUID id,String name,Instant at){
  lock(vendor);byte[] digest=digest(name);var existing=jdbc.queryForList("SELECT * FROM order_stage_creation WHERE stage_id=?",id);
  if(!existing.isEmpty()){var row=existing.getFirst();if(!vendor.equals(row.get("vendor_id"))||!actor.equals(row.get("creator_id"))){throw fail(StageFailure.Reason.NOT_FOUND);}if(!java.security.MessageDigest.isEqual(digest,(byte[])row.get("payload_hash"))){throw fail(StageFailure.Reason.IDEMPOTENCY_MISMATCH);}if(!at.isBefore(((Timestamp)row.get("expires_at")).toInstant())){throw new StageFailure(StageFailure.Reason.REPLAY_EXPIRED,id,0,null);}if(row.get("original_result")==null){throw new IllegalStateException("Unexpired stage success missing");}return JSON.readValue(row.get("original_result").toString(),Stage.class);}
  available(vendor,id,name);var config=list(vendor);if(config.stages().size()>=20){throw fail(StageFailure.Reason.LIMIT_EXCEEDED);}int position=config.stages().size();
  int inserted=jdbc.update("INSERT INTO order_stage(id,vendor_id,name,normalized_name,position) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",id,vendor,name,normalized(name),position);if(inserted!=1){throw fail(StageFailure.Reason.NOT_FOUND);}bump(vendor);var result=read(vendor,id);jdbc.update("INSERT INTO order_stage_creation(stage_id,vendor_id,creator_id,payload_hash,original_result,expires_at) VALUES(?,?,?,?,?::jsonb,?)",id,vendor,actor,digest,JSON.writeValueAsString(result),Timestamp.from(at.plusSeconds(604800)));audit.stageConfigured(actor,id,"STAGE_CREATED");return result;
 }
 public Stage change(UUID actor,UUID vendor,UUID id,String expected,String name,boolean retire,Instant at){
  lock(vendor);var current=read(vendor,id);String action=retire?"RETIRE":"RENAME",payload=JSON.writeValueAsString(retire?Map.of():Map.of("name",name));var replay=replay(vendor,id,expected,action,payload);if(replay.isPresent()){return JSON.readValue(replay.get(),Stage.class);}check("stage/v1",id,current.revision(),expected);
  boolean changed=retire?!current.state().equals("RETIRED"):!current.name().equals(name);if(changed){if(retire){jdbc.update("UPDATE order_stage SET state='RETIRED',revision=revision+1 WHERE id=?",id);}else{available(vendor,id,name);jdbc.update("UPDATE order_stage SET name=?,normalized_name=?,revision=revision+1 WHERE id=?",name,normalized(name),id);}bump(vendor);audit.stageConfigured(actor,id,retire?"STAGE_RETIRED":"STAGE_RENAMED");}var result=read(vendor,id);save(vendor,id,expected,action,payload,JSON.writeValueAsString(result),changed);return result;
 }
 public Configuration reorder(UUID actor,UUID vendor,String expected,List<UUID> ids,Instant at){
  lock(vendor);String payload=JSON.writeValueAsString(ids);var replay=replay(vendor,vendor,expected,"REORDER",payload);if(replay.isPresent()){return JSON.readValue(replay.get(),Configuration.class);}var current=list(vendor);check("stageconfig/v1",vendor,current.revision(),expected);if(ids.size()!=current.stages().size()||new HashSet<>(ids).size()!=ids.size()||!new HashSet<>(ids).equals(new HashSet<>(current.stages().stream().map(Stage::id).toList()))){throw fail(StageFailure.Reason.INVALID_ORDER);}boolean changed=!ids.equals(current.stages().stream().map(Stage::id).toList());if(changed){for(int i=0;i<ids.size();i++){jdbc.update("UPDATE order_stage SET position=?,revision=revision+1 WHERE id=? AND position<>?",i,ids.get(i),i);}bump(vendor);audit.stageConfigured(actor,vendor,"STAGES_REORDERED");}var result=list(vendor);save(vendor,vendor,expected,"REORDER",payload,JSON.writeValueAsString(result),changed);return result;
 }
 private Optional<String> replay(UUID vendor,UUID id,String expected,String action,String payload){var rows=jdbc.queryForList("SELECT result::text FROM order_stage_mutation WHERE vendor_id=? AND resource_id=? AND expected_revision=? AND action=? AND payload=?::jsonb",String.class,vendor,id,expected,action,payload);if(!rows.isEmpty()){return Optional.of(rows.getFirst());}if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM order_stage_mutation WHERE vendor_id=? AND resource_id=? AND expected_revision=? AND changed)",Boolean.class,vendor,id,expected))){throw fail(StageFailure.Reason.IDEMPOTENCY_MISMATCH);}return Optional.empty();}
 private void save(UUID vendor,UUID id,String expected,String action,String payload,String result,boolean changed){jdbc.update("INSERT INTO order_stage_mutation(vendor_id,resource_id,expected_revision,action,payload,result,changed) VALUES(?,?,?,?,?::jsonb,?::jsonb,?)",vendor,id,expected,action,payload,result,changed);}
 private void check(String domain,UUID id,long revision,String expected){if(!revisions.getObject().matches(domain,id,revision,expected)){throw new StageFailure(StageFailure.Reason.REVISION_CONFLICT,id,revision,domain);}}
 private void bump(UUID vendor){jdbc.update("UPDATE order_stage_configuration SET revision=revision+1 WHERE vendor_id=?",vendor);}
 private void available(UUID vendor,UUID id,String name){String key=normalized(name);if(CORE.contains(key)){throw fail(StageFailure.Reason.RESERVED_NAME);}if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM order_stage WHERE vendor_id=? AND normalized_name=? AND id<>?)",Boolean.class,vendor,key,id))){throw fail(StageFailure.Reason.DUPLICATE_NAME);}}
 private Stage stage(UUID id,long revision,String name,String state,int position){return new Stage(id,revision,token("stage/v1",id,revision),name,state,position);}
 private String token(String domain,UUID id,long revision){return revisions.getObject().encode(domain,id,revision);}
 private static String normalized(String name){return java.text.Normalizer.normalize(name.strip(),java.text.Normalizer.Form.NFC).toLowerCase(Locale.ROOT);}
 private static byte[] digest(String name){try{return java.security.MessageDigest.getInstance("SHA-256").digest(("order-stage-create/v1\0"+name).getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException("Stage digest unavailable");}}
 public void compactExpiredCreations(){jdbc.update("WITH expired AS (SELECT stage_id FROM order_stage_creation WHERE original_result IS NOT NULL AND expires_at<=? ORDER BY expires_at,stage_id LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE order_stage_creation p SET original_result=NULL FROM expired e WHERE p.stage_id=e.stage_id",Timestamp.from(clock.instant()));}
 private static StageFailure fail(StageFailure.Reason reason){return new StageFailure(reason);}
}
