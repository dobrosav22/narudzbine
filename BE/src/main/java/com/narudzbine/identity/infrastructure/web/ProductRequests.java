package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.catalogue.api.VendorProducts;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class ProductRequests {
    static Gallery gallery(jakarta.servlet.http.HttpServletRequest request)throws java.io.IOException{
        var body=AuthRequests.object(request,Set.of("expectedRevision","assetIds"));String revision=ContactRequests.revision(body);
        var node=body.path("assetIds");if(!node.isArray()||node.size()>5){throw new AuthHttpFailure(422,"VALIDATION_FAILED","/assetIds");}
        var ids=new java.util.ArrayList<UUID>();for(int n=0;n<node.size();n++){var value=node.get(n);UUID id=ContactRequests.id(value.isString()?value.asString():null,"BODY","/assetIds/"+n);if(ids.contains(id)){throw new AuthHttpFailure(422,"VALIDATION_FAILED","/assetIds/"+n);}ids.add(id);}
        return new Gallery(revision,List.copyOf(ids));
    }
    record Gallery(String expectedRevision,List<UUID> assetIds){}
    private static final Set<String> FIELDS=Set.of("id","sku","name","description","unitId","packDescription","categoryId","tagIds","minimumQuantity","quantityStep");
    private static final JsonMapper JSON=JsonMapper.builder().build();
    static Input input(HttpServletRequest request,boolean create)throws IOException{
        var allowed=new HashSet<>(FIELDS);if(!create){allowed.remove("id");allowed.add("expectedRevision");allowed.add("pricingCorrection");}return parse(AuthRequests.object(request,allowed),create);
    }
    static Input parse(JsonNode body,boolean create){
        var allowed=new HashSet<>(FIELDS);if(!create){allowed.remove("id");allowed.add("expectedRevision");allowed.add("pricingCorrection");}var errors=new ArrayList<AuthErrors.FieldError>();
        if(!create){for(String field:allowed){if(!body.has(field)){error(errors,"/"+field);}}}
        UUID id=null;String revision=null;
        try{if(create){id=ContactRequests.id(body.path("id").isString()?body.path("id").asString():null,"BODY","/id");}else{revision=ContactRequests.revision(body);}}catch(AuthHttpFailure failure){errors.addAll(failure.fields);}
        String sku=OrganizationRequests.text(body,"sku","",64,false,errors);if(sku!=null&&!sku.matches("[A-Za-z0-9._/-]{1,64}")){error(errors,"/sku");}
        String name=OrganizationRequests.text(body,"name","",200,false,errors),description=text(body,"description",5000,true,create,errors),pack=text(body,"packDescription",200,false,create,errors);
        UUID unit=reference(body,"unitId",create,errors),category=reference(body,"categoryId",create,errors);var tags=new ArrayList<UUID>();
        if(!(create&&!body.has("tagIds"))){var node=body.path("tagIds");if(!node.isArray()||node.size()>50){error(errors,"/tagIds");}else{var seen=new HashSet<UUID>();for(int i=0;i<node.size();i++){try{UUID tag=ContactRequests.id(node.get(i).isString()?node.get(i).asString():null,"BODY","/tagIds/"+i);if(!seen.add(tag)){error(errors,"/tagIds/"+i);}else{tags.add(tag);}}catch(AuthHttpFailure failure){errors.addAll(failure.fields);}}}}
        int minimum=quantity(body,"minimumQuantity",create,errors),step=quantity(body,"quantityStep",create,errors);PricingRequests.Command correction=null;if(!create&&body.has("pricingCorrection")&&!body.path("pricingCorrection").isNull()){try{correction=PricingRequests.parse(body.path("pricingCorrection"),"/pricingCorrection");}catch(AuthHttpFailure failure){errors.addAll(failure.fields);}}
        if(!errors.isEmpty()){errors=errors.stream().distinct().sorted(Comparator.comparing(AuthErrors.FieldError::path)).limit(100).collect(java.util.stream.Collectors.toCollection(ArrayList::new));throw new AuthHttpFailure(errors);}
        tags.sort(Comparator.comparing(UUID::toString));return new Input(id,revision,new VendorProducts.Values(sku,name,description,unit,pack,category,tags,minimum,step),correction);
    }
    private static String text(JsonNode body,String field,int max,boolean multiline,boolean create,List<AuthErrors.FieldError> errors){if(create&&!body.has(field)||body.path(field).isNull()){return null;}var node=body.path(field);if(!node.isString()){error(errors,"/"+field);return null;}String value=java.text.Normalizer.normalize(node.asString().strip(),java.text.Normalizer.Form.NFC);if(value.isBlank()||value.codePointCount(0,value.length())>max||value.codePoints().anyMatch(c->(Character.isISOControl(c)&&!(multiline&&(c==10||c==9)))||(c>=0xd800&&c<=0xdfff))){error(errors,"/"+field);return null;}return value;}
    private static UUID reference(JsonNode body,String field,boolean create,List<AuthErrors.FieldError> errors){if(create&&!body.has(field)||body.path(field).isNull()){return null;}try{return ContactRequests.id(body.path(field).isString()?body.path(field).asString():null,"BODY","/"+field);}catch(AuthHttpFailure failure){errors.addAll(failure.fields);return null;}}
    private static int quantity(JsonNode body,String field,boolean create,List<AuthErrors.FieldError> errors){if(create&&!body.has(field)){return 1;}var node=body.path(field);try{if(!node.isNumber()||!node.toString().matches("[1-9][0-9]{0,9}")){throw new IllegalArgumentException();}long n=Long.parseLong(node.toString());if(n>1000000000){throw new IllegalArgumentException();}return (int)n;}catch(IllegalArgumentException exception){error(errors,"/"+field);return 1;}}
    static VendorProducts.Query query(HttpServletRequest request){
        var allowed=Set.of("page","size","includeTotal","q","sort","state","categoryId","tagId");for(var e:request.getParameterMap().entrySet()){if(!allowed.contains(e.getKey())||e.getValue().length!=1){throw invalid(e.getKey());}}
        int page=number(request,"page",0,0,10000),size=number(request,"size",25,1,100);String total=request.getParameter("includeTotal"),sort=request.getParameter("sort"),state=request.getParameter("state"),q=request.getParameter("q");
        if(total!=null&&!Set.of("true","false").contains(total)){throw invalid("includeTotal");}if(sort!=null&&!Set.of("NAME_ASC","CREATED_DESC").contains(sort)){throw invalid("sort");}if(state!=null&&!Set.of("ACTIVE","INACTIVE","ARCHIVED").contains(state)){throw invalid("state");}
        if(q==null){q="";}q=java.text.Normalizer.normalize(q.strip(),java.text.Normalizer.Form.NFC);if(q.codePointCount(0,q.length())>100||q.codePoints().anyMatch(c->Character.isISOControl(c)||(c>=0xd800&&c<=0xdfff))){throw invalid("q");}
        return new VendorProducts.Query(page,size,"true".equals(total),q,"CREATED_DESC".equals(sort),state,queryId(request,"categoryId"),queryId(request,"tagId"));
    }
    private static UUID queryId(HttpServletRequest request,String field){String v=request.getParameter(field);return v==null?null:ContactRequests.id(v,"QUERY",field);}
    private static int number(HttpServletRequest request,String key,int fallback,int min,int max){String v=request.getParameter(key);if(v==null){return fallback;}try{if(!v.matches("0|[1-9][0-9]{0,5}")){throw new IllegalArgumentException();}int n=Integer.parseInt(v);if(n<min||n>max){throw new IllegalArgumentException();}return n;}catch(IllegalArgumentException e){throw invalid(key);}}
    private static AuthHttpFailure invalid(String key){return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",key,"INVALID_VALUE")));}
    private static void error(List<AuthErrors.FieldError> errors,String field){errors.add(new AuthErrors.FieldError(field,"INVALID_VALUE"));}
    static byte[] digest(VendorProducts.Values values,byte[] key){try{var mac=javax.crypto.Mac.getInstance("HmacSHA256");mac.init(new javax.crypto.spec.SecretKeySpec(key,"HmacSHA256"));mac.update("narudzbine/product-create/v1\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII));return mac.doFinal(JSON.writeValueAsBytes(values));}catch(java.security.GeneralSecurityException e){throw new IllegalStateException("Creation fingerprint unavailable.");}}
    record Input(UUID id,String expectedRevision,VendorProducts.Values values,PricingRequests.Command pricingCorrection){@Override public String toString(){return "ProductInput[redacted]";}}
}
