package com.narudzbine.organizations.api;
public final class OrganizationAdministrationFailure extends RuntimeException {
 private final String code;
 public OrganizationAdministrationFailure(String code){super("Administrative organization request could not be completed");this.code=code;}
 public String code(){return code;}
}
