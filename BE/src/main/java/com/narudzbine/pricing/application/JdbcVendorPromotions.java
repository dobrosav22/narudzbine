package com.narudzbine.pricing.application;

import com.narudzbine.pricing.api.*;
import com.narudzbine.pricing.api.VendorPromotions.*;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.audit.api.PricingAudit;
import java.math.*;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcVendorPromotions implements VendorPromotions {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final JdbcTemplate jdbc;private final VendorProducts products;private final VendorTaxonomy taxonomy;private final TradingConnections trading;private final PricingAudit audit;private final Clock clock;
 public JdbcVendorPromotions(JdbcTemplate jdbc,VendorProducts products,VendorTaxonomy taxonomy,TradingConnections trading,PricingAudit audit,Clock clock){this.jdbc=jdbc;this.products=products;this.taxonomy=taxonomy;this.trading=trading;this.audit=audit;this.clock=clock;}
 public void compactExpiredCreations(){jdbc.update("WITH expired AS(SELECT promotion_id FROM promotion_creation WHERE original_snapshot IS NOT NULL AND expires_at<=? ORDER BY expires_at,promotion_id LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE promotion_creation p SET original_snapshot=NULL FROM expired e WHERE p.promotion_id=e.promotion_id",time(now()));}
 @Override public Item get(UUID vendor,UUID id){return getAt(vendor,id,now());}
 private Item getAt(UUID vendor,UUID id,Instant at){var rows=jdbc.queryForList("SELECT * FROM promotion WHERE vendor_id=? AND id=?",vendor,id);if(rows.isEmpty()){throw fail(PromotionFailure.Reason.NOT_FOUND,null,id);}return map(rows.getFirst(),at);}
 @Override public Page list(UUID vendor,int page,int size,boolean total,String state){
  Instant at=now();var rows=jdbc.queryForList("""
   WITH filtered AS MATERIALIZED (SELECT *,CASE WHEN stopped_at IS NOT NULL THEN 'STOPPED' WHEN starts_at>? THEN 'SCHEDULED' WHEN ends_at<=? THEN 'ENDED' ELSE 'RUNNING' END AS current_state FROM promotion WHERE vendor_id=?),
   matched AS MATERIALIZED (SELECT * FROM filtered WHERE ?::text IS NULL OR current_state=?),
   page AS (SELECT * FROM matched ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?)
   SELECT p.*,c.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM matched)c LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.id ASC
   """,time(at),time(at),vendor,state,state,size,Math.multiplyExact(page,size),total);
  return new Page(rows.stream().filter(r->r.get("id")!=null).map(r->map(r,at)).toList(),(Long)rows.getFirst().get("total"));
 }
 @Override public Creation create(UUID actor,UUID vendor,UUID id,Values values,byte[] digest){
  guard(vendor);if(exists(id)){return replay(actor,vendor,id,digest);}validate(values);Labels labels=references(vendor,values);Instant at=now();future(values,at);
  if(jdbc.update("INSERT INTO catalogue_promotion_identity(id,vendor_id) VALUES (?,?) ON CONFLICT(id) DO NOTHING",id,vendor)==0){return replay(actor,vendor,id,digest);}
  jdbc.update("INSERT INTO promotion(id,vendor_id,definition,target_labels,starts_at,ends_at,created_at,updated_at) VALUES (?,?,?::jsonb,?::jsonb,?,?,?,?)",id,vendor,JSON.writeValueAsString(values),JSON.writeValueAsString(labels),time(values.startsAt()),time(values.endsAt()),time(at),time(at));
  setReferences(id,values);Item item=getAt(vendor,id,at);jdbc.update("INSERT INTO promotion_creation(promotion_id,creator_id,vendor_id,payload_hash,original_snapshot,expires_at) VALUES (?,?,?,?,?::jsonb,?)",id,actor,vendor,digest,JSON.writeValueAsString(item),time(at.plus(7,ChronoUnit.DAYS)));history(actor,item,"PROMOTION_CREATED");return new Creation(item,false);
 }
 @Override public Item replace(UUID actor,UUID vendor,UUID id,Values values){
  guard(vendor);Item current=get(vendor,id);if(!current.state().equals("SCHEDULED")||current.archived()){throw fail(PromotionFailure.Reason.INVALID_STATE,null,id);}validate(values);Labels labels=references(vendor,values);Instant at=now();if(!at.isBefore(current.values().startsAt())){throw fail(PromotionFailure.Reason.INVALID_STATE,null,id);}future(values,at);
  if(current.values().equals(values)){return getAt(vendor,id,at);}clearReferences(id);
  jdbc.update("UPDATE promotion SET definition=?::jsonb,target_labels=?::jsonb,starts_at=?,ends_at=?,revision=revision+1,updated_at=? WHERE id=?",JSON.writeValueAsString(values),JSON.writeValueAsString(labels),time(values.startsAt()),time(values.endsAt()),time(at),id);setReferences(id,values);Item item=getAt(vendor,id,at);history(actor,item,"PROMOTION_UPDATED");return item;
 }
 @Override public Item stop(UUID actor,UUID vendor,UUID id){guard(vendor);Item current=get(vendor,id);if(current.state().equals("STOPPED")){return current;}if(current.archived()||current.state().equals("ENDED")){throw fail(PromotionFailure.Reason.INVALID_STATE,null,id);}Instant at=now();if(!at.isBefore(current.values().endsAt())){throw fail(PromotionFailure.Reason.INVALID_STATE,null,id);}jdbc.update("UPDATE promotion SET stopped_at=?,revision=revision+1,updated_at=? WHERE id=?",time(at),time(at),id);Item item=getAt(vendor,id,at);history(actor,item,"PROMOTION_STOPPED");return item;}
 @Override public Item archive(UUID actor,UUID vendor,UUID id){guard(vendor);Item current=get(vendor,id);if(current.archived()){return current;}if(!Set.of("ENDED","STOPPED").contains(current.state())){throw fail(PromotionFailure.Reason.INVALID_STATE,null,id);}clearReferences(id);jdbc.update("UPDATE promotion SET archived=true,revision=revision+1,updated_at=? WHERE id=?",time(now()),id);Item item=get(vendor,id);history(actor,item,"PROMOTION_ARCHIVED");return item;}
 @Override public Outcome evaluate(UUID vendor,UUID buyer,UUID product,BigDecimal resolved){var candidates=savingCandidates(vendor,buyer,product,resolved,now());Item winner=null;BigDecimal best=resolved.setScale(2);for(var item:candidates){BigDecimal candidate=discounted(resolved,item);if(candidate.compareTo(best)<0){best=candidate;winner=item;}}return new Outcome(best,winner);}
 @Override public List<Item> savingCandidates(UUID vendor,UUID buyer,UUID product,BigDecimal resolved,Instant at){
  if(resolved==null||resolved.signum()<0||resolved.scale()>2||resolved.compareTo(new BigDecimal("999999999.99"))>0){throw fail(PromotionFailure.Reason.INVALID_VALUE,"/resolvedUnitPrice",null);}var relationship=trading.find(vendor,buyer);if(relationship.isEmpty()||!relationship.get().state().equals("ACTIVE")){throw fail(PromotionFailure.Reason.NOT_FOUND,null,null);}var p=products.read(vendor,product);var matches=new ArrayList<Item>();
  var rows=jdbc.queryForList("SELECT * FROM promotion WHERE vendor_id=? AND NOT archived AND stopped_at IS NULL AND starts_at<=? AND ends_at>? ORDER BY created_at ASC,id ASC",vendor,time(at),time(at));
  for(var row:rows){Item item=map(row,at);var v=item.values();if(v.buyerMode()==Mode.SELECTED&&!v.buyerIds().contains(buyer)){continue;}if(v.productMode()==Mode.SELECTED&&!v.productIds().contains(product)&&!v.categoryIds().contains(p.values().categoryId())){continue;}if(discounted(resolved,item).compareTo(resolved)<0){matches.add(item);}}return List.copyOf(matches);
 }
 private static BigDecimal discounted(BigDecimal resolved,Item item){var v=item.values();return (v.kind()==Kind.FIXED_UNIT_PRICE?v.value():resolved.multiply(BigDecimal.ONE.subtract(v.value().movePointLeft(2)))).max(BigDecimal.ZERO).setScale(2,RoundingMode.HALF_UP);}
 private Labels references(UUID vendor,Values values){var p=new ArrayList<Label>();var c=new ArrayList<Label>();var b=new ArrayList<Label>();
  for(UUID id:values.productIds()){try{p.add(new Label(id,products.read(vendor,id).values().name()));}catch(ProductFailure e){throw fail(PromotionFailure.Reason.INVALID_REFERENCE,"/productIds",null);}}
  for(UUID id:values.categoryIds()){try{var item=taxonomy.read(vendor,VendorTaxonomy.Kind.CATEGORY,id);if(item.deleted()){throw fail(PromotionFailure.Reason.INVALID_REFERENCE,"/categoryIds",null);}c.add(new Label(id,item.name()));}catch(TaxonomyFailure e){throw fail(PromotionFailure.Reason.INVALID_REFERENCE,"/categoryIds",null);}}
  for(UUID id:values.buyerIds()){var r=trading.find(vendor,id);if(r.isEmpty()||!r.get().state().equals("ACTIVE")){throw fail(PromotionFailure.Reason.INVALID_REFERENCE,"/buyerIds",null);}b.add(new Label(id,trading.partner(vendor,id).displayName()));}
  return new Labels(List.copyOf(p),List.copyOf(c),List.copyOf(b));
 }
 private void setReferences(UUID id,Values v){for(UUID product:v.productIds()){jdbc.update("INSERT INTO promotion_product(promotion_id,product_id) VALUES (?,?)",id,product);}for(UUID category:v.categoryIds()){jdbc.update("INSERT INTO catalogue_promotion_taxonomy(promotion_id,taxonomy_id) VALUES (?,?)",id,category);}for(UUID buyer:v.buyerIds()){jdbc.update("INSERT INTO promotion_buyer(promotion_id,buyer_id) VALUES (?,?)",id,buyer);}}
 private void clearReferences(UUID id){jdbc.update("DELETE FROM promotion_product WHERE promotion_id=?",id);jdbc.update("DELETE FROM catalogue_promotion_taxonomy WHERE promotion_id=?",id);jdbc.update("DELETE FROM promotion_buyer WHERE promotion_id=?",id);}
 private void history(UUID actor,Item item,String action){jdbc.update("INSERT INTO promotion_history(promotion_id,revision,actor_id,snapshot,occurred_at) VALUES (?,?,?,?::jsonb,?)",item.id(),item.revision(),actor,JSON.writeValueAsString(item),time(item.updatedAt()));audit.promotion(actor,item.id(),action);}
 private Creation replay(UUID actor,UUID vendor,UUID id,byte[] digest){get(vendor,id);var rows=jdbc.queryForList("SELECT * FROM promotion_creation WHERE promotion_id=? AND vendor_id=?",id,vendor);if(rows.isEmpty()||!actor.equals(rows.getFirst().get("creator_id"))){throw fail(PromotionFailure.Reason.NOT_FOUND,null,null);}var row=rows.getFirst();if(!java.security.MessageDigest.isEqual(digest,(byte[])row.get("payload_hash"))){throw fail(PromotionFailure.Reason.IDEMPOTENCY_MISMATCH,null,id);}if(!now().isBefore(((Timestamp)row.get("expires_at")).toInstant())){throw fail(PromotionFailure.Reason.REPLAY_EXPIRED,null,id);}return new Creation(JSON.readValue(row.get("original_snapshot").toString(),Item.class),true);}
 private boolean exists(UUID id){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM catalogue_promotion_identity WHERE id=?)",Boolean.class,id));}
 private void guard(UUID vendor){jdbc.queryForList("SELECT id FROM organization WHERE id=? FOR UPDATE",UUID.class,vendor);}
 private static void validate(Values v){if(v.value()==null||v.value().scale()>2||v.value().signum()<0||v.value().compareTo(new BigDecimal("999999999.99"))>0||v.kind()==Kind.PERCENTAGE&&(v.value().signum()==0||v.value().compareTo(new BigDecimal("100"))>0)){throw fail(PromotionFailure.Reason.INVALID_VALUE,"/value",null);}if(!v.endsAt().isAfter(v.startsAt())||Duration.between(v.startsAt(),v.endsAt()).compareTo(Duration.ofDays(366))>0){throw fail(PromotionFailure.Reason.INVALID_VALUE,"/endsAt",null);}selection(v.productMode(),v.productIds(),v.categoryIds(),"/productMode");selection(v.buyerMode(),v.buyerIds(),List.of(),"/buyerMode");}
 private static void selection(Mode mode,List<UUID> first,List<UUID> second,String field){if(first.size()>1000||second.size()>1000||new HashSet<>(first).size()!=first.size()||new HashSet<>(second).size()!=second.size()||(mode==Mode.ALL?(!first.isEmpty()||!second.isEmpty()):(first.isEmpty()&&second.isEmpty()))){throw fail(PromotionFailure.Reason.INVALID_VALUE,field,null);}}
 private static void future(Values v,Instant at){if(!v.startsAt().isAfter(at)){throw fail(PromotionFailure.Reason.INVALID_VALUE,"/startsAt",null);}}
 private static Item map(Map<String,Object> row,Instant at){var v=JSON.readValue(row.get("definition").toString(),Values.class);boolean stopped=row.get("stopped_at")!=null;String state=stopped?"STOPPED":at.isBefore(v.startsAt())?"SCHEDULED":!at.isBefore(v.endsAt())?"ENDED":"RUNNING";return new Item((UUID)row.get("id"),((Number)row.get("revision")).longValue(),v,JSON.readValue(row.get("target_labels").toString(),Labels.class),state,(Boolean)row.get("archived"),((Timestamp)row.get("created_at")).toInstant(),((Timestamp)row.get("updated_at")).toInstant());}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private static Timestamp time(Instant instant){return Timestamp.from(instant);}
 private static PromotionFailure fail(PromotionFailure.Reason reason,String field,UUID id){return new PromotionFailure(reason,field,id);}

 @Override public Map<UUID,List<Item>> savingCandidatesMany(UUID vendor,UUID buyer,Map<UUID,BigDecimal> resolved,Instant at){
  if(resolved.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");if(resolved.isEmpty())return Map.of();
  for(var amount:resolved.values())if(amount==null||amount.signum()<0||amount.scale()>2||amount.compareTo(new BigDecimal("999999999.99"))>0)throw fail(PromotionFailure.Reason.INVALID_VALUE,"/resolvedUnitPrice",null);
  var relation=trading.find(vendor,buyer);if(relation.isEmpty()||!relation.get().state().equals("ACTIVE"))throw fail(PromotionFailure.Reason.NOT_FOUND,null,null);
  var selected=products.findMany(vendor,resolved.keySet());if(selected.size()!=resolved.size())throw new ProductFailure(ProductFailure.Reason.NOT_FOUND,null,null);
  var candidates=jdbc.queryForList("SELECT * FROM promotion WHERE vendor_id=? AND NOT archived AND stopped_at IS NULL AND starts_at<=? AND ends_at>? ORDER BY created_at ASC,id ASC",vendor,time(at),time(at)).stream().map(row->map(row,at)).filter(item->item.values().buyerMode()!=Mode.SELECTED||item.values().buyerIds().contains(buyer)).toList();
  var result=new LinkedHashMap<UUID,List<Item>>();
  for(var entry:resolved.entrySet()){
   UUID product=entry.getKey();var details=selected.get(product);var matches=new ArrayList<Item>();
   for(var item:candidates){var v=item.values();if(v.productMode()==Mode.SELECTED&&!v.productIds().contains(product)&&!v.categoryIds().contains(details.values().categoryId()))continue;if(discounted(entry.getValue(),item).compareTo(entry.getValue())<0)matches.add(item);}
   result.put(product,List.copyOf(matches));
  }
  return Map.copyOf(result);
 }
}
