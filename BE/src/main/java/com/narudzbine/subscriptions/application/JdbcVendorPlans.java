package com.narudzbine.subscriptions.application;
import com.narudzbine.subscriptions.api.*;
import com.narudzbine.audit.api.PlanAudit;
import com.narudzbine.shared.api.UuidGenerator;
import java.util.*;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcVendorPlans implements VendorPlans {
 private final JdbcTemplate jdbc;private final Clock clock;private final UuidGenerator ids;private final PlanAudit audit;
 public JdbcVendorPlans(JdbcTemplate jdbc,Clock clock,UuidGenerator ids,PlanAudit audit){this.jdbc=jdbc;this.clock=clock;this.ids=ids;this.audit=audit;}
 public Assignment current(UUID vendor){
  var rows=jdbc.queryForList("SELECT p.*,a.revision AS assignment_revision,(SELECT count(*) FROM catalogue_product_identity WHERE vendor_id=a.organization_id AND NOT archived) AS products,(SELECT count(*) FROM trading_relationship WHERE vendor_id=a.organization_id AND state='ACTIVE') AS buyers FROM organization_plan a JOIN plan_revision p ON p.id=a.plan_revision_id JOIN organization o ON o.id=a.organization_id AND o.type='VENDOR' WHERE a.organization_id=?",vendor);
  if(rows.isEmpty()){throw fail(PlanFailure.Reason.PLAN_REQUIRED);}var r=rows.getFirst();return new Assignment(vendor,number(r,"assignment_revision"),plan(r),Math.toIntExact(number(r,"products")),Math.toIntExact(number(r,"buyers")));
 }
 public Page<Plan> plans(int page,int size,boolean retired,boolean total){
  var rows=jdbc.queryForList("WITH filtered AS MATERIALIZED (SELECT * FROM plan_revision WHERE ? OR NOT retired),page AS (SELECT * FROM filtered ORDER BY code,revision DESC,id LIMIT ? OFFSET ?) SELECT p.*,t.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM filtered)t LEFT JOIN page p ON true ORDER BY p.code,p.revision DESC,p.id",retired,size,Math.multiplyExact(page,size),total);
  return new Page<>(rows.stream().filter(r->r.get("id")!=null).map(JdbcVendorPlans::plan).toList(),(Long)rows.getFirst().get("total"));
 }
 public Page<Request> requests(UUID vendor,int page,int size,String state,boolean total){
  var rows=jdbc.queryForList("WITH filtered AS MATERIALIZED (SELECT * FROM plan_change_request WHERE (?::uuid IS NULL OR vendor_id=?) AND (?::text IS NULL OR state=?)),page AS (SELECT * FROM filtered ORDER BY created_at DESC,id LIMIT ? OFFSET ?) SELECT p.*,t.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM filtered)t LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.id",vendor,vendor,state,state,size,Math.multiplyExact(page,size),total);
  return new Page<>(rows.stream().filter(r->r.get("id")!=null).map(JdbcVendorPlans::request).toList(),(Long)rows.getFirst().get("total"));
 }
 public Request request(UUID vendor,UUID id){var rows=jdbc.queryForList("SELECT * FROM plan_change_request WHERE id=? AND (?::uuid IS NULL OR vendor_id=?)",id,vendor,vendor);if(rows.isEmpty()){throw fail(PlanFailure.Reason.NOT_FOUND);}return request(rows.getFirst());}
 public Request create(UUID actor,UUID vendor,UUID target){
  var current=current(vendor);var pending=jdbc.queryForList("SELECT * FROM plan_change_request WHERE vendor_id=? AND state='PENDING'",vendor);
  if(!pending.isEmpty()){var prior=request(pending.getFirst());if(prior.requestedPlanRevisionId().equals(target)){return prior;}throw fail(PlanFailure.Reason.REQUEST_IN_PROGRESS);}
  available(target);if(current.plan().id().equals(target)){throw fail(PlanFailure.Reason.INVALID_STATE);}UUID id=ids.next();var now=now();jdbc.update("INSERT INTO plan_change_request(id,vendor_id,requested_plan_revision_id,state,created_at,updated_at) VALUES (?,?,?,'PENDING',?,?)",id,vendor,target,now,now);audit.plan(actor,id,"PLAN_REQUESTED",null);return request(vendor,id);
 }
 public void withdraw(UUID actor,UUID vendor,UUID id){var r=request(vendor,id);if(r.state().equals("WITHDRAWN")){return;}pending(r);transition(actor,r,"WITHDRAWN",null,"PLAN_WITHDRAWN");}
 public Assignment assign(UUID actor,UUID vendor,UUID target,String reason,boolean supersede){
  jdbc.queryForList("SELECT organization_id FROM organization_plan WHERE organization_id=? FOR UPDATE",UUID.class,vendor);var current=current(vendor);
  if(current.plan().id().equals(target)){return current;}Plan p=available(target);
  if(current.nonArchivedProductCount()>p.productLimit()||current.activeBuyerCount()>p.activeBuyerLimit()){throw fail(PlanFailure.Reason.PLAN_LIMIT_EXCEEDED);}
  jdbc.update("UPDATE organization_plan SET plan_revision_id=?,revision=revision+1 WHERE organization_id=?",target,vendor);audit.plan(actor,vendor,"PLAN_ASSIGNED",reason);
  if(supersede){for(var row:jdbc.queryForList("SELECT * FROM plan_change_request WHERE vendor_id=? AND state='PENDING'",vendor)){transition(actor,request(row),"SUPERSEDED","Superseded by direct plan assignment","PLAN_SUPERSEDED");}}
  return current(vendor);
 }
 public Request resolve(UUID actor,UUID vendor,UUID id,boolean approve,String reason){var r=request(vendor,id);String desired=approve?"APPROVED":"REJECTED";if(r.state().equals(desired)){return r;}pending(r);
  if(approve){available(r.requestedPlanRevisionId());assign(actor,vendor,r.requestedPlanRevisionId(),reason,false);}transition(actor,r,desired,reason,approve?"PLAN_APPROVED":"PLAN_REJECTED");return request(vendor,id);
 }
 public void supersedeForClosure(UUID actor,UUID vendor){for(var row:jdbc.queryForList("SELECT * FROM plan_change_request WHERE vendor_id=? AND state='PENDING' ORDER BY id FOR UPDATE",vendor))transition(actor,request(row),"SUPERSEDED","Organization closed","PLAN_SUPERSEDED");}
 private Plan available(UUID target){var rows=jdbc.queryForList("SELECT * FROM plan_revision WHERE id=? FOR SHARE",target);if(rows.isEmpty()||(Boolean)rows.getFirst().get("retired")){throw fail(PlanFailure.Reason.INVALID_STATE);}return plan(rows.getFirst());}
 private void transition(UUID actor,Request r,String state,String reason,String action){jdbc.update("UPDATE plan_change_request SET state=?,resolution_reason=?,revision=revision+1,updated_at=? WHERE id=?",state,reason,now(),r.id());audit.plan(actor,r.id(),action,reason);}
 private static void pending(Request r){if(!r.state().equals("PENDING")){throw fail(PlanFailure.Reason.INVALID_STATE);}}
 private Timestamp now(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));}
 private static long number(Map<String,Object> r,String k){return ((Number)r.get(k)).longValue();}
 private static Plan plan(Map<String,Object> r){return new Plan((UUID)r.get("id"),(String)r.get("code"),Math.toIntExact(number(r,"revision")),(Boolean)r.get("retired"),Math.toIntExact(number(r,"product_limit")),Math.toIntExact(number(r,"active_buyer_limit")));}
 private static Request request(Map<String,Object> r){return new Request((UUID)r.get("id"),(UUID)r.get("vendor_id"),number(r,"revision"),(UUID)r.get("requested_plan_revision_id"),(String)r.get("state"),(String)r.get("resolution_reason"),((Timestamp)r.get("created_at")).toInstant(),((Timestamp)r.get("updated_at")).toInstant());}
 private static PlanFailure fail(PlanFailure.Reason r){return new PlanFailure(r);}
}
