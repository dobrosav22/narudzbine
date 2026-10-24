package com.narudzbine.reporting.application;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.math.BigDecimal;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;

/** Typed decoding of known stored snapshots followed by an explicit customer projection. */
final class PortableSnapshots {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private PortableSnapshots(){}
 private static String money(BigDecimal value){return PortableRows.money(value);}
 private static String time(Instant value){return value==null?null:new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter().format(value);}
 record Tier(int minimumQuantity,String unitPrice){}
 record StoredTier(int minimumQuantity,BigDecimal unitPrice){}
 record Pricing(UUID productId,long revision,String basePrice,List<Tier> tiers){}
 record PricingHistory(UUID productId,long revision,UUID actorId,String basePrice,List<Tier> tiers,String occurredAt){}
 private static List<Tier> tiers(String json){return Arrays.stream(JSON.readValue(json,StoredTier[].class)).map(t->new Tier(t.minimumQuantity(),money(t.unitPrice()))).toList();}
 static Pricing pricing(ResultSet r)throws SQLException{return new Pricing(r.getObject("product_id",UUID.class),r.getLong("revision"),money(r.getBigDecimal("base_price")),tiers(r.getString("tiers")));}
 static PricingHistory pricingHistory(ResultSet r)throws SQLException{return new PricingHistory(r.getObject("product_id",UUID.class),r.getLong("revision"),r.getObject("actor_id",UUID.class),money(r.getBigDecimal("base_price")),tiers(r.getString("tiers")),PortableRows.time(r.getTimestamp("occurred_at")));}
 record PromotionValues(String name,String kind,String value,String productMode,List<UUID> productIds,List<UUID> categoryIds,String buyerMode,List<UUID> buyerIds,String startsAt,String endsAt){}
 record StoredPromotionValues(String name,String kind,BigDecimal value,String productMode,List<UUID> productIds,List<UUID> categoryIds,String buyerMode,List<UUID> buyerIds,Instant startsAt,Instant endsAt){}
 record Label(UUID id,String name){}
 record Labels(List<Label> products,List<Label> categories,List<Label> buyers){}
 record Promotion(UUID id,long revision,PromotionValues values,Labels labels,String state,boolean archived,String createdAt,String updatedAt){}
 record StoredPromotion(UUID id,long revision,StoredPromotionValues values,Labels labels,String state,boolean archived,Instant createdAt,Instant updatedAt){}
 record PromotionHistory(UUID promotionId,long revision,UUID actorId,Promotion snapshot,String occurredAt){}
 private static PromotionValues values(StoredPromotionValues v){return new PromotionValues(v.name(),v.kind(),money(v.value()),v.productMode(),v.productIds(),v.categoryIds(),v.buyerMode(),v.buyerIds(),time(v.startsAt()),time(v.endsAt()));}
 static Promotion promotion(ResultSet r,Instant at)throws SQLException{var v=JSON.readValue(r.getString("definition"),StoredPromotionValues.class);String state=r.getTimestamp("stopped_at")!=null?"STOPPED":at.isBefore(v.startsAt())?"SCHEDULED":!at.isBefore(v.endsAt())?"ENDED":"RUNNING";return new Promotion(r.getObject("id",UUID.class),r.getLong("revision"),values(v),JSON.readValue(r.getString("target_labels"),Labels.class),state,r.getBoolean("archived"),PortableRows.time(r.getTimestamp("created_at")),PortableRows.time(r.getTimestamp("updated_at")));}
 static PromotionHistory promotionHistory(ResultSet r)throws SQLException{var v=JSON.readValue(r.getString("snapshot"),StoredPromotion.class);var p=new Promotion(v.id(),v.revision(),values(v.values()),v.labels(),v.state(),v.archived(),time(v.createdAt()),time(v.updatedAt()));return new PromotionHistory(r.getObject("promotion_id",UUID.class),r.getLong("revision"),r.getObject("actor_id",UUID.class),p,PortableRows.time(r.getTimestamp("occurred_at")));}
 record Contact(String name,String phone,String email){}
 record Preparation(UUID deliveryLocationId,Contact contactOverride,String instructionsOverride,String note,UUID replacementForOrderId,String instructionsMode){}
 record DraftLine(UUID productId,int quantity){}
 record Draft(UUID id,UUID vendorId,long revision,Preparation preparation,List<DraftLine> lines,String state,UUID submittedOrderId,String createdAt,String updatedAt){}
 static Draft draft(ResultSet r)throws SQLException{return new Draft(r.getObject("id",UUID.class),r.getObject("vendor_id",UUID.class),r.getLong("revision"),JSON.readValue(r.getString("preparation"),Preparation.class),List.of(JSON.readValue(r.getString("lines"),DraftLine[].class)),r.getString("state"),r.getObject("submitted_order_id",UUID.class),PortableRows.time(r.getTimestamp("created_at")),PortableRows.time(r.getTimestamp("updated_at")));}
 record Address(String line1,String line2,String city,String postalCode,String country,BigDecimal latitude,BigDecimal longitude){}
 record Party(UUID organizationId,String displayName,String legalName,String country,String registrationIdentifier,String taxIdentifier,Address registeredAddress){}
 record AppliedPromotion(UUID id,String name,String kind,String value){}
 record Price(String baseUnitPrice,String normalUnitPrice,String agreedUnitPrice,UUID promotionId,String finalUnitPrice,String lineTotal,AppliedPromotion appliedPromotion,Integer reachedTierThreshold,UUID agreedPriceId){}
 record Line(UUID productId,String sku,String name,String unitName,String packDescription,int quantity,Price price){}
 record StoredAppliedPromotion(UUID id,String name,String kind,BigDecimal value){}
 record StoredPrice(BigDecimal baseUnitPrice,BigDecimal normalUnitPrice,BigDecimal agreedUnitPrice,UUID promotionId,BigDecimal finalUnitPrice,BigDecimal lineTotal,StoredAppliedPromotion appliedPromotion,Integer reachedTierThreshold,UUID agreedPriceId){}
 record StoredLine(UUID productId,String sku,String name,String unitName,String packDescription,int quantity,StoredPrice price){}
 @JsonIgnoreProperties(ignoreUnknown=true) record StoredIntent(String note,UUID replacementForOrderId){}
 @JsonIgnoreProperties(ignoreUnknown=true) record StoredTerms(StoredIntent intent,List<StoredLine> lines,Address deliveryAddress,Contact deliveryContact,String deliveryInstructions,String currency,BigDecimal goodsTotal){}
 record Stage(UUID id,String name){}
 @JsonIgnoreProperties(ignoreUnknown=true) record StoredLocation(UUID id,String name,Address address,Contact contact,String instructions,String state,Instant createdAt,Instant updatedAt){}
 record StoredFulfillment(StoredLocation location,String revision){}
 record Fulfillment(UUID id,String revision,String name,Address address,Contact contact,String instructions,String state,String createdAt,String updatedAt){}
 @JsonIgnoreProperties(ignoreUnknown=true) record StoredOrder(UUID id,long revision,String number,Party vendor,Party buyer,String state,StoredTerms terms,UUID submittedByAccountId,String submittedByDisplayName,Instant submittedAt,StoredFulfillment fulfillment,Instant updatedAt,UUID cancellationRequestId,Stage stage){}
 record Order(UUID id,long revision,String number,Party vendor,Party buyer,String state,UUID stageId,String stageName,List<Line> lines,String currency,String priceBasis,String goodsTotal,Address deliveryAddress,Contact deliveryContact,String deliveryInstructions,Fulfillment fulfillmentLocation,String note,UUID submittedByAccountId,String submittedByDisplayName,UUID replacementForOrderId,UUID cancellationRequestId,String submittedAt,String updatedAt){}
 static Order order(ResultSet r,UUID organization)throws SQLException{
  var o=JSON.readValue(r.getString("snapshot"),StoredOrder.class);var t=o.terms();boolean own=o.buyer().organizationId().equals(organization);
  var lines=t.lines().stream().map(l->{var p=l.price();var a=p.appliedPromotion();return new Line(l.productId(),l.sku(),l.name(),l.unitName(),l.packDescription(),l.quantity(),new Price(money(p.baseUnitPrice()),money(p.normalUnitPrice()),money(p.agreedUnitPrice()),p.promotionId(),money(p.finalUnitPrice()),money(p.lineTotal()),a==null?null:new AppliedPromotion(a.id(),a.name(),a.kind(),money(a.value())),p.reachedTierThreshold(),p.agreedPriceId()));}).toList();
  Fulfillment fulfillment=null;if(o.fulfillment()!=null){var l=o.fulfillment().location();fulfillment=new Fulfillment(l.id(),o.fulfillment().revision(),l.name(),l.address(),l.contact(),l.instructions(),l.state(),time(l.createdAt()),time(l.updatedAt()));}
  return new Order(o.id(),o.revision(),o.number(),o.vendor(),o.buyer(),o.state(),o.stage()==null?null:o.stage().id(),o.stage()==null?null:r.getString("current_stage_name"),lines,t.currency(),"NET_EXCLUDING_VAT",money(t.goodsTotal()),t.deliveryAddress(),t.deliveryContact(),t.deliveryInstructions(),fulfillment,t.intent().note(),own?o.submittedByAccountId():null,own?o.submittedByDisplayName():null,t.intent().replacementForOrderId(),o.cancellationRequestId(),time(o.submittedAt()),time(o.updatedAt()==null?o.submittedAt():o.updatedAt()));
 }
 record Audit(UUID id,UUID actorId,String action,UUID resourceId,UUID requestId,String reason,List<String> changedFields,String occurredAt){}
 static Audit audit(ResultSet r)throws SQLException{var array=r.getArray("changed_fields");try{return new Audit(r.getObject("id",UUID.class),r.getObject("actor_id",UUID.class),r.getString("action"),r.getObject("resource_id",UUID.class),r.getObject("request_id",UUID.class),r.getString("reason"),List.of((String[])array.getArray()),PortableRows.time(r.getTimestamp("occurred_at")));}finally{array.free();}}
 record Preference(UUID accountId,long revision,String languageOverride,String event,boolean inApp,boolean email,boolean push){}
 static Preference preference(ResultSet r)throws SQLException{return new Preference(r.getObject("account_id",UUID.class),r.getLong("revision"),r.getString("language_override"),r.getString("event"),r.getBoolean("in_app"),r.getBoolean("email"),r.getBoolean("push"));}
}
