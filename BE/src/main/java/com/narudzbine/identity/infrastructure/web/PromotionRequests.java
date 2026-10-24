package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.pricing.api.VendorPromotions.*;
import com.narudzbine.organizations.api.Country;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
final class PromotionRequests {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 static Input input(HttpServletRequest request,boolean create)throws IOException{
  var fields=new HashSet<>(Set.of("name","kind","value","productMode","productIds","categoryIds","buyerMode","buyerIds","startsAt","endsAt"));fields.add(create?"id":"expectedRevision");var b=AuthRequests.object(request,fields,131072);for(String f:fields){if(!b.has(f)){throw invalid("/"+f);}}
  UUID id=create?ContactRequests.id(b.path("id").isString()?b.path("id").asString():null,"BODY","/id"):null;String revision=create?null:ContactRequests.revision(b);var errors=new ArrayList<AuthErrors.FieldError>();String name=OrganizationRequests.text(b,"name","",200,false,errors);if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}
  Kind kind=enumeration(b,"kind",Kind.class);Mode product=enumeration(b,"productMode",Mode.class),buyer=enumeration(b,"buyerMode",Mode.class);var node=b.path("value");if(!node.isString()||!node.asString().matches("(0|[1-9][0-9]{0,8})(\\.[0-9]{1,2})?")){throw invalid("/value");}BigDecimal value=new BigDecimal(node.asString()).setScale(2);if(kind==Kind.PERCENTAGE&&(value.signum()==0||value.compareTo(new BigDecimal("100"))>0)){throw invalid("/value");}
  var products=ids(b,"productIds");var categories=ids(b,"categoryIds");var buyers=ids(b,"buyerIds");if(product==Mode.ALL?(!products.isEmpty()||!categories.isEmpty()):(products.isEmpty()&&categories.isEmpty())){throw invalid("/productMode");}if(buyer==Mode.ALL?!buyers.isEmpty():buyers.isEmpty()){throw invalid("/buyerMode");}
  return new Input(id,revision,name,kind,value,product,products,categories,buyer,buyers,schedule(b,"startsAt"),schedule(b,"endsAt"));
 }
 static Values values(Input i,Country country){ZoneId zone=ZoneId.of(country==Country.RS?"Europe/Belgrade":"Europe/Sarajevo");Instant start=instant(i.start(),zone,"/startsAt"),end=instant(i.end(),zone,"/endsAt");return new Values(i.name(),i.kind(),i.value(),i.productMode(),i.productIds(),i.categoryIds(),i.buyerMode(),i.buyerIds(),start,end);}
 private static Instant instant(Schedule s,ZoneId zone,String field){if(!zone.getRules().getValidOffsets(s.local()).contains(s.offset())){throw invalid(field+"/offset");}return s.local().toInstant(s.offset());}
 private static Schedule schedule(JsonNode b,String field){var n=b.path(field);if(!n.isObject()||n.size()!=2||!n.has("localDateTime")||!n.has("offset")){throw invalid("/"+field);}var l=n.path("localDateTime");var o=n.path("offset");try{if(!l.isString()||!l.asString().matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}")||!o.isString()||!o.asString().matches("[+-][0-9]{2}:[0-9]{2}")){throw new IllegalArgumentException();}return new Schedule(LocalDateTime.parse(l.asString()),ZoneOffset.of(o.asString()));}catch(java.time.DateTimeException|IllegalArgumentException ex){throw invalid("/"+field);}}
 private static <E extends Enum<E>> E enumeration(JsonNode b,String field,Class<E> type){try{if(!b.path(field).isString()){throw new IllegalArgumentException();}return Enum.valueOf(type,b.path(field).asString());}catch(IllegalArgumentException ex){throw invalid("/"+field);}}
 private static List<UUID> ids(JsonNode b,String field){var node=b.path(field);if(!node.isArray()||node.size()>1000){throw invalid("/"+field);}var result=new TreeSet<UUID>(Comparator.comparing(UUID::toString));for(int n=0;n<node.size();n++){UUID id=ContactRequests.id(node.get(n).isString()?node.get(n).asString():null,"BODY","/"+field+"/"+n);if(!result.add(id)){throw invalid("/"+field+"/"+n);}}return List.copyOf(result);}
 static Query query(HttpServletRequest r){for(var e:r.getParameterMap().entrySet()){if(!Set.of("page","size","includeTotal","state").contains(e.getKey())||e.getValue().length!=1){throw queryError(e.getKey());}}String state=r.getParameter("state"),total=r.getParameter("includeTotal");if(state!=null&&!Set.of("SCHEDULED","RUNNING","ENDED","STOPPED").contains(state)){throw queryError("state");}if(total!=null&&!Set.of("true","false").contains(total)){throw queryError("includeTotal");}return new Query(number(r,"page",0,0,10000),number(r,"size",25,1,100),"true".equals(total),state);}
 private static int number(HttpServletRequest r,String field,int fallback,int min,int max){String v=r.getParameter(field);if(v==null){return fallback;}try{if(!v.matches("0|[1-9][0-9]{0,5}")){throw new IllegalArgumentException();}int n=Integer.parseInt(v);if(n<min||n>max){throw new IllegalArgumentException();}return n;}catch(IllegalArgumentException ex){throw queryError(field);}}
 static byte[] digest(Values values,byte[] key){try{var mac=javax.crypto.Mac.getInstance("HmacSHA256");mac.init(new javax.crypto.spec.SecretKeySpec(key,"HmacSHA256"));mac.update("narudzbine/promotion-create/v1\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII));return mac.doFinal(JSON.writeValueAsBytes(values));}catch(java.security.GeneralSecurityException ex){throw new IllegalStateException("Creation fingerprint unavailable.");}}
 private static AuthHttpFailure invalid(String field){return new AuthHttpFailure(422,"VALIDATION_FAILED",field);}
 private static AuthHttpFailure queryError(String field){return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",field,"INVALID_VALUE")));}
 record Schedule(LocalDateTime local,ZoneOffset offset){}
 record Query(int page,int size,boolean total,String state){}
 record Input(UUID id,String revision,String name,Kind kind,BigDecimal value,Mode productMode,List<UUID> productIds,List<UUID> categoryIds,Mode buyerMode,List<UUID> buyerIds,Schedule start,Schedule end){@Override public String toString(){return "PromotionInput[redacted]";}}
}
