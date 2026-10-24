package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.notifications.api.Inbox;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
final class InboxRequests {
 static Input input(HttpServletRequest r)throws IOException{
  var body=AuthRequests.object(r,Set.of("expectedRevision","events"));String expected=ContactRequests.revision(body);
  var array=body.path("events");if(!array.isArray()||array.size()>6)throw invalid("/events");var result=new ArrayList<Inbox.Preference>();var seen=EnumSet.noneOf(Inbox.Event.class);
  for(int i=0;i<array.size();i++){
   var item=array.get(i);String path="/events/"+i;if(!item.isObject()||item.size()!=4||!item.has("event")||!item.has("inApp")||!item.has("email")||!item.has("push"))throw invalid(path);
   Inbox.Event event;try{if(!item.path("event").isString())throw new IllegalArgumentException();event=Inbox.Event.valueOf(item.path("event").asString());}catch(IllegalArgumentException e){throw invalid(path+"/event");}
   if(!seen.add(event))throw invalid(path+"/event");for(String flag:List.of("inApp","email","push")){if(!item.path(flag).isBoolean())throw invalid(path+"/"+flag);}
   result.add(new Inbox.Preference(event,item.path("inApp").asBoolean(),item.path("email").asBoolean(),item.path("push").asBoolean()));
  }return new Input(expected,List.copyOf(result));
 }
 static Query query(HttpServletRequest r){
  for(var e:r.getParameterMap().entrySet()){if(!Set.of("size","cursor","unread").contains(e.getKey())||e.getValue().length!=1)throw StockRequests.invalid(e.getKey());}
  String value=r.getParameter("size");int size=25;if(value!=null){try{if(!value.matches("[1-9][0-9]{0,2}"))throw new IllegalArgumentException();size=Integer.parseInt(value);if(size>100)throw new IllegalArgumentException();}catch(IllegalArgumentException e){throw StockRequests.invalid("size");}}
  String cursor=r.getParameter("cursor");if(cursor!=null&&(cursor.isEmpty()||cursor.length()>2048))throw StockRequests.invalid("cursor");
  String unread=r.getParameter("unread");if(unread!=null&&!Set.of("true","false").contains(unread))throw StockRequests.invalid("unread");return new Query(size,cursor,unread==null?null:Boolean.valueOf(unread));
 }
 private static AuthHttpFailure invalid(String path){return new AuthHttpFailure(422,"VALIDATION_FAILED",path);}
 record Input(String expected,List<Inbox.Preference> events){}
 record Query(int size,String cursor,Boolean unread){}
}
