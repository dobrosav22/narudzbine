package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.organizations.api.AdministrativeOrganizations;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.text.Normalizer;
import java.util.*;
final class AdministrativeDirectoryRequests {
 record Correction(String revision,AdministrativeOrganizations.Correction values,String reason){}
 record Staff(String revision,String reason){}
 static Correction correction(HttpServletRequest r)throws IOException{
  var b=AuthRequests.object(r,Set.of("expectedRevision","displayName","legalName","registrationIdentifier","taxIdentifier","registeredAddress","reason"));String revision=ContactRequests.revision(b);var errors=new ArrayList<AuthErrors.FieldError>();
  String display=OrganizationRequests.text(b,"displayName","",200,false,errors),legal=OrganizationRequests.text(b,"legalName","",200,false,errors),identifier=OrganizationRequests.text(b,"registrationIdentifier","",64,false,errors),tax=OrganizationRequests.text(b,"taxIdentifier","",64,true,errors),reason=OrganizationRequests.text(b,"reason","",1000,false,errors);
  if(identifier!=null&&!identifier.matches("[A-Za-z0-9/-]{1,64}"))errors.add(new AuthErrors.FieldError("/registrationIdentifier","INVALID_VALUE"));if(tax!=null&&!tax.matches("[A-Za-z0-9/-]{1,64}"))errors.add(new AuthErrors.FieldError("/taxIdentifier","INVALID_VALUE"));var address=OrganizationRequests.address(b.path("registeredAddress"),"/registeredAddress",errors);if(!errors.isEmpty())throw new AuthHttpFailure(errors);return new Correction(revision,new AdministrativeOrganizations.Correction(display,legal,identifier,tax,address),reason);
 }
 static Staff staff(HttpServletRequest r)throws IOException{var b=AuthRequests.object(r,Set.of("expectedRevision","reason"));String revision=ContactRequests.revision(b);var errors=new ArrayList<AuthErrors.FieldError>();String reason=OrganizationRequests.text(b,"reason","",1000,false,errors);if(!errors.isEmpty())throw new AuthHttpFailure(errors);return new Staff(revision,reason);}
 static AdministrativeOrganizations.Query query(HttpServletRequest r){
  for(var e:r.getParameterMap().entrySet())if(!Set.of("page","size","includeTotal","country","type","state","q").contains(e.getKey())||e.getValue().length!=1)throw StockRequests.invalid(e.getKey());int page=number(r,"page",0,0,10000),size=number(r,"size",25,1,100);String country=choice(r,"country",Set.of("RS","BA")),type=choice(r,"type",Set.of("BUYER","VENDOR")),state=choice(r,"state",Set.of("ACTIVE","SUSPENDED","CLOSED")),total=choice(r,"includeTotal",Set.of("true","false"));String q=r.getParameter("q");q=q==null?"":Normalizer.normalize(q.strip(),Normalizer.Form.NFC);if(q.codePointCount(0,q.length())>100||q.codePoints().anyMatch(c->Character.isISOControl(c)||c>=0xd800&&c<=0xdfff))throw StockRequests.invalid("q");return new AdministrativeOrganizations.Query(page,size,"true".equals(total),country,type,state,q);
 }
 private static String choice(HttpServletRequest r,String field,Set<String> values){String v=r.getParameter(field);if(v!=null&&!values.contains(v))throw StockRequests.invalid(field);return v;}
 private static int number(HttpServletRequest r,String field,int fallback,int min,int max){String v=r.getParameter(field);if(v==null)return fallback;try{if(!v.matches("0|[1-9][0-9]{0,5}"))throw new IllegalArgumentException();int n=Integer.parseInt(v);if(n<min||n>max)throw new IllegalArgumentException();return n;}catch(IllegalArgumentException e){throw StockRequests.invalid(field);}}
}
