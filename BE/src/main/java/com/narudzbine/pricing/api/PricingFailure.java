package com.narudzbine.pricing.api;
import java.util.List;
import java.util.UUID;
public final class PricingFailure extends RuntimeException {
 public enum Reason{INVALID_SCHEDULE,REVISION_CONFLICT,BASE_PRICE_REQUIRED,INVALID_QUANTITY,QUANTITY_RULE_CONFLICT}
 private final Reason reason;private final List<String> fields;private final UUID product;private final Long revision;
 public PricingFailure(Reason reason,List<String> fields,UUID product,Long revision){super(reason.name());this.reason=reason;this.fields=List.copyOf(fields);this.product=product;this.revision=revision;}
 public Reason reason(){return reason;}public List<String> fields(){return fields;}public UUID product(){return product;}public Long revision(){return revision;}
}
