package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.notifications.api.*;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.MembershipAccess;
import com.narudzbine.shared.api.ResourceRevisions;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.*;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/me")
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class InboxController {
 private final Inbox inbox;private final SessionService sessions;private final SessionTransportPolicy policy;private final LoginThrottle throttle;private final ResourceRevisions revisions;private final MembershipAccess members;private final InboxCursors cursors;private final Clock clock;private final TransactionTemplate tx;
 InboxController(Inbox inbox,SessionService sessions,SessionTransportPolicy policy,LoginThrottle throttle,ResourceRevisions revisions,MembershipAccess members,InboxCursors cursors,Clock clock,PlatformTransactionManager manager){this.inbox=inbox;this.sessions=sessions;this.policy=policy;this.throttle=throttle;this.revisions=revisions;this.members=members;this.cursors=cursors;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 @GetMapping("/notification-preferences") Preferences preferences(HttpServletRequest r){AuthController.noQuery(r);AuthController.noBody(r);var selected=policy.select(r);admit(selected,false);return tx.execute(s->{var account=scope(selected,null,false);var result=preferences(inbox.preferences(account.id()));activity(selected);return result;});}
 @PutMapping("/notification-preferences") Preferences update(HttpServletRequest r)throws IOException{AuthController.noQuery(r);var selected=policy.select(r);String csrf=csrf(r,selected);var input=InboxRequests.input(r);admit(selected,true);return tx.execute(s->{var account=scope(selected,csrf,true);var current=inbox.preferences(account.id());if(!revisions.matches("preferences/v1",account.id(),current.revision(),input.expected()))throw new InboxFailure("REVISION_CONFLICT");var result=preferences(inbox.replace(account.id(),current.revision(),input.events()));activity(selected);return result;});}
 @GetMapping("/notifications") Page list(HttpServletRequest r){AuthController.noBody(r);var q=InboxRequests.query(r);var selected=policy.select(r);admit(selected,false);return tx.execute(s->{var account=scope(selected,null,false);var p=q.cursor()==null?null:cursors.decode(q.cursor(),"inbox",account.organization(),account.id(),q.unread(),q.size());var result=inbox.list(account.id(),q.size(),q.unread(),p==null?null:new Inbox.Position(p.at(),p.id()));String next=null;if(result.more()){var last=result.items().getLast();next=cursors.encode("inbox",account.organization(),account.id(),q.unread(),q.size(),new InboxCursors.Position(last.createdAt(),last.id(),p==null?clock.instant().plusSeconds(86400):p.expires()));}activity(selected);return new Page(result.items().stream().map(this::item).toList(),next);});}
 @PutMapping("/notifications/{notificationId}/read") Item read(@PathVariable String notificationId,HttpServletRequest r){AuthController.noQuery(r);AuthController.noBody(r);UUID id=ContactRequests.id(notificationId,"PATH","notificationId");var selected=policy.select(r);String csrf=csrf(r,selected);admit(selected,true);return tx.execute(s->{var account=scope(selected,csrf,true);var result=item(inbox.markRead(account.id(),id));activity(selected);return result;});}
 private Account scope(SessionTransportPolicy.Selected s,String csrf,boolean write){var p=write?sessions.authenticateForProfileWrite(s.secret(),s.transport()):sessions.authenticate(s.secret(),s.transport());if(write&&s.transport()==SessionTransport.BROWSER)sessions.requireCsrf(s.secret(),csrf);var m=members.lockForAuthorization(p.accountId());return new Account(p.accountId(),m.isEmpty()?null:m.get().organizationId());}
 private void admit(SessionTransportPolicy.Selected s,boolean write){var id=tx.execute(t->sessions.replayAdmissionAccount(s.secret(),s.transport()));throttle.admitApi(id,write);}
 private String csrf(HttpServletRequest r,SessionTransportPolicy.Selected s){return s.transport()==SessionTransport.BROWSER?AuthController.csrfHeader(r):null;}
 private void activity(SessionTransportPolicy.Selected s){sessions.recordSuccessfulActivity(s.secret(),s.transport());}
 private Preferences preferences(Inbox.Preferences p){return new Preferences(p.id(),revisions.encode("preferences/v1",p.id(),p.revision()),p.languageOverride(),p.events());}
 private Item item(Inbox.Item i){return new Item(i.id(),i.event(),i.orderId(),i.organizationId(),i.text(),i.read(),AccountResponses.time(i.createdAt()));}
 private record Account(UUID id,UUID organization){}
 record Preferences(UUID id,String revision,String languageOverride,List<Inbox.Preference> events){}
 record Item(UUID id,String event,UUID orderId,UUID organizationId,String text,boolean read,String createdAt){}
 record Page(List<Item> items,String nextCursor){}
}
