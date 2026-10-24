package com.narudzbine.identity.application;

import com.narudzbine.identity.api.*;
import com.narudzbine.organizations.api.*;
import com.narudzbine.ordering.api.Orders;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.subscriptions.api.VendorPlans;
import com.narudzbine.audit.api.*;
import com.narudzbine.notifications.api.RelationshipNotices;
import com.narudzbine.shared.api.ResourceRevisions;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Permanent membership and scoped closure; provider reconciliation remains outside this transaction. */
@Service
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class OrganizationClosureService {
 private final JdbcTemplate jdbc;private final SessionService sessions;private final LoginThrottle throttle;private final OrganizationSettings organizations;private final OrganizationLifecycle lifecycle;private final Orders orders;private final TradingConnections trading;private final VendorPlans plans;private final RelationshipNotices notices;private final SetupAudit invitations;private final TransferAudit transfers;private final AdministrativeAudit administrative;private final ResourceRevisions revisions;private final Clock clock;private final TransactionTemplate tx;
 public OrganizationClosureService(JdbcTemplate jdbc,SessionService sessions,LoginThrottle throttle,OrganizationSettings organizations,OrganizationLifecycle lifecycle,Orders orders,TradingConnections trading,VendorPlans plans,RelationshipNotices notices,SetupAudit invitations,TransferAudit transfers,AdministrativeAudit administrative,ResourceRevisions revisions,Clock clock,PlatformTransactionManager manager){this.jdbc=jdbc;this.sessions=sessions;this.throttle=throttle;this.organizations=organizations;this.lifecycle=lifecycle;this.orders=orders;this.trading=trading;this.plans=plans;this.notices=notices;this.invitations=invitations;this.transfers=transfers;this.administrative=administrative;this.revisions=revisions;this.clock=clock;tx=new TransactionTemplate(manager);tx.setTimeout(10);}
 public OrganizationRecord close(String token,SessionTransport transport,String csrf,UUID target,String expected,String reason,boolean platform){
  LoginThrottle.requireNoTransaction();var routing=tx.execute(status->{UUID actor=sessions.replayAdmissionAccount(token,transport);if(platform){if(!sessions.isPlatformAccount(actor))throw denied();return new Routing(actor,target);}var own=sessions.replayAdmissionBusiness(token,transport);return new Routing(actor,own.organization());});
  throttle.admitApi(routing.actor(),true);
  for(int attempt=0;attempt<3;attempt++)try{return tx.execute(status->closeLocked(token,transport,csrf,routing,expected,reason,platform));}catch(RuntimeException failure){if(attempt==2||!definiteRollback(failure))throw failure;}
  throw new IllegalStateException("Unreachable closure attempt");
 }
 private OrganizationRecord closeLocked(String token,SessionTransport transport,String csrf,Routing route,String expected,String reason,boolean platform){
  Set<UUID> guards=partners(route.organization());lockOrganizations(guards);if(!guards.containsAll(partners(route.organization())))throw new RoutingChanged();
  if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM organization WHERE id=?)",Boolean.class,route.organization())))throw new OrganizationAdministrationFailure("NOT_FOUND");
  jdbc.queryForList("SELECT a.id FROM account_identity a LEFT JOIN business_account b ON b.id=a.id WHERE a.id=? OR b.organization_id=? ORDER BY a.id FOR UPDATE OF a",UUID.class,route.actor(),route.organization());
  var principal=sessions.authenticate(token,transport);if(!principal.accountId().equals(route.actor())||principal.platformAdministrator()!=platform)throw denied();
  if(transport==SessionTransport.BROWSER)sessions.requireCsrf(token,csrf);
  var old=organizations.read(route.organization());if(!platform&&!old.ownerAccountId().equals(route.actor()))throw new BusinessAccessDenied(BusinessAccessDenied.Reason.CAPABILITY_DENIED);
  if(!revisions.matches("organization/v1",old.id(),old.revision(),expected))throw new RevisionConflict(revisions.encode("organization/v1",old.id(),old.revision()));
  if(old.state().equals("CLOSED")){sessions.recordSuccessfulActivity(token,transport);return old;}
  if(orders.hasNonterminal(old.id()))throw new OrganizationAdministrationFailure("NONTERMINAL_ORDERS");
  sessions.recordSuccessfulActivity(token,transport);
  for(var link:trading.activeConnections(old.id())){var changed=trading.disconnect(old.id(),link.id(),"Organization closed",route.actor());notices.disconnected(changed.id(),changed.revision(),changed.vendorId(),changed.buyerId(),route.actor(),changed.updatedAt());}
  retireInvitations(route.actor(),old.id());retireTransfers(route.actor(),old,platform);if(old.type()==OrganizationType.VENDOR)plans.supersedeForClosure(route.actor(),old.id());
  var result=lifecycle.close(route.actor(),old.id(),reason,platform);sessions.revokeOrganizationSessions(old.id());return result;
 }
 private Set<UUID> partners(UUID org){var result=new HashSet<UUID>();result.add(org);for(var c:trading.activeConnections(org)){result.add(c.vendorId());result.add(c.buyerId());}result.addAll(jdbc.queryForList("SELECT CASE WHEN organization_id=? THEN buyer_id ELSE organization_id END FROM setup_invitation WHERE purpose='TRADING' AND state='PENDING' AND(organization_id=? OR buyer_id=?)",UUID.class,org,org,org));return result;}
 private void lockOrganizations(Set<UUID> ids){var ordered=ids.stream().map(UUID::toString).sorted().toArray();jdbc.execute((ConnectionCallback<Void>)c->{var array=c.createArrayOf("uuid",ordered);try(var q=c.prepareStatement("SELECT id FROM organization WHERE id=ANY(?) ORDER BY id FOR UPDATE")){q.setArray(1,array);try(var r=q.executeQuery()){while(r.next()){r.getObject(1);}}}finally{array.free();}return null;});}
 private void retireInvitations(UUID actor,UUID org){for(UUID id:jdbc.queryForList("SELECT id FROM setup_invitation WHERE state='PENDING' AND(organization_id=? OR buyer_id=?) ORDER BY id FOR UPDATE",UUID.class,org,org)){jdbc.update("UPDATE setup_invitation SET state='REVOKED',revision=revision+1,updated_at=? WHERE id=?",time(),id);jdbc.update("UPDATE setup_email_proof SET state='INVALIDATED' WHERE invitation_id=? AND state IN('ACTIVE','USED')",id);invitations.setup(actor,id,"SETUP_REVOKED","Organization closed");}}
 private void retireTransfers(UUID actor,OrganizationRecord org,boolean platform){for(var row:jdbc.queryForList("UPDATE ownership_transfer SET state=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'INVALIDATED' END,revision=revision+1,updated_at=? WHERE organization_id=? AND state='PENDING' RETURNING id,state",time(),time(),org.id())){UUID id=(UUID)row.get("id");boolean expired=row.get("state").equals("EXPIRED");if(platform)administrative.transfer(actor,org.id(),org.country().name(),id,expired,"Organization closed");else transfers.changed(actor,id,expired?TransferAudit.Action.TRANSFER_EXPIRED:TransferAudit.Action.TRANSFER_INVALIDATED);}}
 private Timestamp time(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));}
 private static OrganizationAdministrationFailure denied(){return new OrganizationAdministrationFailure("NOT_FOUND");}
 private static boolean definiteRollback(Throwable failure){for(Throwable e=failure;e!=null;e=e.getCause()){if(e instanceof RoutingChanged)return true;if(e instanceof SQLException sql&&sql.getSQLState()!=null&&Set.of("40P01","40001").contains(sql.getSQLState()))return true;}return false;}
 private static final class RoutingChanged extends org.springframework.dao.CannotAcquireLockException{RoutingChanged(){super("Closure routing changed; no effects committed");}}
 private record Routing(UUID actor,UUID organization){}
}
