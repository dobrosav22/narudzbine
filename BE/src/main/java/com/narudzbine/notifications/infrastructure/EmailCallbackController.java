package com.narudzbine.notifications.infrastructure;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@ConditionalOnProperty(name="notifications.email-webhook.enabled",havingValue="true")
public final class EmailCallbackController {
    private final EmailCallbacks callbacks;
    public EmailCallbackController(EmailCallbacks callbacks){this.callbacks=callbacks;}
    @PostMapping("/api/v1/provider-callbacks/email")
    ResponseEntity<?> receive(HttpServletRequest request,jakarta.servlet.http.HttpServletResponse response)throws IOException {
        try{
            if(request.getQueryString()!=null||request.getContentType()==null||!request.getContentType().matches("(?i)application/json(?:;\\s*charset=utf-8)?")||request.getContentLengthLong()>65536)throw new EmailCallbacks.Rejected();
            var values=new HashMap<String,String>();for(String name:List.of("svix-id","svix-timestamp","svix-signature")){var headers=Collections.list(request.getHeaders(name));if(headers.size()!=1)throw new EmailCallbacks.Rejected();values.put(name,headers.getFirst());}
            callbacks.receive(values.get("svix-id"),values.get("svix-timestamp"),values.get("svix-signature"),request.getInputStream().readNBytes(65537));return ResponseEntity.ok(Map.of("accepted",true));
        }catch(EmailCallbacks.Rejected invalid){return problem(403,"FORBIDDEN",response);}
        catch(org.springframework.dao.DataAccessException|org.springframework.transaction.TransactionException deferred){return problem(503,"SERVICE_UNAVAILABLE",response);}
    }
    private ResponseEntity<?> problem(int status,String code,jakarta.servlet.http.HttpServletResponse response){return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(Map.of("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT),"title","Callback could not be completed","status",status,"code",code,"requestId",Optional.ofNullable(response.getHeader("X-Request-Id")).orElse(""),"errors",List.of()));}
}
