package com.narudzbine.identity.infrastructure.web;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
final class ReconciliationRequests {
 record Raw(UUID productId,String expectedRevision,int availableCount){}
 record Batch(String expected,List<Raw> lines){}
 static Batch batch(HttpServletRequest r)throws IOException{var b=AuthRequests.object(r,Set.of("expectedRevision","lines"),65536);String expected=ContactRequests.revision(b);var a=b.path("lines");if(!a.isArray()||a.size()<1||a.size()>100){throw invalid("/lines");}var lines=new ArrayList<Raw>();var seen=new HashSet<UUID>();for(int i=0;i<a.size();i++){var n=a.get(i);String path="/lines/"+i;if(!n.isObject()||!n.propertyNames().equals(Set.of("productId","expectedRevision","availableCount"))){throw invalid(path);}UUID product=ContactRequests.id(n.path("productId").isString()?n.path("productId").asString():null,"BODY",path+"/productId");if(!seen.add(product)){throw invalid(path+"/productId");}String revision;try{revision=ContactRequests.revision(n);}catch(AuthHttpFailure failure){throw invalid(path+"/expectedRevision");}var count=n.path("availableCount");if(!count.isNumber()||!count.toString().matches("0|[1-9][0-9]{0,9}")){throw invalid(path+"/availableCount");}long value=Long.parseLong(count.toString());if(value>1000000000){throw invalid(path+"/availableCount");}lines.add(new Raw(product,revision,(int)value));}lines.sort(Comparator.comparing(x->x.productId().toString()));return new Batch(expected,List.copyOf(lines));}
 static String confirmation(HttpServletRequest r)throws IOException{var b=AuthRequests.object(r,Set.of("expectedRevision","confirmAll"));if(!b.path("confirmAll").isBoolean()||!b.path("confirmAll").asBoolean()){throw invalid("/confirmAll");}return ContactRequests.revision(b);}
 static StockRequests.Query query(HttpServletRequest r){if(r.getParameterMap().containsKey("productId")){throw StockRequests.invalid("productId");}return StockRequests.query(r);}
 private static AuthHttpFailure invalid(String field){return new AuthHttpFailure(422,"VALIDATION_FAILED",field);}
}
