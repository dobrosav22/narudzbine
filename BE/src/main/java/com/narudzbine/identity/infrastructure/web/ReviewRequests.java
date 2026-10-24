package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.buyerworkspace.api.SharedDrafts;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
final class ReviewRequests {
 static Input input(HttpServletRequest r)throws IOException{
  var body=AuthRequests.object(r,Set.of("intent","draftId","draftRevision"),131072);for(String f:List.of("intent","draftId","draftRevision")){if(!body.has(f)){throw DraftRequests.invalid("/"+f);}}
  var intent=DraftRequests.intent(body.path("intent"));if(intent.lines().isEmpty()){throw DraftRequests.invalid("/intent/lines");}if(intent.deliveryLocationId()==null){throw DraftRequests.invalid("/intent/deliveryLocationId");}
  UUID draft=null;if(!body.path("draftId").isNull()){draft=ContactRequests.id(body.path("draftId").isString()?body.path("draftId").asString():null,"BODY","/draftId");}
  String revision=null;if(!body.path("draftRevision").isNull()){if(!body.path("draftRevision").isString()){throw DraftRequests.invalid("/draftRevision");}revision=body.path("draftRevision").asString();if(revision.isEmpty()||revision.length()>256){throw DraftRequests.invalid("/draftRevision");}}
  if((draft==null)!=(revision==null)){throw DraftRequests.invalid("/draftRevision");}return new Input(intent,draft,revision);
 }
 record Input(SharedDrafts.Intent intent,UUID draftId,String draftRevision){@Override public String toString(){return "ReviewInput[redacted]";}}
}
