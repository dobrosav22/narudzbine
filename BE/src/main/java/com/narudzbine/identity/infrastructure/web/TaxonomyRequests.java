package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.catalogue.api.VendorTaxonomy.Kind;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
final class TaxonomyRequests {
 static Input input(HttpServletRequest request,Kind kind,boolean create)throws IOException{
  var body=AuthRequests.object(request,create?Set.of("id","name"):Set.of("expectedRevision","name"));
  var errors=new ArrayList<AuthErrors.FieldError>();String name=OrganizationRequests.text(body,"name","",kind==Kind.UNIT?50:100,false,errors);
  if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}
  return new Input(create?ContactRequests.id(body.path("id").isString()?body.path("id").asString():null,"BODY","/id"):null,create?null:ContactRequests.revision(body),name);
 }
 static Query query(HttpServletRequest request){
  allow(request,Set.of("page","size","includeTotal","q","sort"));
  int page=number(request,"page",0,0,10000),size=number(request,"size",25,1,100);
  String total=request.getParameter("includeTotal"),sort=request.getParameter("sort"),query=request.getParameter("q");
  if(total!=null&&!Set.of("true","false").contains(total)){throw invalid("includeTotal");}
  if(sort!=null&&!Set.of("NAME_ASC","CREATED_DESC").contains(sort)){throw invalid("sort");}
  if(query==null){query="";}query=java.text.Normalizer.normalize(query.strip(),java.text.Normalizer.Form.NFC);
  if(query.codePointCount(0,query.length())>100||query.codePoints().anyMatch(c->Character.isISOControl(c)||(c>=0xd800&&c<=0xdfff))){throw invalid("q");}
  return new Query(page,size,"true".equals(total),query,"CREATED_DESC".equals(sort));
 }
 static String deletion(HttpServletRequest request){allow(request,Set.of("expectedRevision"));String value=request.getParameter("expectedRevision");if(value==null||value.isEmpty()||value.length()>256){throw invalid("expectedRevision");}return value;}
 private static void allow(HttpServletRequest request,Set<String> allowed){for(var e:request.getParameterMap().entrySet()){if(!allowed.contains(e.getKey())||e.getValue().length!=1){throw invalid(e.getKey());}}}
 private static int number(HttpServletRequest request,String key,int fallback,int min,int max){String v=request.getParameter(key);if(v==null){return fallback;}try{if(!v.matches("0|[1-9][0-9]{0,5}")){throw new IllegalArgumentException();}int n=Integer.parseInt(v);if(n<min||n>max){throw new IllegalArgumentException();}return n;}catch(IllegalArgumentException e){throw invalid(key);}}
 private static AuthHttpFailure invalid(String key){return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",key,"INVALID_VALUE")));}
 static byte[] digest(Kind kind,String name,byte[] key){try{var mac=javax.crypto.Mac.getInstance("HmacSHA256");mac.init(new javax.crypto.spec.SecretKeySpec(key,"HmacSHA256"));return mac.doFinal(("narudzbine/taxonomy-create/v1\0"+kind.name()+"\0"+name).getBytes(java.nio.charset.StandardCharsets.UTF_8));}catch(java.security.GeneralSecurityException e){throw new IllegalStateException("Creation fingerprint unavailable.");}}
 record Input(UUID id,String expectedRevision,String name){@Override public String toString(){return "TaxonomyInput[redacted]";}}
 record Query(int page,int size,boolean total,String query,boolean createdSort){ }
}
