package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.ordering.api.Orders;
import com.narudzbine.organizations.api.Country;
import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.util.*;
final class OrderHistoryRequests {
 record Filters(String state,UUID partner,LocalDate from,LocalDate to){
  Orders.Filter bounds(Country country){var zone=ZoneId.of(country==Country.RS?"Europe/Belgrade":"Europe/Sarajevo");return new Orders.Filter(state,partner,from==null?null:from.atStartOfDay(zone).toInstant(),to==null?null:to.plusDays(1).atStartOfDay(zone).toInstant());}
 }
 record Query(int size,String cursor,Filters filters){}
 static Query query(HttpServletRequest r,boolean events){
  var allowed=events?Set.of("size","cursor"):Set.of("size","cursor","state","partnerId","from","to");
  for(var e:r.getParameterMap().entrySet()){if(!allowed.contains(e.getKey())||e.getValue().length!=1){throw StockRequests.invalid(e.getKey());}}
  int size=25;String raw=r.getParameter("size");if(raw!=null){try{if(!raw.matches("[1-9][0-9]{0,2}")){throw new IllegalArgumentException();}size=Integer.parseInt(raw);if(size>100){throw new IllegalArgumentException();}}catch(IllegalArgumentException e){throw StockRequests.invalid("size");}}
  String cursor=r.getParameter("cursor");if(cursor!=null&&(cursor.isEmpty()||cursor.length()>2048)){throw StockRequests.invalid("cursor");}
  String state=r.getParameter("state");if(state!=null&&!Set.of("AWAITING_ACCEPTANCE","ACCEPTED","DISPATCHED","DELIVERED","REJECTED","CANCELLED").contains(state)){throw StockRequests.invalid("state");}
  String partner=r.getParameter("partnerId");UUID id=partner==null?null:ContactRequests.id(partner,"QUERY","partnerId");LocalDate from=date(r,"from"),to=date(r,"to");if(from!=null&&to!=null&&from.isAfter(to)){throw StockRequests.invalid("to");}
  return new Query(size,cursor,new Filters(state,id,from,to));
 }
 private static LocalDate date(HttpServletRequest r,String field){String value=r.getParameter(field);if(value==null){return null;}try{if(!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")||value.startsWith("0000")){throw new IllegalArgumentException();}return LocalDate.parse(value);}catch(RuntimeException e){throw StockRequests.invalid(field);}}
}
