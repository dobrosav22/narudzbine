package com.narudzbine.subscriptions.api;
public final class PlanFailure extends RuntimeException {
 public enum Reason { NOT_FOUND,PLAN_REQUIRED,PLAN_LIMIT_EXCEEDED,INVALID_STATE,REQUEST_IN_PROGRESS }
 private final Reason reason;
 public PlanFailure(Reason reason){super("Plan action could not be completed.");this.reason=reason;}
 public Reason reason(){return reason;}
}
