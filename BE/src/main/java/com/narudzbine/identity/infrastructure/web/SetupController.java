package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.organizations.api.OrganizationRecord;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name={"identity.http.enabled","identity.setup.http.enabled"},havingValue="true")
public final class SetupController {
    private final SetupInvitationService invitations;
    private final OrganizationSetupService setup;
    private final SessionTransportPolicy policy;
    private final SupportedLocales locales;
    private final ResourceRevisions revisions;
    private final AccountRevisions accountRevisions;
    SetupController(SetupInvitationService invitations,OrganizationSetupService setup,SessionTransportPolicy policy,SupportedLocales locales,ResourceRevisions revisions,AccountRevisions accountRevisions){this.invitations=invitations;this.setup=setup;this.policy=policy;this.locales=locales;this.revisions=revisions;this.accountRevisions=accountRevisions;}
    @PostMapping("/admin/setup-invitations")
    ResponseEntity<Invitation> invite(HttpServletRequest request)throws IOException{
        AuthController.noQuery(request);var selected=policy.select(request);String csrf=csrf(request,selected);
        var body=AuthRequests.object(request,Set.of("recipientEmail","country","type","planRevisionId","reason"));String recipient=LoginInput.email(text(body,"recipientEmail",254)),country=text(body,"country",2),type=text(body,"type",6);
        if(!Set.of("RS","BA").contains(country)||!Set.of("BUYER","VENDOR").contains(type)){throw invalid("");}
        if(!body.has("planRevisionId")){throw invalid("planRevisionId");}UUID plan=body.path("planRevisionId").isNull()?null:ContactRequests.id(text(body,"planRevisionId",36),"BODY","/planRevisionId");
        if(type.equals("VENDOR")!=(plan!=null)){throw invalid("planRevisionId");}
        var result=invitations.invite(selected.secret(),selected.transport(),csrf,recipient,country,type,plan,text(body,"reason",1000));
        return ResponseEntity.status(result.replay()?200:201).header("Location","/api/v1/invitations/"+result.invitation().id()).body(invitation(result.invitation()));
    }
    @GetMapping("/invitations/{invitationId}")
    Invitation get(@PathVariable String invitationId,HttpServletRequest request){AuthController.noQuery(request);AuthController.noBody(request);var selected=policy.select(request);return invitation(invitations.get(selected.secret(),selected.transport(),ContactRequests.id(invitationId,"PATH","invitationId")));}
    @DeleteMapping("/invitations/{invitationId}")
    ResponseEntity<Void> revoke(@PathVariable String invitationId,HttpServletRequest request){AuthController.noQuery(request);AuthController.noBody(request);var selected=policy.select(request);invitations.revoke(selected.secret(),selected.transport(),csrf(request,selected),ContactRequests.id(invitationId,"PATH","invitationId"));return ResponseEntity.noContent().build();}
    @PostMapping("/invitations/{invitationId}/resends")
    Invitation resend(@PathVariable String invitationId,HttpServletRequest request)throws IOException{AuthController.noQuery(request);var selected=policy.select(request);UUID key=key(request);return invitation(invitations.resend(selected.secret(),selected.transport(),csrf(request,selected),ContactRequests.id(invitationId,"PATH","invitationId"),ContactRequests.revisionCommand(request),key));}
    @PostMapping("/invitations/email-proofs")
    ResponseEntity<Acknowledgement> proof(HttpServletRequest request)throws IOException{AuthController.noQuery(request);publicTransport(request);var body=AuthRequests.object(request,Set.of("token"));invitations.requestProof(token(body,"token"),request.getRemoteAddr());return ResponseEntity.accepted().body(new Acknowledgement(true));}
    @PostMapping("/setup/organizations")
    ResponseEntity<OrganizationController.Result> complete(HttpServletRequest request)throws IOException{
        AuthController.noQuery(request);publicTransport(request);var body=AuthRequests.object(request,Set.of("token","emailProof","password","ownerDisplayName","displayName","legalName","registrationIdentifier","taxIdentifier","registeredAddress","defaultLanguage"));
        String password=body.path("password").isString()?body.path("password").asString():null;try{LoginInput.password(password);}catch(IllegalArgumentException ex){throw invalid("password");}
        String registration=identifier(body,"registrationIdentifier",false),tax=identifier(body,"taxIdentifier",true);var errors=new ArrayList<AuthErrors.FieldError>();var address=OrganizationRequests.address(body.path("registeredAddress"),"/registeredAddress",errors);if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}
        String language;try{language=locales.canonical(text(body,"defaultLanguage",64));}catch(IllegalArgumentException ex){throw invalid("defaultLanguage");}
        var values=new OrganizationSetupService.Values(text(body,"ownerDisplayName",100),text(body,"displayName",200),text(body,"legalName",200),registration,tax,address,language);
        var result=setup.complete(token(body,"token"),token(body,"emailProof"),password,values,request.getRemoteAddr());OrganizationRecord o=result.organization();
        return ResponseEntity.status(result.replay()?200:201).header("Location","/api/v1/organization").body(new OrganizationController.Result(o.id(),revisions.encode("organization/v1",o.id(),o.revision()),o.displayName(),o.legalName(),o.type().name(),o.country().name(),o.currency(),o.registrationIdentifier(),o.taxIdentifier(),o.registeredAddress(),o.defaultLanguage(),o.state(),o.staffSubmissionRestricted(),o.partnerContactId(),o.ownerAccountId(),AccountResponses.time(o.createdAt()),AccountResponses.time(o.updatedAt())));
    }
    @PostMapping("/invitations/buyers")
    ResponseEntity<Invitation> inviteBuyer(HttpServletRequest request)throws IOException{AuthController.noQuery(request);var selected=policy.select(request);var body=AuthRequests.object(request,Set.of("recipientEmail","buyerOrganizationId"));if(!body.has("buyerOrganizationId")){throw invalid("buyerOrganizationId");}UUID buyer=body.path("buyerOrganizationId").isNull()?null:ContactRequests.id(text(body,"buyerOrganizationId",36),"BODY","/buyerOrganizationId");var result=invitations.inviteBuyer(selected.secret(),selected.transport(),csrf(request,selected),LoginInput.email(text(body,"recipientEmail",254)),buyer);return ResponseEntity.status(result.replay()?200:201).header("Location","/api/v1/invitations/"+result.invitation().id()).body(invitation(result.invitation()));}
    @PostMapping("/invitations/members")
    ResponseEntity<Invitation> inviteMember(HttpServletRequest request)throws IOException{
        AuthController.noQuery(request);var selected=policy.select(request);var body=AuthRequests.object(request,Set.of("recipientEmail","role"));String role=text(body,"role",5);if(!Set.of("ADMIN","STAFF").contains(role)){throw invalid("role");}
        var result=invitations.inviteMember(selected.secret(),selected.transport(),csrf(request,selected),LoginInput.email(text(body,"recipientEmail",254)),role);
        return ResponseEntity.status(result.replay()?200:201).header("Location","/api/v1/invitations/"+result.invitation().id()).body(invitation(result.invitation()));
    }
    @GetMapping("/invitations")
    Page list(HttpServletRequest request){AuthController.noBody(request);Set<String> allowed=Set.of("page","size","includeTotal","state");for(var entry:request.getParameterMap().entrySet()){if(!allowed.contains(entry.getKey())||entry.getValue().length!=1){throw queryError(entry.getKey());}}
        int page=number(request,"page",0,0,10000),size=number(request,"size",25,1,100);String total=request.getParameter("includeTotal"),state=request.getParameter("state");
        if(total!=null&&!Set.of("true","false").contains(total)){throw queryError("includeTotal");}if(state!=null&&!Set.of("PENDING","ACCEPTED","REVOKED","EXPIRED","SUPERSEDED").contains(state)){throw queryError("state");}
        var selected=policy.select(request);var result=invitations.list(selected.secret(),selected.transport(),page,size,state,"true".equals(total));return new Page(result.items().stream().map(SetupController::invitation).toList(),page,size,result.total());
    }
    @PostMapping("/setup/members")
    ResponseEntity<AccountResponses.Account> completeMember(HttpServletRequest request)throws IOException{
        AuthController.noQuery(request);publicTransport(request);var body=AuthRequests.object(request,Set.of("token","emailProof","password","displayName"));String password=body.path("password").isString()?body.path("password").asString():null;try{LoginInput.password(password);}catch(IllegalArgumentException ex){throw invalid("password");}
        var result=setup.completeMember(token(body,"token"),token(body,"emailProof"),password,text(body,"displayName",100),request.getRemoteAddr());var m=result.member();String at=AccountResponses.time(m.createdAt());
        return ResponseEntity.status(result.replay()?200:201).header("Location","/api/v1/me").body(new AccountResponses.Account(m.id(),accountRevisions.encode(m.id(),1),m.organizationId(),"BUSINESS",m.email(),m.displayName(),m.role(),"ACTIVE",null,null,at,at));
    }
    private static int number(HttpServletRequest request,String name,int fallback,int min,int max){String value=request.getParameter(name);if(value==null){return fallback;}try{if(!value.matches("0|[1-9][0-9]{0,5}")){throw new IllegalArgumentException();}int parsed=Integer.parseInt(value);if(parsed<min||parsed>max){throw new IllegalArgumentException();}return parsed;}catch(IllegalArgumentException ex){throw queryError(name);}}
    private static AuthHttpFailure queryError(String name){return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",name,"INVALID_VALUE")));}
    record Page(List<Invitation> items,int page,int size,Long total){}
    private void publicTransport(HttpServletRequest request){if(request.getHeaders("Authorization").hasMoreElements()){throw new SessionTransportPolicy.AmbiguousTransport();}if(request.getCookies()!=null){for(var c:request.getCookies()){if(c.getName().equals(SessionTransportPolicy.COOKIE_NAME)){throw new SessionTransportPolicy.AmbiguousTransport();}}}if(request.getHeaders("Origin").hasMoreElements()){policy.requireBrowserOrigin(request);}else{policy.requireNativeOrigin(request);}}
    private static UUID key(HttpServletRequest request){var values=Collections.list(request.getHeaders("Idempotency-Key"));if(values.size()!=1){throw new AuthHttpFailure(400,"MALFORMED_REQUEST");}try{UUID key=UUID.fromString(values.getFirst());if(key.version()!=4||key.variant()!=2||!key.toString().equals(values.getFirst())){throw new IllegalArgumentException();}return key;}catch(IllegalArgumentException ex){throw new AuthHttpFailure(422,"VALIDATION_FAILED");}}
    private static String csrf(HttpServletRequest request,SessionTransportPolicy.Selected selected){return selected.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(request):null;}
    private static String token(JsonNode body,String name){String token=body.path(name).isString()?body.path(name).asString():"";if(!token.matches("[A-Za-z0-9_-]{43}")){throw invalid(name);}return token;}
    private static String identifier(JsonNode body,String name,boolean nullable){if(body.has(name)&&nullable&&body.path(name).isNull()){return null;}String value=text(body,name,64);if(!value.matches("[A-Za-z0-9/-]{1,64}")){throw invalid(name);}return value;}
    private static String text(JsonNode body,String name,int max){var errors=new ArrayList<AuthErrors.FieldError>();String value=OrganizationRequests.text(body,name,"",max,false,errors);if(!errors.isEmpty()){throw new AuthHttpFailure(errors);}return value;}
    private static AuthHttpFailure invalid(String name){return new AuthHttpFailure(422,"VALIDATION_FAILED","/"+name);}
    private static Invitation invitation(SetupInvitationStore.Invitation i){return new Invitation(i.id(),i.revision(),i.purpose(),i.recipientEmail(),i.targetOrganizationId(),i.state(),i.deliveryState(),AccountResponses.time(i.expiresAt()),AccountResponses.time(i.createdAt()),AccountResponses.time(i.updatedAt()));}
    record Invitation(UUID id,String revision,String purpose,String recipientEmail,UUID targetOrganizationId,String state,String deliveryState,String expiresAt,String createdAt,String updatedAt){}
    record Acknowledgement(boolean accepted){}
}
