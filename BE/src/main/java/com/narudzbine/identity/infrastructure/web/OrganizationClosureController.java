package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.application.OrganizationClosureService;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class OrganizationClosureController {
 private final OrganizationClosureService closure;private final SessionTransportPolicy policy;private final ResourceRevisions revisions;
 OrganizationClosureController(OrganizationClosureService closure,SessionTransportPolicy policy,ResourceRevisions revisions){this.closure=closure;this.policy=policy;this.revisions=revisions;}
 @PostMapping("/api/v1/organization/closure") ResponseEntity<OrganizationController.Result> own(HttpServletRequest r)throws IOException{AuthController.noQuery(r);var input=AdministrativeDirectoryRequests.staff(r);var s=policy.select(r);String csrf=s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;var item=closure.close(s.secret(),s.transport(),csrf,null,input.revision(),input.reason(),false);var response=ResponseEntity.ok();if(s.transport()==SessionTransport.BROWSER)response.header("Set-Cookie",policy.clearCookie().toString());return response.body(OrganizationResponses.response(item,revisions));}
 @PostMapping("/api/v1/admin/organizations/{organizationId}/close") OrganizationController.Result administrative(@PathVariable String organizationId,HttpServletRequest r)throws IOException{AuthController.noQuery(r);var org=ContactRequests.id(organizationId,"PATH","organizationId");var input=AdministrativeDirectoryRequests.staff(r);var s=policy.select(r);String csrf=s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;return OrganizationResponses.response(closure.close(s.secret(),s.transport(),csrf,org,input.revision(),input.reason(),true),revisions);}
}
