package com.narudzbine.ordering.application;
import com.narudzbine.ordering.api.*;
import com.narudzbine.ordering.api.OrderReviews.*;
import com.narudzbine.buyerworkspace.api.SharedDrafts;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.pricing.api.BuyerPricing;
import com.narudzbine.inventory.api.ReviewStock;
import com.narudzbine.organizations.api.*;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.shared.api.UuidGenerator;
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
public class JdbcOrderReviews implements OrderReviews {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private static final BigDecimal MAX_TOTAL=new BigDecimal("9999999999999999999999.99");
 private final JdbcOrderReplacements replacements;private final JdbcTemplate jdbc;private final VendorProducts products;private final VendorTaxonomy taxonomy;private final BuyerPricing pricing;private final ReviewStock stock;private final Locations locations;private final TradingConnections trading;private final SharedDrafts drafts;private final UuidGenerator ids;private final Clock clock;
 public JdbcOrderReviews(JdbcOrderReplacements replacements,JdbcTemplate jdbc,VendorProducts products,VendorTaxonomy taxonomy,BuyerPricing pricing,ReviewStock stock,Locations locations,TradingConnections trading,SharedDrafts drafts,UuidGenerator ids,Clock clock){this.replacements=replacements;this.jdbc=jdbc;this.products=products;this.taxonomy=taxonomy;this.pricing=pricing;this.stock=stock;this.locations=locations;this.trading=trading;this.drafts=drafts;this.ids=ids;this.clock=clock;}
 public Result create(UUID actor,UUID buyer,Country country,Request request,Instant instant){
  Instant at=instant.truncatedTo(ChronoUnit.MILLIS);var intent=request.intent();
  if((request.draftId()==null)!=(request.draftRevision()==null)){throw fail(ReviewFailure.Reason.VALIDATION_FAILED,"/draftRevision");}
  if(request.draftId()!=null){var draft=drafts.read(buyer,request.draftId());if(!draft.state().equals("OPEN")||draft.revision()!=request.draftRevision()){throw fail(ReviewFailure.Reason.INVALID_STATE,null);}if(!draft.intent().equals(intent)){throw fail(ReviewFailure.Reason.VALIDATION_FAILED,"/intent");}}
  var evaluated=evaluate(buyer,country,intent,at);if(!evaluated.issues().isEmpty()){var issue=evaluated.issues().getFirst();throw fail(issue.reason(),issue.path());}return save(actor,buyer,country,request,evaluated,at);
 }
 public Optional<UUID> vendor(UUID buyer,UUID review){return jdbc.query("SELECT vendor_id FROM order_review WHERE buyer_id=? AND id=?",(r,n)->r.getObject(1,UUID.class),buyer,review).stream().findFirst();}
 public Evaluation evaluate(UUID buyer,Country country,SharedDrafts.Intent intent,Instant at){
  UUID vendor=intent.vendorId();var relation=trading.find(vendor,buyer).orElse(null);
  if(relation==null||!relation.state().equals("ACTIVE")||!relation.country().equals(country.name())||trading.findPartner(buyer,vendor).filter(p->p.country().equals(country.name())).isEmpty()){return unavailable(null,"/intent/vendorId","RELATIONSHIP_UNAVAILABLE",ReviewFailure.Reason.NOT_FOUND);}
  var invalidReplacement=replacements.invalid(buyer,vendor,intent.replacementForOrderId());if(invalidReplacement.isPresent()){return unavailable(null,"/intent/replacementForOrderId","REPLACEMENT_UNAVAILABLE",invalidReplacement.get());}
  if(intent.lines().isEmpty()||intent.lines().size()>500||intent.deliveryLocationId()==null){return unavailable(null,"/intent","DELIVERY_UNAVAILABLE",ReviewFailure.Reason.VALIDATION_FAILED);}
  var location=locations.find(buyer,intent.deliveryLocationId()).orElse(null);if(location==null){return unavailable(null,"/intent/deliveryLocationId","DELIVERY_UNAVAILABLE",ReviewFailure.Reason.NOT_FOUND);}if(!location.state().equals("ACTIVE")||location.address().country()!=country){return unavailable(null,"/intent/deliveryLocationId","DELIVERY_UNAVAILABLE",ReviewFailure.Reason.VALIDATION_FAILED);}
  var contact=intent.contactOverride();if(contact==null&&location.contact()!=null){var c=location.contact();contact=new SharedDrafts.Contact(c.name(),c.phone(),c.email());}if(contact==null||contact.name()==null||contact.phone()==null){return unavailable(null,"/intent/contactOverride","DELIVERY_UNAVAILABLE",ReviewFailure.Reason.VALIDATION_FAILED);}
  String instructions=switch(intent.instructionsMode()){case "INHERIT"->location.instructions();case "CLEAR"->null;case "OVERRIDE"->intent.instructionsOverride();default->throw fail(ReviewFailure.Reason.VALIDATION_FAILED,"/intent/instructionsMode");};if(intent.instructionsMode().equals("OVERRIDE")!=(intent.instructionsOverride()!=null)){return unavailable(null,"/intent/instructionsOverride","DELIVERY_UNAVAILABLE",ReviewFailure.Reason.VALIDATION_FAILED);}
  var requestedIds=intent.lines().stream().map(line->line.productId()).distinct().toList();
  var productRows=products.findMany(vendor,requestedIds);var selected=new ArrayList<Selected>();var seen=new HashSet<UUID>();var issues=new TreeMap<Integer,Issue>();
  var quantities=new LinkedHashMap<UUID,Integer>();
  for(int i=0;i<intent.lines().size();i++){
   var line=intent.lines().get(i);String path="/intent/lines/"+i;
   if(!seen.add(line.productId())){issues.put(i,new Issue(line.productId(),path+"/productId","QUANTITY_INVALID",ReviewFailure.Reason.VALIDATION_FAILED));continue;}
   var product=productRows.get(line.productId());
   if(product==null||!product.state().equals("ACTIVE")){issues.put(i,new Issue(line.productId(),path+"/productId","PRODUCT_UNAVAILABLE",ReviewFailure.Reason.NOT_FOUND));continue;}
   var values=product.values();
   if(line.quantity()<values.minimumQuantity()||line.quantity()>1000000000||(line.quantity()-values.minimumQuantity())%values.quantityStep()!=0){issues.put(i,new Issue(line.productId(),path+"/quantity","QUANTITY_INVALID",ReviewFailure.Reason.VALIDATION_FAILED));continue;}
   selected.add(new Selected(i,line,product));quantities.put(line.productId(),line.quantity());
  }
  var statuses=stock.eligibilityMany(vendor,quantities);
  for(var item:selected){var status=Objects.requireNonNull(statuses.get(item.line().productId()));if(status!=ReviewStock.Status.READY)issues.put(item.index(),new Issue(item.line().productId(),"/intent/lines/"+item.index()+"/quantity","STOCK_SHORTAGE",status==ReviewStock.Status.CONFIRMATION_REQUIRED?ReviewFailure.Reason.STOCK_CONFIRMATION_REQUIRED:ReviewFailure.Reason.INSUFFICIENT_STOCK));}
  if(!issues.isEmpty())return new Evaluation(null,List.copyOf(issues.values()),relation.id(),relation.generation());
  var quotes=pricing.resolveMany(vendor,buyer,quantities,at);
  var units=taxonomy.readMany(vendor,VendorTaxonomy.Kind.UNIT,selected.stream().map(item->item.product().values().unitId()).distinct().toList());
  var lines=new ArrayList<Line>();BigDecimal total=new BigDecimal("0.00");String currency=country==Country.RS?"RSD":"BAM";
  for(var item:selected){
   var line=item.line();var values=item.product().values();var quote=Objects.requireNonNull(quotes.get(line.productId()));
   if(!currency.equals(quote.currency()))throw fail(ReviewFailure.Reason.INVALID_STATE,null);
   var promotion=quote.applied();var price=new Price(quote.base(),quote.normal(),quote.agreed(),promotion==null?null:promotion.id(),quote.unitPrice(),quote.lineTotal(),promotion==null?null:new Promotion(promotion.id(),promotion.name(),promotion.kind().name(),promotion.value()),quote.reachedTier(),quote.agreedPriceId());
   lines.add(new Line(line.productId(),values.sku(),values.name(),units.get(values.unitId()).name(),values.packDescription(),line.quantity(),price));total=total.add(quote.lineTotal());
   if(total.compareTo(MAX_TOTAL)>0)return unavailable(null,"/intent/lines","QUANTITY_INVALID",ReviewFailure.Reason.VALIDATION_FAILED);
  }
  var result=new Result(ids.next(),at.plusSeconds(900),intent,lines,location.address(),contact,instructions,currency,total.setScale(2));return new Evaluation(result,List.of(),relation.id(),relation.generation());
 }
 private Evaluation unavailable(UUID product,String path,String code,ReviewFailure.Reason reason){return new Evaluation(null,List.of(new Issue(product,path,code,reason)),null,0);}
 public boolean sameTerms(Receipt receipt,Evaluation current){return current.result()!=null&&receipt.relationshipId().equals(current.relationshipId())&&receipt.relationshipGeneration()==current.relationshipGeneration()&&java.security.MessageDigest.isEqual(receipt.termsHash(),termsHash(current.result()));}
 private byte[] termsHash(Result r){return hash(new Terms(r.intent(),r.lines(),r.deliveryAddress(),r.deliveryContact(),r.deliveryInstructions(),r.currency(),r.goodsTotal()));}
 public Result save(UUID actor,UUID buyer,Country country,Request request,Evaluation evaluated,Instant at){
  if(evaluated.result()==null||!evaluated.issues().isEmpty()){throw new IllegalArgumentException("Cannot persist unavailable review");}
  var result=evaluated.result();var intent=request.intent();UUID vendor=intent.vendorId(),id=result.id();var lines=result.lines();var contact=result.deliveryContact();String instructions=result.deliveryInstructions(),currency=result.currency();BigDecimal total=result.goodsTotal();
  byte[] intentHash=hash(intent),termsHash=termsHash(result);
  jdbc.update("""
   INSERT INTO order_review(id,buyer_id,vendor_id,country,creator_id,relationship_id,relationship_generation,draft_id,draft_revision,intent_hash,terms_hash,original_intent,result,created_at,expires_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?,?)
   """,id,buyer,vendor,country.name(),actor,evaluated.relationshipId(),evaluated.relationshipGeneration(),request.draftId(),request.draftRevision(),intentHash,termsHash,JSON.writeValueAsString(intent),JSON.writeValueAsString(result),Timestamp.from(at),Timestamp.from(result.expiresAt()));return result;
 }
 public Receipt read(UUID buyer,UUID id,Instant at){jdbc.queryForObject("SELECT pg_advisory_xact_lock_shared(hashtextextended('order-review/v1/'||?::text,0))::text",String.class,id);var rows=jdbc.queryForList("SELECT * FROM order_review WHERE buyer_id=? AND id=?",buyer,id);if(rows.isEmpty()){throw fail(ReviewFailure.Reason.NOT_FOUND,null);}var r=rows.getFirst();if(!at.isBefore(((Timestamp)r.get("expires_at")).toInstant())){throw fail(ReviewFailure.Reason.REVIEW_EXPIRED,null);}return new Receipt(buyer,(UUID)r.get("vendor_id"),(UUID)r.get("creator_id"),(UUID)r.get("relationship_id"),((Number)r.get("relationship_generation")).longValue(),(UUID)r.get("draft_id"),(Long)r.get("draft_revision"),((Timestamp)r.get("created_at")).toInstant(),JSON.readValue(r.get("result").toString(),Result.class),(byte[])r.get("terms_hash"));}
 public int purgeExpired(){Instant at=clock.instant().truncatedTo(ChronoUnit.MILLIS);jdbc.queryForObject("SELECT set_config('narudzbine.review_purge_at',?,true)",String.class,at.toString());return jdbc.update("WITH candidates AS MATERIALIZED(SELECT id FROM order_review WHERE expires_at<=? ORDER BY expires_at,id LIMIT 1000) DELETE FROM order_review WHERE id IN(SELECT id FROM candidates WHERE pg_try_advisory_xact_lock(hashtextextended('order-review/v1/'||id::text,0)))",Timestamp.from(at));}
 private static byte[] hash(Object value){try{return java.security.MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(value));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException("Review hashing unavailable.");}}
 private static ReviewFailure fail(ReviewFailure.Reason reason,String field){return new ReviewFailure(reason,field);}
 private record Terms(SharedDrafts.Intent intent,List<Line> lines,OrganizationRecord.Address address,SharedDrafts.Contact contact,String instructions,String currency,BigDecimal total){}
 private record Selected(int index,SharedDrafts.Line line,VendorProducts.Item product){}
}
