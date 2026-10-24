package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.pricing.api.BasePricing;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.*;
import tools.jackson.databind.JsonNode;

final class PricingRequests {
    static Command input(HttpServletRequest request)throws IOException{
        return parse(AuthRequests.object(request,Set.of("expectedRevision","basePrice","tiers","deactivateProduct")),"");
    }
    static Command parse(JsonNode body,String prefix){
        var errors=new ArrayList<AuthErrors.FieldError>();
        if(!body.isObject()){throw new AuthHttpFailure(422,"VALIDATION_FAILED",prefix);}
        var fields=Set.of("expectedRevision","basePrice","tiers","deactivateProduct");
        for(String field:body.propertyNames()){if(!fields.contains(field)){error(errors,prefix+"/"+field);}}
        for(String field:fields){if(!body.has(field)){error(errors,prefix+"/"+field);}}
        String revision=body.path("expectedRevision").isString()?body.path("expectedRevision").asString():null;
        if(revision==null||revision.isEmpty()||revision.length()>256){error(errors,prefix+"/expectedRevision");}
        BigDecimal base=body.path("basePrice").isNull()?null:amount(body.path("basePrice"),prefix+"/basePrice",errors);
        boolean deactivate=false;
        if(!body.path("deactivateProduct").isBoolean()){error(errors,prefix+"/deactivateProduct");}else{deactivate=body.path("deactivateProduct").asBoolean();}
        var tiers=new ArrayList<BasePricing.Tier>();var node=body.path("tiers");
        if(!node.isArray()||node.size()>50){error(errors,prefix+"/tiers");}
        else{
            var seen=new HashSet<Integer>();
            for(int i=0;i<node.size();i++){
                var tier=node.get(i);String path=prefix+"/tiers/"+i;
                if(!tier.isObject()){error(errors,path);continue;}
                for(String field:tier.propertyNames()){if(!Set.of("minimumQuantity","unitPrice").contains(field)){error(errors,path+"/"+field);}}
                Integer quantity=null;var q=tier.path("minimumQuantity");
                try{if(!q.isNumber()||!q.toString().matches("[1-9][0-9]{0,9}")){throw new IllegalArgumentException();}long n=Long.parseLong(q.toString());if(n>1000000000){throw new IllegalArgumentException();}quantity=(int)n;if(!seen.add(quantity)){error(errors,path+"/minimumQuantity");}}
                catch(IllegalArgumentException failure){error(errors,path+"/minimumQuantity");}
                BigDecimal price=amount(tier.path("unitPrice"),path+"/unitPrice",errors);
                if(quantity!=null&&price!=null){tiers.add(new BasePricing.Tier(quantity,price));}
            }
        }
        if(!errors.isEmpty()){throw new AuthHttpFailure(errors.stream().distinct().sorted(Comparator.comparing(AuthErrors.FieldError::path)).limit(100).toList());}
        tiers.sort(Comparator.comparingInt(BasePricing.Tier::minimumQuantity));
        return new Command(revision,new BasePricing.Values(base,tiers),deactivate);
    }
    static BigDecimal amount(JsonNode node,String path,List<AuthErrors.FieldError> errors){
        if(!node.isString()||!node.asString().matches("(0|[1-9][0-9]{0,8})(\\.[0-9]{1,2})?")){error(errors,path);return null;}
        BigDecimal amount=new BigDecimal(node.asString());if(amount.signum()<=0){error(errors,path);return null;}return amount.setScale(2);
    }
    private static void error(List<AuthErrors.FieldError> errors,String path){errors.add(new AuthErrors.FieldError(path,"INVALID_VALUE"));}
    record Command(String expectedRevision,BasePricing.Values values,boolean deactivateProduct){
        @Override public String toString(){return "PricingCommand[redacted]";}
    }
}
