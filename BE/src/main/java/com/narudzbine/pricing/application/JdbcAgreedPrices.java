package com.narudzbine.pricing.application;

import com.narudzbine.pricing.api.*;
import com.narudzbine.catalogue.api.ProductPricingContext;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.audit.api.PricingAudit;
import com.narudzbine.shared.api.UuidGenerator;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcAgreedPrices implements AgreedPrices {
 private final JdbcTemplate jdbc;private final TradingConnections trading;private final ProductPricingContext products;private final PricingAudit audit;private final Clock clock;private final UuidGenerator ids;
 public JdbcAgreedPrices(JdbcTemplate jdbc,TradingConnections trading,ProductPricingContext products,PricingAudit audit,Clock clock,UuidGenerator ids){this.jdbc=jdbc;this.trading=trading;this.products=products;this.audit=audit;this.clock=clock;this.ids=ids;}
 private TradingConnections.View relationship(UUID vendor,UUID id){var r=trading.get(vendor,id);if(!r.vendorId().equals(vendor)){throw fail(AgreedPriceFailure.Reason.NOT_FOUND);}return r;}
 @Override public VendorPage listVendor(UUID vendor,int page,int size,boolean total){
  var items=jdbc.query("SELECT p.*,r.buyer_id,r.state,r.connection_generation FROM agreed_price p JOIN trading_relationship r ON r.id=p.relationship_id WHERE r.vendor_id=? AND NOT p.removed ORDER BY p.created_at DESC,p.id ASC LIMIT ? OFFSET ?",(r,n)->new Item(r.getObject("id",UUID.class),r.getLong("revision"),r.getObject("product_id",UUID.class),r.getObject("buyer_id",UUID.class),r.getBigDecimal("unit_price").setScale(2),!r.getString("state").equals("ACTIVE")||r.getLong("confirmed_generation")!=r.getLong("connection_generation")),vendor,size,Math.multiplyExact(page,size));
  Long count=total?jdbc.queryForObject("SELECT count(*) FROM agreed_price p JOIN trading_relationship r ON r.id=p.relationship_id WHERE r.vendor_id=? AND NOT p.removed",Long.class,vendor):null;return new VendorPage(items,count);
 }
 @Override public Page list(UUID vendor,UUID relationship,int page,int size,boolean total){
  var r=relationship(vendor,relationship);
  long revision=jdbc.queryForObject("SELECT revision FROM relationship_pricing WHERE relationship_id=?",Long.class,relationship);
  var items=jdbc.queryForList("SELECT * FROM agreed_price WHERE relationship_id=? AND NOT removed ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?",relationship,size,Math.multiplyExact(page,size)).stream().map(row->map(row,r)).toList();
  Long count=total?jdbc.queryForObject("SELECT count(*) FROM agreed_price WHERE relationship_id=? AND NOT removed",Long.class,relationship):null;return new Page(items,count,revision);
 }
 @Override public Optional<Item> find(UUID vendor,UUID relationship,UUID product){var r=relationship(vendor,relationship);return jdbc.queryForList("SELECT * FROM agreed_price WHERE relationship_id=? AND product_id=? AND NOT removed",relationship,product).stream().map(row->map(row,r)).findFirst();}
 @Override public Item set(UUID actor,UUID vendor,UUID relationship,UUID product,Long expected,BigDecimal amount){
  var r=relationship(vendor,relationship);products.require(vendor,product);
  if(amount==null||amount.signum()<=0||amount.scale()>2||amount.compareTo(new BigDecimal("999999999.99"))>0){throw fail(AgreedPriceFailure.Reason.INVALID_PRICE);}amount=amount.setScale(2);
  var old=find(vendor,relationship,product);if(old.isPresent()?(expected==null||old.get().revision()!=expected):expected!=null){throw fail(AgreedPriceFailure.Reason.REVISION_CONFLICT);}
  long generation=r.state().equals("ACTIVE")?r.generation():0;UUID id;
  if(old.isEmpty()){id=ids.next();jdbc.update("INSERT INTO agreed_price(id,relationship_id,product_id,unit_price,confirmed_generation,created_at) VALUES (?,?,?,?,?,?)",id,relationship,product,amount,generation,now());}
  else{id=old.get().id();long stored=jdbc.queryForObject("SELECT confirmed_generation FROM agreed_price WHERE id=?",Long.class,id);if(old.get().unitPrice().equals(amount)&&stored==generation){return old.get();}jdbc.update("UPDATE agreed_price SET unit_price=?,confirmed_generation=?,revision=revision+1 WHERE id=?",amount,generation,id);}
  history(actor,id);audit.agreedPrice(actor,id,"AGREED_PRICE_SAVED");refresh(vendor,r);return find(vendor,relationship,product).orElseThrow();
 }
 @Override public void remove(UUID actor,UUID vendor,UUID relationship,UUID product,long expected){var r=relationship(vendor,relationship);var item=find(vendor,relationship,product).orElseThrow(()->fail(AgreedPriceFailure.Reason.NOT_FOUND));if(item.revision()!=expected){throw fail(AgreedPriceFailure.Reason.REVISION_CONFLICT);}jdbc.update("UPDATE agreed_price SET removed=true,revision=revision+1 WHERE id=?",item.id());history(actor,item.id());audit.agreedPrice(actor,item.id(),"AGREED_PRICE_REMOVED");refresh(vendor,r);}
 @Override public void confirm(UUID actor,UUID vendor,UUID relationship,long expectedRelationship,long expectedPricing,List<UUID> selected){
  var r=relationship(vendor,relationship);if(!r.state().equals("ACTIVE")){throw fail(AgreedPriceFailure.Reason.INVALID_STATE);}
  long revision=jdbc.queryForObject("SELECT revision FROM relationship_pricing WHERE relationship_id=?",Long.class,relationship);
  if(r.revision()!=expectedRelationship||revision!=expectedPricing){throw fail(AgreedPriceFailure.Reason.REVISION_CONFLICT);}
  if(selected.size()>1000||new HashSet<>(selected).size()!=selected.size()){throw fail(AgreedPriceFailure.Reason.INVALID_SELECTION);}
  var items=new ArrayList<Item>();for(UUID product:selected){items.add(find(vendor,relationship,product).orElseThrow(()->fail(AgreedPriceFailure.Reason.INVALID_SELECTION)));}
  if(items.isEmpty()&&jdbc.queryForObject("SELECT count(*) FROM agreed_price WHERE relationship_id=? AND NOT removed",Long.class,relationship)>0){throw fail(AgreedPriceFailure.Reason.INVALID_SELECTION);}
  for(var item:items){if(item.confirmationRequired()){jdbc.update("UPDATE agreed_price SET confirmed_generation=?,revision=revision+1 WHERE id=?",r.generation(),item.id());history(actor,item.id());audit.agreedPrice(actor,item.id(),"AGREED_PRICE_CONFIRMED");}}
  if(items.isEmpty()&&r.confirmationRequired()){audit.agreedPricesReviewed(actor,relationship);}
  refresh(vendor,r);
 }
 private void refresh(UUID vendor,TradingConnections.View r){if(r.state().equals("ACTIVE")){boolean required=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM agreed_price WHERE relationship_id=? AND NOT removed AND confirmed_generation<>?)",Boolean.class,r.id(),r.generation());trading.updatePriceConfirmation(vendor,r.id(),required);}}
 private void history(UUID actor,UUID id){jdbc.update("INSERT INTO agreed_price_history(price_id,revision,actor_id,unit_price,confirmed_generation,removed,occurred_at) SELECT id,revision,?,unit_price,confirmed_generation,removed,? FROM agreed_price WHERE id=?",actor,now(),id);}
 private Timestamp now(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));}
 private static Item map(Map<String,Object> row,TradingConnections.View r){return new Item((UUID)row.get("id"),((Number)row.get("revision")).longValue(),(UUID)row.get("product_id"),r.buyerId(),((BigDecimal)row.get("unit_price")).setScale(2),!r.state().equals("ACTIVE")||((Number)row.get("confirmed_generation")).longValue()!=r.generation());}
 private static AgreedPriceFailure fail(AgreedPriceFailure.Reason reason){return new AgreedPriceFailure(reason);}

 @Override public Map<UUID,Item> findMany(UUID vendor,UUID relationship,Collection<UUID> supplied){
  if(supplied.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var selected=supplied.stream().distinct().toList();if(selected.isEmpty())return Map.of();var relation=relationship(vendor,relationship);
  var args=new ArrayList<Object>();args.add(relationship);args.addAll(selected);
  var rows=jdbc.queryForList("SELECT * FROM agreed_price WHERE relationship_id=? AND NOT removed AND product_id IN ("+String.join(",",Collections.nCopies(selected.size(),"?"))+")",args.toArray());
  var result=new LinkedHashMap<UUID,Item>();for(var row:rows){var item=map(row,relation);result.put(item.productId(),item);}return Map.copyOf(result);
 }
}
