package com.narudzbine.inventory.application;
import com.narudzbine.inventory.api.*;
import com.narudzbine.catalogue.api.ProductPricingContext;
import com.narudzbine.audit.api.InventoryAudit;
import com.narudzbine.shared.api.UuidGenerator;
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
public class JdbcVendorInventory implements VendorInventory,BuyerStockAvailability,ReviewStock,com.narudzbine.catalogue.api.ProductStockPolicy {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final JdbcTemplate jdbc;private final ProductPricingContext products;private final InventoryAudit audit;private final Clock clock;private final UuidGenerator ids;
 public JdbcVendorInventory(JdbcTemplate jdbc,ProductPricingContext products,InventoryAudit audit,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.products=products;this.audit=audit;this.clock=clock;this.ids=ids;}
 public boolean importTracking(UUID vendor){return jdbc.queryForObject("SELECT enabled FROM inventory_control WHERE vendor_id=? FOR UPDATE",Boolean.class,vendor);}
 public void requireActivationStock(UUID vendor,UUID product){var item=get(vendor,product);if(item.trackingEnabled()&&item.confirmationRequired()){throw new com.narudzbine.catalogue.api.ProductFailure(com.narudzbine.catalogue.api.ProductFailure.Reason.STOCK_CONFIRMATION_REQUIRED,null,null);}}
 public ReviewStock.Status eligibility(UUID vendor,UUID product,int quantity){if(quantity<1||quantity>1000000000){throw new IllegalArgumentException("Invalid review quantity");}var item=get(vendor,product);if(!item.trackingEnabled()){return ReviewStock.Status.READY;}if(item.confirmationRequired()){return ReviewStock.Status.CONFIRMATION_REQUIRED;}return item.availableCount()<quantity?ReviewStock.Status.INSUFFICIENT:ReviewStock.Status.READY;}
 public Availability forOffer(UUID vendor,UUID product){var item=get(vendor,product);return new Availability(item.trackingEnabled(),item.trackingEnabled()&&!item.confirmationRequired()?item.availableCount():null);}
 public Tracking tracking(UUID vendor){var rows=jdbc.queryForList("SELECT * FROM inventory_control WHERE vendor_id=?",vendor);if(rows.isEmpty()){throw fail(InventoryFailure.Reason.NOT_FOUND,null);}var r=rows.getFirst();return new Tracking(vendor,number(r,"revision"),(Boolean)r.get("enabled"),number(r,"confirmation_epoch"),number(r,"generation"));}
 public Item get(UUID vendor,UUID product){products.require(vendor,product);var c=tracking(vendor);var r=jdbc.queryForMap("SELECT * FROM stock_balance WHERE product_id=? AND vendor_id=?",product,vendor);Integer count=(Integer)r.get("available_count");long credit=number(r,"credit_quantity");return new Item(product,number(r,"revision"),count,c.enabled(),count==null||number(r,"confirmed_epoch")!=c.epoch(),credit,1000000000L-credit,c.epoch(),vendor);}
 public Item set(UUID actor,UUID vendor,UUID product,int count,String reason){guard(vendor);var old=get(vendor,product);bounds(count,old,"/availableCount");if(Objects.equals(old.availableCount(),count)){return old;}return change(actor,old,count,reason,old.availableCount()==null?"INITIALIZED":"SET");}
 public Item adjust(UUID actor,UUID vendor,UUID product,int delta,String reason){guard(vendor);var old=get(vendor,product);if(old.availableCount()==null){throw fail(InventoryFailure.Reason.COUNT_REQUIRED,null);}if(delta<-1000000000||delta>1000000000){throw fail(InventoryFailure.Reason.INVALID_COUNT,"/delta");}long count=(long)old.availableCount()+delta;bounds(count,old,"/delta");if(delta==0){return old;}return change(actor,old,(int)count,reason,"ADJUSTED");}
 public Item confirm(UUID actor,UUID vendor,UUID product){guard(vendor);var old=get(vendor,product);if(old.availableCount()==null){throw fail(InventoryFailure.Reason.COUNT_REQUIRED,null);}if(!old.confirmationRequired()){return old;}return change(actor,old,old.availableCount(),null,"CONFIRMED");}
 private Item change(UUID actor,Item old,int count,String reason,String type){jdbc.update("UPDATE stock_balance SET available_count=?,confirmed_epoch=?,revision=revision+1 WHERE product_id=?",count,old.epoch(),old.productId());int delta=count-(old.availableCount()==null?0:old.availableCount());jdbc.update("INSERT INTO stock_event(id,vendor_id,product_id,type,before_count,after_count,delta,reason,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",ids.next(),old.vendor(),old.productId(),type,old.availableCount(),count,delta,reason,actor,time(now()));audit.stock(actor,old.productId(),type);return get(old.vendor(),old.productId());}
 public Page events(UUID vendor,UUID product,int size,Instant after,UUID afterId){if(product!=null){products.require(vendor,product);}var rows=jdbc.query("SELECT * FROM stock_event WHERE vendor_id=? AND (?::uuid IS NULL OR product_id=?) AND (?::timestamptz IS NULL OR (created_at,id)>(?,?)) ORDER BY created_at ASC,id ASC LIMIT ?",(r,n)->new Event(r.getObject("id",UUID.class),r.getObject("product_id",UUID.class),r.getString("type"),(Integer)r.getObject("before_count"),r.getInt("after_count"),r.getInt("delta"),r.getString("reason"),r.getString("type").equals("ORDER_DEDUCTED")?null:r.getObject("actor_id",UUID.class),r.getObject("order_id",UUID.class),r.getTimestamp("created_at").toInstant()),vendor,product,product,after==null?null:time(after),after==null?null:time(after),afterId,size+1);return new Page(rows.stream().limit(size).toList(),rows.size()>size);}
 public void lockReplay(UUID actor,String operation,byte[] identity){byte[] hash;try{var digest=java.security.MessageDigest.getInstance("SHA-256");digest.update(actor.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII));digest.update(operation.getBytes(java.nio.charset.StandardCharsets.US_ASCII));hash=digest.digest(identity);}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}long lock=java.nio.ByteBuffer.wrap(hash).getLong();if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(?)",Boolean.class,lock))){throw fail(InventoryFailure.Reason.REQUEST_IN_PROGRESS,null);}}
 public Optional<Receipt> replay(UUID actor,UUID vendor,UUID product,String operation,byte[] identity,byte[] digest){get(vendor,product);var rows=jdbc.queryForList("SELECT * FROM stock_replay WHERE actor_id=? AND operation=? AND identity_hash=?",actor,operation,identity);if(rows.isEmpty()){return Optional.empty();}var r=rows.getFirst();if(!vendor.equals(r.get("vendor_id"))||!product.equals(r.get("product_id"))||!java.security.MessageDigest.isEqual(digest,(byte[])r.get("payload_hash"))){throw fail(InventoryFailure.Reason.IDEMPOTENCY_MISMATCH,null);}if(!now().isBefore(((Timestamp)r.get("expires_at")).toInstant())){throw fail(InventoryFailure.Reason.REPLAY_EXPIRED,null);}return Optional.of(new Receipt(JSON.readValue(r.get("original_result").toString(),Item.class),(String)r.get("original_revision")));}
 public void remember(UUID actor,String operation,byte[] identity,byte[] digest,Item result,String originalRevision){jdbc.update("INSERT INTO stock_replay(actor_id,operation,identity_hash,vendor_id,product_id,payload_hash,original_result,expires_at,original_revision) VALUES (?,?,?,?,?,?,?::jsonb,?,?)",actor,operation,identity,result.vendor(),result.productId(),digest,JSON.writeValueAsString(result),time(now().plus(7,ChronoUnit.DAYS)),originalRevision);}
 public void compactExpiredReplay(){jdbc.update("WITH expired AS (SELECT actor_id,operation,identity_hash FROM stock_replay WHERE original_result IS NOT NULL AND expires_at<=? ORDER BY expires_at,actor_id,operation,identity_hash LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE stock_replay p SET original_result=NULL FROM expired e WHERE p.actor_id=e.actor_id AND p.operation=e.operation AND p.identity_hash=e.identity_hash",time(now()));}
 private void guard(UUID vendor){jdbc.queryForList("SELECT id FROM organization WHERE id=? FOR UPDATE",UUID.class,vendor);}
 private static long number(Map<String,Object> r,String field){return ((Number)r.get(field)).longValue();}
 private static void bounds(long count,Item old,String field){if(count<0||count>old.maximumSettableCount()){throw fail(InventoryFailure.Reason.INVALID_COUNT,field);}}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}
 private static Timestamp time(Instant at){return Timestamp.from(at);}
 private static InventoryFailure fail(InventoryFailure.Reason reason,String field){return new InventoryFailure(reason,field);}

 public Map<UUID,ReviewStock.Status> eligibilityMany(UUID vendor,Map<UUID,Integer> quantities){
  if(quantities.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  for(int quantity:quantities.values())if(quantity<1||quantity>1000000000)throw new IllegalArgumentException("Invalid review quantity");
  var items=batchItems(vendor,quantities.keySet());var result=new LinkedHashMap<UUID,ReviewStock.Status>();
  quantities.forEach((id,quantity)->{var item=items.get(id);result.put(id,!item.trackingEnabled()?ReviewStock.Status.READY:item.confirmationRequired()?ReviewStock.Status.CONFIRMATION_REQUIRED:item.availableCount()<quantity?ReviewStock.Status.INSUFFICIENT:ReviewStock.Status.READY);});return Map.copyOf(result);
 }
 public Map<UUID,Availability> forOffers(UUID vendor,Collection<UUID> selected){
  var result=new LinkedHashMap<UUID,Availability>();batchItems(vendor,selected).forEach((id,item)->result.put(id,new Availability(item.trackingEnabled(),item.trackingEnabled()&&!item.confirmationRequired()?item.availableCount():null)));return Map.copyOf(result);
 }
 private Map<UUID,Item> batchItems(UUID vendor,Collection<UUID> supplied){
  if(supplied.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");var selected=supplied.stream().distinct().toList();if(selected.isEmpty())return Map.of();
  products.requireMany(vendor,selected);var control=tracking(vendor);var args=new ArrayList<Object>();args.add(vendor);args.addAll(selected);var result=new LinkedHashMap<UUID,Item>();
  jdbc.query("SELECT product_id,revision,available_count,credit_quantity,confirmed_epoch FROM stock_balance WHERE vendor_id=? AND product_id IN ("+String.join(",",Collections.nCopies(selected.size(),"?"))+")",(org.springframework.jdbc.core.RowCallbackHandler)row->{UUID id=row.getObject(1,UUID.class);Integer count=(Integer)row.getObject(3);long credit=row.getLong(4);result.put(id,new Item(id,row.getLong(2),count,control.enabled(),count==null||row.getLong(5)!=control.epoch(),credit,1000000000L-credit,control.epoch(),vendor));},args.toArray());
  if(result.size()!=selected.size())throw new IllegalStateException("Product stock source missing");return Map.copyOf(result);
 }
 public void requireActivationMany(UUID vendor,List<UUID> ids){for(var item:batchItems(vendor,ids).values())if(item.trackingEnabled()&&item.confirmationRequired())throw new com.narudzbine.catalogue.api.ProductFailure(com.narudzbine.catalogue.api.ProductFailure.Reason.STOCK_CONFIRMATION_REQUIRED,null,null);}
}
