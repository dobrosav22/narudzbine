package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.catalogue.api.VendorProducts;
import jakarta.servlet.http.*;
import java.util.*;
final class OfferRequests {
 record Query(VendorProducts.Query products,Boolean featured){}
 static Query list(HttpServletRequest r){for(var entry:r.getParameterMap().entrySet()){if(!Set.of("size","page","includeTotal","q","sort","categoryId","tagId","featured").contains(entry.getKey())||entry.getValue().length!=1){throw StockRequests.invalid(entry.getKey());}}String f=r.getParameter("featured");if(f!=null&&!Set.of("true","false").contains(f)){throw StockRequests.invalid("featured");}var request=new HttpServletRequestWrapper(r){@Override public Map<String,String[]> getParameterMap(){var map=new HashMap<>(super.getParameterMap());map.remove("featured");return map;}};return new Query(ProductRequests.query(request),f==null?null:Boolean.valueOf(f));}
 static Integer quantity(HttpServletRequest r){for(var e:r.getParameterMap().entrySet()){if(!e.getKey().equals("quantity")||e.getValue().length!=1){throw StockRequests.invalid(e.getKey());}}String s=r.getParameter("quantity");if(s==null){return null;}try{if(!s.matches("[1-9][0-9]{0,9}")){throw new IllegalArgumentException();}long q=Long.parseLong(s);if(q>1000000000){throw new IllegalArgumentException();}return (int)q;}catch(IllegalArgumentException e){throw StockRequests.invalid("quantity");}}
 static StockRequests.Query taxonomy(HttpServletRequest r){for(var e:r.getParameterMap().entrySet()){if(!Set.of("size","cursor").contains(e.getKey())){throw StockRequests.invalid(e.getKey());}}return StockRequests.query(r);}
}
