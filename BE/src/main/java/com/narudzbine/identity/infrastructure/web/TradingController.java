package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.identity.application.TradingSessionService;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name={"identity.http.enabled","identity.setup.http.enabled"},havingValue="true")
public final class TradingController {
    private final TradingSessionService service;private final SessionTransportPolicy policy;private final ResourceRevisions revisions;
    TradingController(TradingSessionService service,SessionTransportPolicy policy,ResourceRevisions revisions){this.service=service;this.policy=policy;this.revisions=revisions;}
    @PostMapping("/invitations/trading/acceptance")
    Relationship accept(HttpServletRequest request)throws IOException{AuthController.noQuery(request);var selected=policy.select(request);var body=AuthRequests.object(request,Set.of("token"));String capability=body.path("token").isString()?body.path("token").asString():"";if(!capability.matches("[A-Za-z0-9_-]{43}")){throw new AuthHttpFailure(422,"VALIDATION_FAILED","/token");}return response(service.accept(selected.secret(),selected.transport(),selected.transport()==com.narudzbine.identity.api.SessionTransport.BROWSER?AuthController.csrfHeader(request):null,capability));}
    @PostMapping("/admin/connections")
    org.springframework.http.ResponseEntity<Relationship> connect(HttpServletRequest request)throws IOException{
        AuthController.noQuery(request);var selected=policy.select(request);var body=AuthRequests.object(request,Set.of("vendorId","buyerId","reason"));
        var result=service.adminConnect(selected.secret(),selected.transport(),csrf(request,selected),ContactRequests.id(text(body,"vendorId",36),"BODY","/vendorId"),ContactRequests.id(text(body,"buyerId",36),"BODY","/buyerId"),text(body,"reason",1000));
        return org.springframework.http.ResponseEntity.status(201).header("Location","/api/v1/relationships/"+result.id()).body(response(result));
    }
    @PostMapping("/relationships/{relationshipId}/disconnect")
    Relationship disconnect(@PathVariable String relationshipId,HttpServletRequest request)throws IOException{return disconnect(relationshipId,request,false);}
    @PostMapping("/admin/relationships/{relationshipId}/disconnect")
    Relationship adminDisconnect(@PathVariable String relationshipId,HttpServletRequest request)throws IOException{return disconnect(relationshipId,request,true);}
    private Relationship disconnect(String id,HttpServletRequest request,boolean administrative)throws IOException{
        AuthController.noQuery(request);var selected=policy.select(request);var body=AuthRequests.object(request,Set.of("expectedRevision","reason"));
        return response(service.disconnect(selected.secret(),selected.transport(),csrf(request,selected),ContactRequests.id(id,"PATH","relationshipId"),ContactRequests.revision(body),text(body,"reason",1000),administrative));
    }
    private static String csrf(HttpServletRequest request,SessionTransportPolicy.Selected selected){return selected.transport()==com.narudzbine.identity.api.SessionTransport.BROWSER?AuthController.csrfHeader(request):null;}
    private static String text(tools.jackson.databind.JsonNode body,String field,int max){var errors=new ArrayList<AuthErrors.FieldError>();String value=OrganizationRequests.text(body,field,"",max,false,errors);if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}return value;}
    @GetMapping("/partners/{organizationId}")
    Partner partner(@PathVariable String organizationId,HttpServletRequest request){
        AuthController.noBody(request);AuthController.noQuery(request);var selected=policy.select(request);
        var p=service.partner(selected.secret(),selected.transport(),ContactRequests.id(organizationId,"PATH","organizationId"));
        var c=p.businessContact();return new Partner(p.id(),p.displayName(),p.legalName(),p.country(),p.currency(),p.registrationIdentifier(),p.taxIdentifier(),c==null?null:new PartnerContact(c.name(),c.phone(),c.email()),p.relationshipId(),p.relationshipState());
    }
    record PartnerContact(String name,String phone,String email){}
    record Partner(UUID id,String displayName,String legalName,String country,String currency,String registrationIdentifier,String taxIdentifier,PartnerContact businessContact,UUID relationshipId,String relationshipState){}
    @GetMapping("/relationships/{relationshipId}")
    Relationship get(@PathVariable String relationshipId,HttpServletRequest request){AuthController.noBody(request);AuthController.noQuery(request);var selected=policy.select(request);return response(service.get(selected.secret(),selected.transport(),ContactRequests.id(relationshipId,"PATH","relationshipId")));}
    @GetMapping("/relationships")
    Page list(HttpServletRequest request){AuthController.noBody(request);for(var entry:request.getParameterMap().entrySet()){if(!Set.of("page","size","includeTotal","state").contains(entry.getKey())||entry.getValue().length!=1){throw query(entry.getKey());}}
        int page=number(request,"page",0,0,10000),size=number(request,"size",25,1,100);String total=request.getParameter("includeTotal"),state=request.getParameter("state");if(total!=null&&!Set.of("true","false").contains(total)){throw query("includeTotal");}if(state!=null&&!Set.of("ACTIVE","DISCONNECTED").contains(state)){throw query("state");}var selected=policy.select(request);var result=service.list(selected.secret(),selected.transport(),page,size,state,"true".equals(total));return new Page(result.items().stream().map(this::response).toList(),page,size,result.total());}
    private Relationship response(TradingConnections.View r){return new Relationship(r.id(),revisions.encode("relationship/v1",r.id(),r.revision()),r.vendorId(),r.buyerId(),r.country(),r.state(),r.disconnectedReason(),r.confirmationRequired(),AccountResponses.time(r.createdAt()),AccountResponses.time(r.updatedAt()));}
    private static int number(HttpServletRequest request,String key,int fallback,int min,int max){String value=request.getParameter(key);if(value==null){return fallback;}try{if(!value.matches("0|[1-9][0-9]{0,5}")){throw new IllegalArgumentException();}int n=Integer.parseInt(value);if(n<min||n>max){throw new IllegalArgumentException();}return n;}catch(IllegalArgumentException ex){throw query(key);}}
    private static AuthHttpFailure query(String key){return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",key,"INVALID_VALUE")));}
    record Relationship(UUID id,String revision,UUID vendorId,UUID buyerId,String country,String state,String disconnectedReason,boolean agreedPriceConfirmationRequired,String createdAt,String updatedAt){}
    record Page(List<Relationship> items,int page,int size,Long total){}
}
