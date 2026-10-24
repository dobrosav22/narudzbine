package com.narudzbine.pricing.api;
public final class AgreedPriceFailure extends RuntimeException {
 public enum Reason { NOT_FOUND,REVISION_CONFLICT,INVALID_STATE,INVALID_SELECTION,INVALID_PRICE }
 private final Reason reason;
 public AgreedPriceFailure(Reason reason){super("Agreed price action could not be completed.");this.reason=reason;}
 public Reason reason(){return reason;}
}
