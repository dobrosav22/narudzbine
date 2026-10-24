package com.narudzbine.notifications.api;
public final class InboxFailure extends RuntimeException {
 private final String code;
 public InboxFailure(String code){super("Inbox operation could not be completed");this.code=code;}
 public String code(){return code;}
}
