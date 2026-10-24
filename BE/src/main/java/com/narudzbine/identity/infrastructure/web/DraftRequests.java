package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.buyerworkspace.api.SharedDrafts.*;
import com.narudzbine.identity.application.LoginInput;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
final class DraftRequests {
 private static final Set<String> FIELDS=Set.of("vendorId","lines","deliveryLocationId","contactOverride","instructionsOverride","note","replacementForOrderId","instructionsMode");
 private static final JsonMapper JSON=JsonMapper.builder().build();
 static Command input(HttpServletRequest r,boolean create)throws IOException{
  var body=AuthRequests.object(r,create?Set.of("id","intent"):Set.of("expectedRevision","intent"),131072);UUID id=create?id(body.path("id"),"/id"):null;String expected=create?null:ContactRequests.revision(body);return new Command(id,expected,intent(body.path("intent")));
 }
 static Intent intent(JsonNode intent){object(intent,FIELDS,"/intent");
  UUID vendor=id(intent.path("vendorId"),"/intent/vendorId"),location=nullableId(intent.path("deliveryLocationId"),"/intent/deliveryLocationId"),replacement=nullableId(intent.path("replacementForOrderId"),"/intent/replacementForOrderId");
  var lines=new ArrayList<Line>();var seen=new HashSet<UUID>();var array=intent.path("lines");if(!array.isArray()||array.size()>500){throw invalid("/intent/lines");}
  for(int i=0;i<array.size();i++){var line=array.get(i);String path="/intent/lines/"+i;object(line,Set.of("productId","quantity"),path);UUID product=id(line.path("productId"),path+"/productId");if(!seen.add(product)){throw invalid(path+"/productId");}var n=line.path("quantity");int qty;try{if(!n.isNumber()||!n.toString().matches("[1-9][0-9]{0,9}")){throw new IllegalArgumentException();}long value=Long.parseLong(n.toString());if(value>1000000000){throw new IllegalArgumentException();}qty=(int)value;}catch(IllegalArgumentException e){throw invalid(path+"/quantity");}lines.add(new Line(product,qty));}
  Contact contact=null;var c=intent.path("contactOverride");if(!c.isNull()){object(c,Set.of("name","phone","email"),"/intent/contactOverride");var errors=new ArrayList<AuthErrors.FieldError>();String name=OrganizationRequests.text(c,"name","/intent/contactOverride",100,false,errors),phone=OrganizationRequests.text(c,"phone","/intent/contactOverride",30,false,errors);if(phone!=null&&(phone.length()<3||!phone.matches("[+0-9 ()-]+"))){errors.add(new AuthErrors.FieldError("/intent/contactOverride/phone","INVALID_VALUE"));}String email=null;if(!c.path("email").isNull()){try{if(!c.path("email").isString()){throw new IllegalArgumentException();}email=LoginInput.email(c.path("email").asString());}catch(IllegalArgumentException e){errors.add(new AuthErrors.FieldError("/intent/contactOverride/email","INVALID_VALUE"));}}if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}contact=new Contact(name,phone,email);}
  String instructions=text(intent,"instructionsOverride"),note=text(intent,"note");String mode=intent.path("instructionsMode").isString()?intent.path("instructionsMode").asString():"";if(!Set.of("INHERIT","OVERRIDE","CLEAR").contains(mode)){throw invalid("/intent/instructionsMode");}if(mode.equals("OVERRIDE")!=(instructions!=null)){throw invalid("/intent/instructionsOverride");}
  return new Intent(vendor,lines,location,contact,instructions,note,replacement,mode);
 }
 private static String text(JsonNode n,String field){if(n.path(field).isNull()){return null;}var errors=new ArrayList<AuthErrors.FieldError>();String value=OrganizationRequests.text(n,field,"/intent",2000,true,errors);if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}return value;}
 private static void object(JsonNode n,Set<String> fields,String path){if(!n.isObject()){throw invalid(path);}for(String f:n.propertyNames()){if(!fields.contains(f)){throw invalid(path+"/"+f);}}for(String f:fields){if(!n.has(f)){throw invalid(path+"/"+f);}}}
 private static UUID id(JsonNode n,String path){return ContactRequests.id(n.isString()?n.asString():null,"BODY",path);}
 private static UUID nullableId(JsonNode n,String path){return n.isNull()?null:id(n,path);}
 static byte[] digest(Intent intent,byte[] key){try{var mac=javax.crypto.Mac.getInstance("HmacSHA256");mac.init(new javax.crypto.spec.SecretKeySpec(key,"HmacSHA256"));mac.update("narudzbine/draft-create/v1\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII));return mac.doFinal(JSON.writeValueAsBytes(intent));}catch(java.security.GeneralSecurityException e){throw new IllegalStateException("Creation fingerprint unavailable.");}}
 static AuthHttpFailure invalid(String path){return new AuthHttpFailure(422,"VALIDATION_FAILED",path);}
 record Command(UUID id,String expected,Intent intent){@Override public String toString(){return "DraftCommand[redacted]";}}
}
