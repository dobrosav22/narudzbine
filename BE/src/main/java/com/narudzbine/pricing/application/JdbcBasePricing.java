package com.narudzbine.pricing.application;

import com.narudzbine.pricing.api.*;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.audit.api.PricingAudit;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcBasePricing implements BasePricing,ProductPricingPolicy {
 private static final BigDecimal MAX=new BigDecimal("999999999.99");
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final JdbcTemplate jdbc;private final ProductPricingContext context;private final PricingAudit audit;private final Clock clock;
 public JdbcBasePricing(JdbcTemplate jdbc,ProductPricingContext context,PricingAudit audit,Clock clock){this.jdbc=jdbc;this.context=context;this.audit=audit;this.clock=clock;}
 @Override public Item read(UUID vendor,UUID product){readGuard(vendor);var rules=context.require(vendor,product);var row=jdbc.queryForMap("SELECT base_price,revision FROM product_pricing WHERE product_id=?",product);var tiers=jdbc.query("SELECT minimum_quantity,unit_price FROM product_volume_tier WHERE product_id=? ORDER BY minimum_quantity",(r,n)->new Tier(r.getInt(1),r.getBigDecimal(2).setScale(2)),product);BigDecimal base=(BigDecimal)row.get("base_price");return new Item(product,((Number)row.get("revision")).longValue(),new Values(base==null?null:base.setScale(2),tiers),rules.currency());}
 @Override public Item replace(UUID actor,UUID vendor,UUID product,long expected,Values supplied,Integer proposedMinimum,Integer proposedStep,boolean publicationChanged){
  jdbc.query("SELECT id FROM organization WHERE id=? FOR UPDATE",(r,n)->r.getObject(1,UUID.class),vendor);
  var rules=context.require(vendor,product);var current=read(vendor,product);
  if(current.revision()!=expected){throw new PricingFailure(PricingFailure.Reason.REVISION_CONFLICT,List.of(),product,current.revision());}
  if((proposedMinimum==null)!=(proposedStep==null)){throw new IllegalArgumentException("Incomplete proposed rules");}
  int minimum=proposedMinimum==null?rules.minimum():proposedMinimum,step=proposedStep==null?rules.step():proposedStep;
  var values=normalize(supplied);validate(values,minimum,step);
  if(values.basePrice()==null&&rules.state().equals("ACTIVE")){throw new ProductFailure(ProductFailure.Reason.DEACTIVATION_REQUIRED,null,null);}
  if(current.values().equals(values)&&!publicationChanged){return current;}
  var fields=new ArrayList<PricingAudit.Field>();if(!Objects.equals(current.values().basePrice(),values.basePrice())){fields.add(PricingAudit.Field.basePrice);}if(!current.values().tiers().equals(values.tiers())){fields.add(PricingAudit.Field.tiers);}
  jdbc.update("DELETE FROM product_volume_tier WHERE product_id=?",product);
  jdbc.update("UPDATE product_pricing SET base_price=?,revision=revision+1 WHERE product_id=?",values.basePrice(),product);
  for(var tier:values.tiers()){jdbc.update("INSERT INTO product_volume_tier(product_id,minimum_quantity,unit_price) VALUES (?,?,?)",product,tier.minimumQuantity(),tier.unitPrice());}
  long revision=Math.addExact(current.revision(),1);
  jdbc.update("INSERT INTO product_pricing_history(product_id,revision,actor_id,base_price,tiers,occurred_at) VALUES (?,?,?,?,?::jsonb,?)",product,revision,actor,values.basePrice(),JSON.writeValueAsString(values.tiers()),Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)));
  if(!fields.isEmpty()){audit.pricing(actor,product,List.copyOf(fields));}return new Item(product,revision,values,rules.currency());
 }
 @Override public Optional<Item> replayDeactivation(UUID actor,UUID vendor,UUID product,byte[] identity){context.require(vendor,product);var rows=jdbc.queryForList("SELECT * FROM pricing_deactivation_replay WHERE actor_id=? AND product_id=? AND identity_hash=?",actor,product,identity);if(rows.isEmpty()){return Optional.empty();}var row=rows.getFirst();if(!clock.instant().isBefore(((Timestamp)row.get("expires_at")).toInstant())){throw new ProductFailure(ProductFailure.Reason.REPLAY_EXPIRED,null,product);}return Optional.of(JSON.readValue(row.get("original_result").toString(),Item.class));}
 @Override public void rememberDeactivation(UUID actor,UUID vendor,UUID product,byte[] identity,Item result){context.require(vendor,product);jdbc.update("INSERT INTO pricing_deactivation_replay(actor_id,product_id,identity_hash,original_result,expires_at) VALUES (?,?,?,?::jsonb,?)",actor,product,identity,JSON.writeValueAsString(result),Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS).plus(7,ChronoUnit.DAYS)));}
 @Override public void compactExpiredDeactivations(){jdbc.update("WITH expired AS (SELECT actor_id,product_id,identity_hash FROM pricing_deactivation_replay WHERE original_result IS NOT NULL AND expires_at<=? ORDER BY expires_at,actor_id,product_id,identity_hash LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE pricing_deactivation_replay p SET original_result=NULL FROM expired e WHERE p.actor_id=e.actor_id AND p.product_id=e.product_id AND p.identity_hash=e.identity_hash",Timestamp.from(clock.instant()));}
 @Override public void requireActivationPrice(UUID vendor,UUID product){if(read(vendor,product).values().basePrice()==null){throw new ProductFailure(ProductFailure.Reason.BASE_PRICE_REQUIRED,null,null);}}
 @Override public void requireCompatible(UUID vendor,UUID product,int minimum,int step){try{validate(read(vendor,product).values(),minimum,step);}catch(PricingFailure failure){throw new PricingFailure(PricingFailure.Reason.QUANTITY_RULE_CONFLICT,List.of(),product,null);}}
 @Override public BigDecimal ordinaryUnitPrice(UUID vendor,UUID product,int quantity){readGuard(vendor);var rules=context.require(vendor,product);if(quantity<rules.minimum()||quantity>1000000000||(quantity-rules.minimum())%rules.step()!=0){throw new PricingFailure(PricingFailure.Reason.INVALID_QUANTITY,List.of(),product,null);}var current=read(vendor,product);if(current.values().basePrice()==null){throw new PricingFailure(PricingFailure.Reason.BASE_PRICE_REQUIRED,List.of(),product,null);}BigDecimal price=current.values().basePrice();for(var tier:current.values().tiers()){if(quantity<tier.minimumQuantity()){break;}price=tier.unitPrice();}return price;}
 private void readGuard(UUID vendor){jdbc.query("SELECT id FROM organization WHERE id=? FOR SHARE",(r,n)->r.getObject(1,UUID.class),vendor);}
 private static Values normalize(Values supplied){BigDecimal base=amount(supplied.basePrice(),"/basePrice");var tiers=supplied.tiers().stream().map(t->new Tier(t.minimumQuantity(),amount(t.unitPrice(),"/tiers"))).sorted(Comparator.comparingInt(Tier::minimumQuantity)).toList();return new Values(base,tiers);}
 private static BigDecimal amount(BigDecimal value,String field){if(value==null){return null;}if(value.signum()<=0||value.compareTo(MAX)>0||value.scale()>2){throw invalid(field);}return value.setScale(2);}
 private static void validate(Values values,int minimum,int step){
  if(minimum<1||minimum>1000000000||step<1||step>1000000000||values.tiers().size()>50){throw invalid("/tiers");}
  BigDecimal previous=values.basePrice();int last=minimum;
  for(int i=0;i<values.tiers().size();i++){var tier=values.tiers().get(i);if(previous==null||tier.minimumQuantity()<=last||tier.minimumQuantity()>1000000000||(tier.minimumQuantity()-minimum)%step!=0||tier.unitPrice()==null||tier.unitPrice().signum()<=0||tier.unitPrice().compareTo(previous)>=0){throw invalid("/tiers");}last=tier.minimumQuantity();previous=tier.unitPrice();}
 }
 private static PricingFailure invalid(String field){return new PricingFailure(PricingFailure.Reason.INVALID_SCHEDULE,List.of(field),null,null);}

 @Override public Map<UUID,Item> readMany(UUID vendor,Collection<UUID> supplied){
  if(supplied.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var selected=supplied.stream().distinct().toList();if(selected.isEmpty())return Map.of();readGuard(vendor);
  var rules=context.requireMany(vendor,selected);String in=String.join(",",Collections.nCopies(selected.size(),"?"));
  var tiers=new HashMap<UUID,List<Tier>>();
  jdbc.query("SELECT product_id,minimum_quantity,unit_price FROM product_volume_tier WHERE product_id IN ("+in+") ORDER BY product_id,minimum_quantity",(org.springframework.jdbc.core.RowCallbackHandler)r->tiers.computeIfAbsent(r.getObject(1,UUID.class),id->new ArrayList<>()).add(new Tier(r.getInt(2),r.getBigDecimal(3).setScale(2))),selected.toArray());
  var result=new LinkedHashMap<UUID,Item>();
  jdbc.query("SELECT product_id,base_price,revision FROM product_pricing WHERE product_id IN ("+in+")",(org.springframework.jdbc.core.RowCallbackHandler)r->{UUID id=r.getObject(1,UUID.class);BigDecimal base=r.getBigDecimal(2);result.put(id,new Item(id,r.getLong(3),new Values(base==null?null:base.setScale(2),tiers.getOrDefault(id,List.of())),rules.get(id).currency()));},selected.toArray());
  if(result.size()!=selected.size())throw new IllegalStateException("Product pricing source missing");return Map.copyOf(result);
 }

 @Override public void initializeImportedBases(UUID actor,UUID vendor,Map<UUID,BigDecimal> prices){
  if(prices.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");if(prices.isEmpty())return;
  jdbc.query("SELECT id FROM organization WHERE id=? FOR UPDATE",(r,n)->r.getObject(1,UUID.class),vendor);var current=readMany(vendor,prices.keySet());
  if(current.values().stream().anyMatch(item->item.revision()!=1||item.values().basePrice()!=null||!item.values().tiers().isEmpty())){for(var row:prices.entrySet()){var old=read(vendor,row.getKey());replace(actor,vendor,row.getKey(),old.revision(),new Values(row.getValue(),List.of()),null,null);}return;}
  var rules=context.requireMany(vendor,prices.keySet());var rows=new ArrayList<Map.Entry<UUID,BigDecimal>>();
  for(var row:prices.entrySet()){var normalized=normalize(new Values(row.getValue(),List.of()));validate(normalized,rules.get(row.getKey()).minimum(),rules.get(row.getKey()).step());rows.add(Map.entry(row.getKey(),normalized.basePrice()));}
  jdbc.batchUpdate("UPDATE product_pricing SET base_price=?,revision=revision+1 WHERE product_id=?",rows,1000,(q,row)->{q.setBigDecimal(1,row.getValue());q.setObject(2,row.getKey());});
  var at=Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));jdbc.batchUpdate("INSERT INTO product_pricing_history(product_id,revision,actor_id,base_price,tiers,occurred_at) VALUES(?,2,?,?,?::jsonb,?)",rows,1000,(q,row)->{q.setObject(1,row.getKey());q.setObject(2,actor);q.setBigDecimal(3,row.getValue());q.setString(4,"[]");q.setTimestamp(5,at);});
  for(var row:rows)audit.pricing(actor,row.getKey(),List.of(PricingAudit.Field.basePrice));
 }
 @Override public void requireActivationMany(UUID vendor,List<UUID> ids){for(var item:readMany(vendor,ids).values())if(item.values().basePrice()==null)throw new ProductFailure(ProductFailure.Reason.BASE_PRICE_REQUIRED,null,null);}
}
