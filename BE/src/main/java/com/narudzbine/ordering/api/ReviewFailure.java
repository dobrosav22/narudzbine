package com.narudzbine.ordering.api;
public final class ReviewFailure extends RuntimeException {
 public enum Reason {NOT_FOUND,INVALID_STATE,VALIDATION_FAILED,INSUFFICIENT_STOCK,STOCK_CONFIRMATION_REQUIRED,REVIEW_EXPIRED}
 private final Reason reason;private final String field;
 public ReviewFailure(Reason reason,String field){super("Order review could not be completed.");this.reason=reason;this.field=field;}
 public Reason reason(){return reason;}public String field(){return field;}
}
