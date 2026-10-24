package com.narudzbine.organizations.api;
import java.util.*;
public interface AdministrativeOrganizations {
 record Query(int page,int size,boolean total,String country,String type,String state,String query){}
 record Page(List<OrganizationRecord> items,Long total){}
 record Correction(String displayName,String legalName,String registrationIdentifier,String taxIdentifier,OrganizationRecord.Address address){}
 Page list(Query query);
 OrganizationRecord read(UUID organization);
 OrganizationRecord correct(UUID actor,UUID organization,Correction correction,String reason);
 OrganizationRecord state(UUID actor,UUID organization,boolean active,String reason);
}
