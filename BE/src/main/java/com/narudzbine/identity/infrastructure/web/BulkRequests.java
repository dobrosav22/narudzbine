package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.pricing.api.BasePricing;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import tools.jackson.databind.JsonNode;

final class BulkRequests {
    private static final Set<String> FIELDS=Set.of("targets","price","categoryId","addTagIds","removeTagIds","active","tierCorrections");
    static Command input(HttpServletRequest request)throws IOException{return parse(AuthRequests.object(request,FIELDS,524288));}
    static Command parse(JsonNode body){
        fields(body,FIELDS,"");
        var targets=new ArrayList<Target>();var ids=new HashSet<UUID>();
        var nodes=body.path("targets");if(!nodes.isArray()||nodes.isEmpty()||nodes.size()>100){throw invalid("/targets");}
        for(int i=0;i<nodes.size();i++){
            var node=nodes.get(i);String path="/targets/"+i;
            fields(node,Set.of("productId","expectedRevision","expectedPricingRevision"),path);
            UUID id=id(node.path("productId"),path+"/productId");if(!ids.add(id)){throw invalid(path+"/productId");}
            targets.add(new Target(id,revision(node.path("expectedRevision"),path+"/expectedRevision"),revision(node.path("expectedPricingRevision"),path+"/expectedPricingRevision")));
        }
        Price price=null;
        if(body.hasNonNull("price")){
            var node=body.path("price");fields(node,Set.of("kind","value"),"/price");
            String kind=node.path("kind").isString()?node.path("kind").asString():"";
            if(!Set.of("SET","PERCENT_CHANGE").contains(kind)){throw invalid("/price/kind");}
            var value=node.path("value");if(!value.isString()||!value.asString().matches("-?(0|[1-9][0-9]{0,8})(\\.[0-9]{1,2})?")){throw invalid("/price/value");}
            BigDecimal amount=new BigDecimal(value.asString());
            if(kind.equals("SET")&&(amount.signum()<=0||amount.compareTo(new BigDecimal("999999999.99"))>0)
                    ||kind.equals("PERCENT_CHANGE")&&(amount.compareTo(new BigDecimal("-100"))<=0||amount.compareTo(new BigDecimal("1000"))>0)){throw invalid("/price/value");}
            price=new Price(kind,amount);
        }
        boolean categorySupplied=body.has("categoryId");UUID category=body.hasNonNull("categoryId")?id(body.path("categoryId"),"/categoryId"):null;
        var add=tags(body,"addTagIds");var remove=tags(body,"removeTagIds");if(add.stream().anyMatch(remove::contains)){throw invalid("/removeTagIds");}
        Boolean active=null;if(body.hasNonNull("active")){if(!body.path("active").isBoolean()){throw invalid("/active");}active=body.path("active").asBoolean();}
        var corrections=new HashMap<UUID,List<BasePricing.Tier>>();
        if(body.has("tierCorrections")){
            var array=body.path("tierCorrections");if(!array.isArray()||array.size()>100){throw invalid("/tierCorrections");}
            for(int i=0;i<array.size();i++){
                var node=array.get(i);String path="/tierCorrections/"+i;fields(node,Set.of("productId","tiers"),path);
                UUID id=id(node.path("productId"),path+"/productId");if(!ids.contains(id)||corrections.containsKey(id)){throw invalid(path+"/productId");}
                // Reuse the ordinary pricing parser's strict, bounded tier grammar.
                var pricing=node.deepCopy().asObject();pricing.remove("productId");pricing.put("expectedRevision","bulk");pricing.putNull("basePrice");pricing.put("deactivateProduct",false);
                corrections.put(id,PricingRequests.parse(pricing,path).values().tiers());
            }
        }
        if(price==null&&!categorySupplied&&add.isEmpty()&&remove.isEmpty()&&active==null&&corrections.isEmpty()){throw invalid("");}
        return new Command(List.copyOf(targets),price,categorySupplied,category,add,remove,active,Map.copyOf(corrections));
    }
    static BigDecimal adjusted(Price price,BigDecimal current){
        if(price==null){return current;}BigDecimal result;
        if(price.kind().equals("SET")){result=price.value().setScale(2);}
        else{if(current==null){throw invalid("/price");}result=current.multiply(BigDecimal.valueOf(100).add(price.value())).movePointLeft(2).setScale(2,RoundingMode.HALF_UP);}
        if(result.signum()<=0||result.compareTo(new BigDecimal("999999999.99"))>0){throw invalid("/price/value");}return result;
    }
    private static List<UUID> tags(JsonNode body,String field){
        if(!body.has(field)){return List.of();}var node=body.path(field);if(!node.isArray()||node.size()>50){throw invalid("/"+field);}
        var values=new TreeSet<UUID>(Comparator.comparing(UUID::toString));for(int i=0;i<node.size();i++){if(!values.add(id(node.get(i),"/"+field+"/"+i))){throw invalid("/"+field+"/"+i);}}return List.copyOf(values);
    }
    private static UUID id(JsonNode node,String path){return ContactRequests.id(node.isString()?node.asString():null,"BODY",path);}
    private static String revision(JsonNode node,String path){if(!node.isString()||node.asString().isEmpty()||node.asString().length()>256){throw invalid(path);}return node.asString();}
    private static void fields(JsonNode node,Set<String> allowed,String path){if(!node.isObject()){throw invalid(path);}for(String key:node.propertyNames()){if(!allowed.contains(key)){throw invalid(path+"/"+key);}}}
    private static AuthHttpFailure invalid(String path){return new AuthHttpFailure(422,"VALIDATION_FAILED",path);}
    record Target(UUID id,String productRevision,String pricingRevision){}
    record Price(String kind,BigDecimal value){}
    record Command(List<Target> targets,Price price,boolean categorySupplied,UUID category,List<UUID> add,List<UUID> remove,Boolean active,Map<UUID,List<BasePricing.Tier>> corrections){}
}
