package com.narudzbine.trading.api;
public final class TradingFailure extends RuntimeException {
    public enum Reason { NOT_FOUND,PLAN_REQUIRED,PLAN_LIMIT_EXCEEDED,INVALID_STATE,ALREADY_CONNECTED }
    private final Reason reason;
    public TradingFailure(Reason reason){super("Trading action could not be completed.");this.reason=reason;}
    public Reason reason(){return reason;}
}
