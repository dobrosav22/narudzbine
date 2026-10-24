package com.narudzbine.identity.infrastructure.web;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.*;
import tools.jackson.databind.JsonNode;
final class AgreedPriceRequests {
 static Input input(HttpServletRequest request)throws IOException{var b=AuthRequests.object(request,Set.of("unitPrice","expectedRevision"));if(!b.has("expectedRevision")){throw invalid("/expectedRevision");}String revision=b.path("expectedRevision").isNull()?null:ContactRequests.revision(b);var p=b.path("unitPrice");if(!p.isString()||!p.asString().matches("(0|[1-9][0-9]{0,8})(\\.[0-9]{1,2})?")){throw invalid("/unitPrice");}var price=new BigDecimal(p.asString());if(price.signum()<=0){throw invalid("/unitPrice");}return new Input(revision,price.setScale(2));}
 static Confirmation confirmation(HttpServletRequest request)throws IOException{var b=AuthRequests.object(request,Set.of("expectedRelationshipRevision","expectedPricingRevision","productIds"),131072);String relationship=revision(b,"expectedRelationshipRevision"),pricing=revision(b,"expectedPricingRevision");var p=b.path("productIds");if(!p.isArray()||p.size()>1000){throw invalid("/productIds");}var ids=new ArrayList<UUID>();for(int i=0;i<p.size();i++){var node=p.get(i);UUID id=ContactRequests.id(node.isString()?node.asString():null,"BODY","/productIds/"+i);if(ids.contains(id)){throw invalid("/productIds/"+i);}ids.add(id);}return new Confirmation(relationship,pricing,List.copyOf(ids));}
 private static String revision(JsonNode b,String field){var v=b.path(field);if(!v.isString()||v.asString().isEmpty()||v.asString().length()>256){throw invalid("/"+field);}return v.asString();}
 static Query query(HttpServletRequest r){for(var e:r.getParameterMap().entrySet()){if(!Set.of("page","size","includeTotal").contains(e.getKey())||e.getValue().length!=1){throw queryError(e.getKey());}}String total=r.getParameter("includeTotal");if(total!=null&&!Set.of("true","false").contains(total)){throw queryError("includeTotal");}return new Query(number(r,"page",0,0,10000),number(r,"size",25,1,100),"true".equals(total));}
 private static int number(HttpServletRequest r,String field,int fallback,int min,int max){String v=r.getParameter(field);if(v==null){return fallback;}try{if(!v.matches("0|[1-9][0-9]{0,5}")){throw new IllegalArgumentException();}int n=Integer.parseInt(v);if(n<min||n>max){throw new IllegalArgumentException();}return n;}catch(IllegalArgumentException ex){throw queryError(field);}}
 private static AuthHttpFailure queryError(String field){return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",field,"INVALID_VALUE")));}
 private static AuthHttpFailure invalid(String field){return new AuthHttpFailure(422,"VALIDATION_FAILED",field);}
 record Input(String revision,BigDecimal price){@Override public String toString(){return "AgreedPriceInput[redacted]";}}
 record Confirmation(String relationshipRevision,String pricingRevision,List<UUID> products){@Override public String toString(){return "AgreedPriceConfirmation[redacted]";}}
 record Query(int page,int size,boolean total){}
}
