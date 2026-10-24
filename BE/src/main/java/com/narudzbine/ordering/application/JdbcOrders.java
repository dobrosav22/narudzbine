package com.narudzbine.ordering.application;
import com.narudzbine.ordering.api.*;
import com.narudzbine.ordering.api.Orders.*;
import com.narudzbine.catalogue.api.VendorProducts;
import com.narudzbine.inventory.api.OrderStock;
import com.narudzbine.organizations.api.*;
import com.narudzbine.notifications.api.OrderNotices;
import com.narudzbine.audit.api.OrderAudit;
import com.narudzbine.subscriptions.api.VendorPlans;
import com.narudzbine.shared.api.UuidGenerator;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcOrders implements Orders {
 public boolean hasNonterminal(UUID organization){return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM purchase_order o LEFT JOIN LATERAL(SELECT state FROM purchase_order_event WHERE order_id=o.id ORDER BY revision DESC LIMIT 1)latest ON true WHERE(o.vendor_id=? OR o.buyer_id=?) AND COALESCE(latest.state,o.state) IN('AWAITING_ACCEPTANCE','ACCEPTED','DISPATCHED'))",Boolean.class,organization,organization));}
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final JdbcOrderReplacements replacements;private final com.narudzbine.trading.api.TradingConnections connections;private final OrderStages stages;private final com.narudzbine.buyerworkspace.api.SharedDrafts drafts;private final Locations locations;private final JdbcTemplate jdbc;private final OrderReviews reviews;private final OrganizationSettings organizations;private final VendorProducts products;private final OrderStock stock;private final OrderNotices notices;private final OrderAudit audit;private final org.springframework.beans.factory.ObjectProvider<VendorPlans> plans;private final UuidGenerator ids;private final Clock clock;private final org.springframework.beans.factory.ObjectProvider<com.narudzbine.shared.api.ResourceRevisions> revisions;
 public JdbcOrders(JdbcOrderReplacements replacements,com.narudzbine.trading.api.TradingConnections connections,OrderStages stages,com.narudzbine.buyerworkspace.api.SharedDrafts drafts,Locations locations,JdbcTemplate jdbc,OrderReviews reviews,OrganizationSettings organizations,VendorProducts products,OrderStock stock,OrderNotices notices,OrderAudit audit,org.springframework.beans.factory.ObjectProvider<VendorPlans> plans,UuidGenerator ids,Clock clock,org.springframework.beans.factory.ObjectProvider<com.narudzbine.shared.api.ResourceRevisions> revisions){this.replacements=replacements;this.connections=connections;this.stages=stages;this.locations=locations;this.drafts=drafts;this.jdbc=jdbc;this.reviews=reviews;this.organizations=organizations;this.products=products;this.stock=stock;this.notices=notices;this.audit=audit;this.plans=plans;this.ids=ids;this.clock=clock;this.revisions=revisions;}
 public void lockReplay(UUID actor,UUID buyer,byte[] identity){try{var digest=java.security.MessageDigest.getInstance("SHA-256");digest.update(actor.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII));digest.update(buyer.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII));long lock=java.nio.ByteBuffer.wrap(digest.digest(identity)).getLong();if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT pg_try_advisory_xact_lock(?)",Boolean.class,lock))){throw new OrderFailure(OrderFailure.Reason.REQUEST_IN_PROGRESS);}}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException("Order lock unavailable");}}
 public Optional<UUID> replayVendor(UUID actor,UUID buyer,byte[] identity){return jdbc.query("SELECT vendor_id FROM order_submission_replay WHERE actor_id=? AND buyer_id=? AND identity_hash=?",(r,n)->r.getObject(1,UUID.class),actor,buyer,identity).stream().findFirst();}

 public Optional<UUID> buyerVendor(UUID buyer,UUID order){return jdbc.query("SELECT vendor_id FROM purchase_order WHERE buyer_id=? AND id=?",(r,n)->r.getObject(1,UUID.class),buyer,order).stream().findFirst();}
 public Snapshot read(UUID organization,UUID order){return jdbc.query("SELECT COALESCE(latest.result,o.snapshot)::text FROM purchase_order o LEFT JOIN LATERAL(SELECT result FROM purchase_order_event WHERE order_id=o.id ORDER BY revision DESC LIMIT 1)latest ON true WHERE o.id=? AND (o.buyer_id=? OR o.vendor_id=?)",(r,n)->JSON.readValue(r.getString(1),Snapshot.class),order,organization,organization).stream().findFirst().orElseThrow(()->new OrderFailure(OrderFailure.Reason.NOT_FOUND));}
 public Page<Snapshot> list(UUID organization,OrganizationType type,Filter filter,int size,Instant afterAt,UUID afterId){
  requireSize(size);String own=type==OrganizationType.BUYER?"o.buyer_id":"o.vendor_id",partner=type==OrganizationType.BUYER?"o.vendor_id":"o.buyer_id";
  var sql=new StringBuilder("SELECT jsonb_set(COALESCE(latest.result,o.snapshot),'{terms,lines}','[]'::jsonb)::text,(COALESCE(latest.result,o.snapshot)#>'{terms,lines}')::text FROM purchase_order o LEFT JOIN LATERAL(SELECT state,result FROM purchase_order_event WHERE order_id=o.id ORDER BY revision DESC LIMIT 1)latest ON true WHERE "+own+"=?");var args=new ArrayList<Object>();args.add(organization);
  if(filter.state()!=null){sql.append(" AND COALESCE(latest.state,o.state)=?");args.add(filter.state());}
  if(filter.partner()!=null){sql.append(" AND "+partner+"=?");args.add(filter.partner());}
  if(filter.from()!=null){sql.append(" AND o.submitted_at>=?");args.add(Timestamp.from(filter.from()));}
  if(filter.until()!=null){sql.append(" AND o.submitted_at<?");args.add(Timestamp.from(filter.until()));}
  if(afterAt!=null){sql.append(" AND (o.submitted_at<? OR (o.submitted_at=? AND o.id>?))");args.add(Timestamp.from(afterAt));args.add(Timestamp.from(afterAt));args.add(afterId);}
  sql.append(" ORDER BY o.submitted_at DESC,o.id ASC LIMIT ?");args.add(size+1);
  var lineValues=new PageLineValues();
  return page(jdbc.query(sql.toString(),(r,n)->lineValues.snapshot(r.getString(1),r.getString(2)),args.toArray()),size);
 }
 public Page<Event> events(UUID organization,UUID order,int size,Instant afterAt,UUID afterId){
  requireSize(size);read(organization,order);var args=new ArrayList<Object>();args.add(order);args.add(organization);args.add(organization);
  var sql=new StringBuilder("SELECT e.* FROM purchase_order_event e JOIN purchase_order o ON o.id=e.order_id WHERE e.order_id=? AND (o.buyer_id=? OR o.vendor_id=?)");
  if(afterAt!=null){sql.append(" AND (e.created_at>? OR (e.created_at=? AND e.id>?))");args.add(Timestamp.from(afterAt));args.add(Timestamp.from(afterAt));args.add(afterId);}
  sql.append(" ORDER BY e.created_at ASC,e.id ASC LIMIT ?");args.add(size+1);
  return page(jdbc.query(sql.toString(),(r,n)->new Event(r.getObject("id",UUID.class),r.getObject("order_id",UUID.class),r.getString("state"),r.getObject("actor_organization_id",UUID.class)==null?r.getObject("buyer_id",UUID.class):r.getObject("actor_organization_id",UUID.class),r.getObject("actor_id",UUID.class),r.getString("actor_display_name"),r.getTimestamp("created_at").toInstant(),r.getString("previous_state"),r.getString("reason"),r.getObject("cancellation_request_id",UUID.class),r.getString("cancellation_request_state"),r.getObject("stage_id",UUID.class),r.getString("stage_name"),r.getObject("previous_stage_id",UUID.class),r.getString("previous_stage_name"),r.getString("stage_configuration_revision")),args.toArray()),size);
 }
 private static void requireSize(int size){if(size<1||size>100){throw new IllegalArgumentException("Invalid order page size");}}
 private static <T>Page<T> page(List<T> rows,int size){return new Page<>(rows.subList(0,Math.min(rows.size(),size)),rows.size()>size);}
 public Optional<Snapshot> replay(UUID actor,UUID buyer,UUID review,byte[] identity,byte[] digest,Instant at){
  var rows=jdbc.queryForList("SELECT * FROM order_submission_replay WHERE actor_id=? AND buyer_id=? AND identity_hash=?",actor,buyer,identity);if(rows.isEmpty()){return Optional.empty();}var r=rows.getFirst();if(!review.equals(r.get("review_id"))||!java.security.MessageDigest.isEqual(digest,(byte[])r.get("payload_hash"))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}UUID order=(UUID)r.get("order_id");if(!at.isBefore(((Timestamp)r.get("expires_at")).toInstant())){throw new OrderFailure(OrderFailure.Reason.REPLAY_EXPIRED,order);}Object original=r.get("original_result");if(original==null){throw new IllegalStateException("Unexpired order replay unavailable");}return Optional.of(JSON.readValue(original.toString(),Snapshot.class));
 }
 public Outcome submit(UUID actor,String actorName,UUID buyer,Country country,UUID review,byte[] identity,byte[] digest,Instant at){
  var receipt=reviews.read(buyer,review,at);if(receipt.draftId()!=null){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}var current=reviews.evaluate(buyer,country,receipt.result().intent(),at);
  if(current.result()==null){return new Outcome(null,null,current.issues());}
  if(!reviews.sameTerms(receipt,current)){var refreshed=reviews.save(actor,buyer,country,new OrderReviews.Request(receipt.result().intent(),null,null),current,at);return new Outcome(null,refreshed,List.of());}
  var result=produce(actor,actorName,buyer,country,review,current.result(),null,null,at);
  jdbc.update("INSERT INTO order_submission_replay(actor_id,buyer_id,vendor_id,identity_hash,review_id,order_id,payload_hash,original_result,expires_at) VALUES(?,?,?,?,?,?,?,?::jsonb,?)",actor,buyer,receipt.vendorId(),identity,review,result.id(),digest,JSON.writeValueAsString(result),Timestamp.from(at.plusSeconds(604800)));
  return new Outcome(result,null,List.of());
 }
 public Optional<Snapshot> replayDraft(UUID buyer,UUID draft,UUID review,String expected){
  var rows=jdbc.queryForList("SELECT s.review_id,s.expected_revision,o.snapshot::text AS snapshot FROM draft_order_submission s JOIN purchase_order o ON o.id=s.order_id WHERE s.buyer_id=? AND s.draft_id=?",buyer,draft);
  if(rows.isEmpty()){return Optional.empty();}var row=rows.getFirst();if(!review.equals(row.get("review_id"))||!expected.equals(row.get("expected_revision"))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}return Optional.of(JSON.readValue((String)row.get("snapshot"),Snapshot.class));
 }
 public Outcome submitDraft(UUID actor,String actorName,UUID buyer,Country country,UUID draft,long revision,UUID review,String expected,Instant at){
  var saved=drafts.read(buyer,draft);if(!saved.state().equals("OPEN")||saved.revision()!=revision){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}
  var receipt=reviews.read(buyer,review,at);if(!draft.equals(receipt.draftId())||!Long.valueOf(revision).equals(receipt.draftRevision())||!saved.intent().equals(receipt.result().intent())){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}
  var current=reviews.evaluate(buyer,country,saved.intent(),at);if(current.result()==null){return new Outcome(null,null,current.issues());}
  if(!reviews.sameTerms(receipt,current)){return new Outcome(null,reviews.save(actor,buyer,country,new OrderReviews.Request(saved.intent(),draft,revision),current,at),List.of());}
  var result=produce(actor,actorName,buyer,country,review,current.result(),draft,revision,at);
  jdbc.update("INSERT INTO draft_order_submission(draft_id,buyer_id,vendor_id,draft_revision,review_id,expected_revision,order_id) VALUES(?,?,?,?,?,?,?)",draft,buyer,receipt.vendorId(),revision,review,expected,result.id());
  drafts.consume(actor,buyer,draft,result.id(),at);return new Outcome(result,null,List.of());
 }
 private Snapshot produce(UUID actor,String actorName,UUID buyer,Country country,UUID review,OrderReviews.Result terms,UUID draft,Long draftRevision,Instant at){
  UUID vendor=terms.intent().vendorId();plans.getObject().current(vendor);var vendorSnapshot=party(organizations.read(vendor));var buyerSnapshot=party(organizations.read(buyer));
  products.freezeProducts(vendor,terms.lines().stream().map(OrderReviews.Line::productId).toList());
  int year=localYear(country,at);long sequence=jdbc.queryForObject("INSERT INTO order_number_counter(vendor_id,local_year,last_number) VALUES(?,?,1) ON CONFLICT(vendor_id,local_year) DO UPDATE SET last_number=order_number_counter.last_number+1 RETURNING last_number",Long.class,vendor,year);
  UUID id=ids.next();var result=new Snapshot(id,1,year+"/"+sequence,vendorSnapshot,buyerSnapshot,"AWAITING_ACCEPTANCE",revisions.getObject().encode("order/v1",id,1),terms,actor,actorName,at,null,at,null,null);
  jdbc.update("INSERT INTO purchase_order(id,buyer_id,vendor_id,country,local_year,sequence_number,review_id,submitted_by,state,revision,snapshot,submitted_at,draft_id,draft_revision) VALUES(?,?,?,?,?,?,?,?,'AWAITING_ACCEPTANCE',1,?::jsonb,?,?,?)",id,buyer,vendor,country.name(),year,sequence,review,actor,JSON.writeValueAsString(result),Timestamp.from(at),draft,draftRevision);
  replacements.link(terms.intent().replacementForOrderId(),id,buyer,vendor,actor,at);
  jdbc.batchUpdate("INSERT INTO purchase_order_line(order_id,product_id,vendor_id,quantity,snapshot) VALUES(?,?,?,?,?::jsonb)",terms.lines(),500,(statement,line)->{statement.setObject(1,id);statement.setObject(2,line.productId());statement.setObject(3,vendor);statement.setInt(4,line.quantity());statement.setString(5,JSON.writeValueAsString(line));});
  jdbc.update("INSERT INTO purchase_order_event(id,order_id,buyer_id,vendor_id,actor_id,actor_display_name,state,created_at) VALUES(?,?,?,?,?,?,'AWAITING_ACCEPTANCE',?)",ids.next(),id,buyer,vendor,actor,actorName,Timestamp.from(at));
  stock.deduct(id,vendor,buyer,actor,terms.lines().stream().map(l->new OrderStock.Line(l.productId(),l.quantity())).toList(),at);
  notices.submitted(id,vendor,buyer,at);audit.submitted(actor,id);
  return result;
 }
 public Optional<UUID> responseBuyer(UUID vendor,UUID order){return jdbc.query("SELECT buyer_id FROM purchase_order WHERE vendor_id=? AND id=?",(r,n)->r.getObject(1,UUID.class),vendor,order).stream().findFirst();}
 public Optional<Snapshot> replayResponse(UUID vendor,UUID order,ResponseCommand command){
  var rows=jdbc.queryForList("SELECT r.action,r.fulfillment_location_id,r.reason,e.result::text AS result FROM order_response r JOIN purchase_order_event e ON e.id=r.event_id WHERE r.vendor_id=? AND r.order_id=? AND r.expected_revision=?",vendor,order,command.expectedRevision());
  if(rows.isEmpty()){return Optional.empty();}var r=rows.getFirst();if(!command.action().equals(r.get("action"))||!Objects.equals(command.fulfillmentLocationId(),r.get("fulfillment_location_id"))||!Objects.equals(command.reason(),r.get("reason"))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}return Optional.of(JSON.readValue((String)r.get("result"),Snapshot.class));
 }
 public Snapshot respond(UUID actor,String actorName,UUID vendor,Country country,UUID order,ResponseCommand command,Instant at){
  stock.lock(vendor);if(jdbc.query("SELECT id FROM purchase_order WHERE vendor_id=? AND id=?",(r,n)->r.getObject(1,UUID.class),vendor,order).isEmpty()){throw new OrderFailure(OrderFailure.Reason.NOT_FOUND);}
  jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended('order-lifecycle/v1/'||?::text,0))::text",String.class,order);
  var source=read(vendor,order);if(!source.state().equals("AWAITING_ACCEPTANCE")||source.revision()!=1){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}
  boolean accepted=command.action().equals("ACCEPTED");if(!accepted&&!command.action().equals("REJECTED")||accepted&&command.reason()!=null||!accepted&&(command.reason()==null||command.fulfillmentLocationId()!=null)){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}
  Fulfillment fulfillment=null;if(accepted&&command.fulfillmentLocationId()!=null){var location=locations.find(vendor,command.fulfillmentLocationId()).filter(l->l.state().equals("ACTIVE")&&l.address().country()==country).orElseThrow(()->new OrderFailure(OrderFailure.Reason.INVALID_LOCATION));fulfillment=new Fulfillment(location,revisions.getObject().encode("location/v1",location.id(),location.revision()));}
  var result=new Snapshot(source.id(),2,source.number(),source.vendor(),source.buyer(),command.action(),revisions.getObject().encode("order/v1",order,2),source.terms(),source.submittedByAccountId(),source.submittedByDisplayName(),source.submittedAt(),fulfillment,at,null,null);UUID event=ids.next();if(at.equals(source.updatedAt()==null?source.submittedAt():source.updatedAt())){UUID previous=jdbc.queryForObject("SELECT id FROM purchase_order_event WHERE order_id=? ORDER BY revision DESC LIMIT 1",UUID.class,order);event=OrderEventIds.after(previous,event);}
  jdbc.update("INSERT INTO order_response(order_id,from_revision,vendor_id,buyer_id,action,expected_revision,fulfillment_location_id,reason,actor_id,event_id,created_at) VALUES(?,1,?,?,?,?,?,?,?,?,?)",order,vendor,source.buyer().organizationId(),command.action(),command.expectedRevision(),command.fulfillmentLocationId(),command.reason(),actor,event,Timestamp.from(at));
  jdbc.update("INSERT INTO purchase_order_event(id,order_id,buyer_id,vendor_id,actor_id,actor_display_name,state,created_at,revision,previous_state,reason,actor_organization_id,result) VALUES(?,?,?,?,?,?,?,?,2,'AWAITING_ACCEPTANCE',?,?,?::jsonb)",event,order,source.buyer().organizationId(),vendor,actor,actorName,command.action(),Timestamp.from(at),command.reason(),vendor,JSON.writeValueAsString(result));
  if(!accepted){stock.restore(order,vendor,actor,at);}notices.responded(order,event,source.buyer().organizationId(),source.submittedByAccountId(),at);audit.responded(actor,order,accepted,command.reason());return result;
 }
 public Optional<UUID> cancellationPartner(UUID organization,UUID order){return jdbc.query("SELECT CASE WHEN buyer_id=? THEN vendor_id ELSE buyer_id END FROM purchase_order WHERE id=? AND (buyer_id=? OR vendor_id=?)",(r,n)->r.getObject(1,UUID.class),organization,order,organization,organization).stream().findFirst();}
 public Optional<Snapshot> replayCancellation(UUID organization,UUID order,CancellationCommand command){
  var rows=jdbc.queryForList("SELECT c.organization_id,c.reason,e.result::text AS result FROM order_cancellation c JOIN purchase_order_event e ON e.id=c.event_id WHERE c.order_id=? AND c.expected_revision=?",order,command.expectedRevision());if(rows.isEmpty()){return Optional.empty();}var row=rows.getFirst();if(!organization.equals(row.get("organization_id"))||!command.reason().equals(row.get("reason"))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}return Optional.of(JSON.readValue((String)row.get("result"),Snapshot.class));
 }
 public Snapshot cancel(UUID actor,String actorName,UUID organization,UUID order,CancellationCommand command,Instant at){return cancelWithRequest(actor,actorName,organization,order,command,null,at);}
 private Snapshot cancelWithRequest(UUID actor,String actorName,UUID organization,UUID order,CancellationCommand command,RequestResolution resolution,Instant at){
  var source=read(organization,order);UUID vendor=source.vendor().organizationId(),buyer=source.buyer().organizationId();lockOrder(vendor,order);source=stageLabels(read(organization,order));
  boolean buyerAction=organization.equals(buyer);if(!(buyerAction&&source.state().equals("AWAITING_ACCEPTANCE")||organization.equals(vendor)&&source.state().equals("ACCEPTED"))){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}long next=source.revision()+1;
  var result=new Snapshot(source.id(),next,source.number(),source.vendor(),source.buyer(),"CANCELLED",revisions.getObject().encode("order/v1",order,next),source.terms(),source.submittedByAccountId(),source.submittedByDisplayName(),source.submittedAt(),source.fulfillment(),at,null,source.stage());UUID event=ids.next();if(at.equals(source.updatedAt()==null?source.submittedAt():source.updatedAt())){UUID previous=jdbc.queryForObject("SELECT id FROM purchase_order_event WHERE order_id=? ORDER BY revision DESC LIMIT 1",UUID.class,order);event=OrderEventIds.after(previous,event);}
  jdbc.update("INSERT INTO order_cancellation(order_id,from_revision,vendor_id,buyer_id,organization_id,expected_revision,reason,actor_id,event_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",order,source.revision(),vendor,buyer,organization,command.expectedRevision(),command.reason(),actor,event,Timestamp.from(at));
  UUID pending=pendingRequest(order).orElse(null);String outcome=pending==null?null:resolution==null?"RESOLVED":resolution.action();if(pending!=null){var request=readCancellationRequest(organization,order,pending);recordResolution(actor,organization,request,resolution==null?new RequestResolution("RESOLVED",request.originalRevision(),command.reason()):resolution,event,at);}
  appendRequestEvent(actor,actorName,organization,source,result,event,command.reason(),pending,outcome,at);
  stock.restore(order,vendor,actor,at);notices.cancelled(order,event,buyer,vendor,source.submittedByAccountId(),actor,organization,at);audit.cancelled(actor,order,command.reason());return result;
 }
 public RequestSnapshot readCancellationRequest(UUID organization,UUID order,UUID request){
  read(organization,order);return jdbc.query("SELECT COALESCE(r.original_result,c.original_result)::text FROM cancellation_request c LEFT JOIN cancellation_resolution r ON r.request_id=c.id WHERE c.order_id=? AND c.id=?",(row,n)->JSON.readValue(row.getString(1),RequestSnapshot.class),order,request).stream().findFirst().orElseThrow(()->new OrderFailure(OrderFailure.Reason.NOT_FOUND));
 }
 public Optional<RequestSnapshot> replayCancellationRequest(UUID buyer,UUID order,CancellationCommand command){
  var rows=jdbc.queryForList("SELECT reason,original_result::text AS result FROM cancellation_request WHERE buyer_id=? AND order_id=? AND expected_order_revision=?",buyer,order,command.expectedRevision());if(rows.isEmpty()){return Optional.empty();}var row=rows.getFirst();if(!command.reason().equals(row.get("reason"))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}return Optional.of(JSON.readValue((String)row.get("result"),RequestSnapshot.class));
 }
 public RequestSnapshot requestCancellation(UUID actor,String actorName,UUID buyer,UUID order,CancellationCommand command,Instant at){
  var source=read(buyer,order);if(!source.buyer().organizationId().equals(buyer)){throw new OrderFailure(OrderFailure.Reason.NOT_FOUND);}lockOrder(source.vendor().organizationId(),order);source=stageLabels(read(buyer,order));if(!source.state().equals("ACCEPTED")||pendingRequest(order).isPresent()){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}
  UUID request=ids.next(),event=nextEvent(source,at);var result=new RequestSnapshot(request,1,revisions.getObject().encode("cancelrequest/v1",request,1),order,command.reason(),"PENDING",null,at,at);var updated=requestOrder(source,"ACCEPTED",request,at);
  jdbc.update("INSERT INTO cancellation_request(id,order_id,buyer_id,vendor_id,order_from_revision,expected_order_revision,reason,actor_id,event_id,created_at,original_result) VALUES(?,?,?,?,?,?,?,?,?,?,?::jsonb)",request,order,buyer,source.vendor().organizationId(),source.revision(),command.expectedRevision(),command.reason(),actor,event,Timestamp.from(at),JSON.writeValueAsString(result));
  jdbc.update("INSERT INTO order_pending_cancellation(order_id,request_id) VALUES(?,?)",order,request);appendRequestEvent(actor,actorName,buyer,source,updated,event,command.reason(),request,"PENDING",at);notices.cancellationRequested(order,event,source.vendor().organizationId(),at);audit.cancellationRequested(actor,order,command.reason());return result;
 }
 public Optional<RequestSnapshot> replayCancellationResolution(UUID organization,UUID order,UUID request,RequestResolution command){
  var rows=jdbc.queryForList("SELECT r.organization_id,r.action,r.reason,r.original_result::text AS result FROM cancellation_resolution r JOIN cancellation_request c ON c.id=r.request_id WHERE c.order_id=? AND c.id=? AND r.expected_request_revision=?",order,request,command.expectedRevision());if(rows.isEmpty()){return Optional.empty();}var r=rows.getFirst();if(!organization.equals(r.get("organization_id"))||!command.action().equals(r.get("action"))||!Objects.equals(command.reason(),r.get("reason"))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}return Optional.of(JSON.readValue((String)r.get("result"),RequestSnapshot.class));
 }
 public RequestSnapshot resolveCancellation(UUID actor,String actorName,UUID organization,UUID order,UUID request,RequestResolution command,Instant at){
  var source=read(organization,order);lockOrder(source.vendor().organizationId(),order);source=stageLabels(read(organization,order));var current=readCancellationRequest(organization,order,request);boolean withdraw=command.action().equals("WITHDRAWN");if(!source.state().equals("ACCEPTED")||!current.state().equals("PENDING")||!pendingRequest(order).filter(request::equals).isPresent()||!(withdraw?organization.equals(source.buyer().organizationId()):organization.equals(source.vendor().organizationId()))){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}
  if(command.action().equals("APPROVED")){cancelWithRequest(actor,actorName,organization,order,new CancellationCommand(source.originalRevision(),current.reason()),command,at);return readCancellationRequest(organization,order,request);}
  if(!withdraw&&!command.action().equals("REJECTED")){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}UUID event=nextEvent(source,at);var result=recordResolution(actor,organization,current,command,event,at);appendRequestEvent(actor,actorName,organization,source,requestOrder(source,"ACCEPTED",null,at),event,command.reason(),request,command.action(),at);notices.cancelled(order,event,source.buyer().organizationId(),source.vendor().organizationId(),source.submittedByAccountId(),actor,organization,at);return result;
 }
 private RequestSnapshot recordResolution(UUID actor,UUID organization,RequestSnapshot request,RequestResolution command,UUID event,Instant at){
  var result=new RequestSnapshot(request.id(),2,revisions.getObject().encode("cancelrequest/v1",request.id(),2),request.orderId(),request.reason(),command.action(),command.reason(),request.createdAt(),at);
  jdbc.update("INSERT INTO cancellation_resolution(request_id,organization_id,action,expected_request_revision,reason,actor_id,event_id,created_at,original_result) VALUES(?,?,?,?,?,?,?,?,?::jsonb)",request.id(),organization,command.action(),command.expectedRevision(),command.reason(),actor,event,Timestamp.from(at),JSON.writeValueAsString(result));if(jdbc.update("DELETE FROM order_pending_cancellation WHERE order_id=? AND request_id=?",request.orderId(),request.id())!=1){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}audit.cancellationResolved(actor,request.orderId(),command.action(),command.reason());return result;
 }
 private Optional<UUID> pendingRequest(UUID order){return jdbc.queryForList("SELECT request_id FROM order_pending_cancellation WHERE order_id=?",UUID.class,order).stream().findFirst();}
 public void requireNoPendingCancellation(UUID vendor,UUID order){if(responseBuyer(vendor,order).isEmpty()){throw new OrderFailure(OrderFailure.Reason.NOT_FOUND);}lockOrder(vendor,order);if(pendingRequest(order).isPresent()){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}}
 private void lockOrder(UUID vendor,UUID order){stock.lock(vendor);stages.lock(vendor);jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended('order-lifecycle/v1/'||?::text,0))::text",String.class,order);}
 private UUID nextEvent(Snapshot source,Instant at){UUID event=ids.next();if(at.equals(source.updatedAt()==null?source.submittedAt():source.updatedAt())){UUID previous=jdbc.queryForObject("SELECT id FROM purchase_order_event WHERE order_id=? ORDER BY revision DESC LIMIT 1",UUID.class,source.id());event=OrderEventIds.after(previous,event);}return event;}
 private Snapshot requestOrder(Snapshot source,String state,UUID pending,Instant at){long next=source.revision()+1;return new Snapshot(source.id(),next,source.number(),source.vendor(),source.buyer(),state,revisions.getObject().encode("order/v1",source.id(),next),source.terms(),source.submittedByAccountId(),source.submittedByDisplayName(),source.submittedAt(),source.fulfillment(),at,pending,source.stage());}
 public String currentStageName(UUID vendor,UUID stage){return stages.read(vendor,stage).name();}
 private Snapshot stageLabels(Snapshot source){if(source.stage()==null){return source;}var stage=stages.read(source.vendor().organizationId(),source.stage().id());return new Snapshot(source.id(),source.revision(),source.number(),source.vendor(),source.buyer(),source.state(),source.originalRevision(),source.terms(),source.submittedByAccountId(),source.submittedByDisplayName(),source.submittedAt(),source.fulfillment(),source.updatedAt(),source.cancellationRequestId(),new StageAssignment(stage.id(),stage.name()));}
 private void appendRequestEvent(UUID actor,String actorName,UUID organization,Snapshot source,Snapshot result,UUID event,String reason,UUID request,String outcome,Instant at){appendEvent(actor,actorName,organization,source,result,event,reason,request,outcome,false,at);}
 private void appendEvent(UUID actor,String actorName,UUID organization,Snapshot source,Snapshot result,UUID event,String reason,UUID request,String outcome,boolean assignment,Instant at){
  var previous=source.stage();var current=result.stage();boolean metadata=assignment||previous!=null||current!=null;var config=metadata?stages.list(source.vendor().organizationId()):null;
  jdbc.update("INSERT INTO purchase_order_event(id,order_id,buyer_id,vendor_id,actor_id,actor_display_name,state,created_at,revision,previous_state,reason,actor_organization_id,result,cancellation_request_id,cancellation_request_state,stage_id,stage_name,previous_stage_id,previous_stage_name,stage_configuration_revision,stage_configuration_version,stage_assignment) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?,?,?,?,?,?,?,?)",event,source.id(),source.buyer().organizationId(),source.vendor().organizationId(),actor,actorName,result.state(),Timestamp.from(at),result.revision(),source.state(),reason,organization,JSON.writeValueAsString(result),request,outcome,current==null?null:current.id(),current==null?null:current.name(),previous==null?null:previous.id(),previous==null?null:previous.name(),config==null?null:config.originalRevision(),config==null?null:config.revision(),assignment);
 }
 public Optional<Snapshot> replayProgress(UUID vendor,UUID order,ProgressCommand command){
  var rows=jdbc.queryForList("SELECT p.expected_revision,e.result::text AS result FROM order_progress p JOIN purchase_order_event e ON e.id=p.event_id WHERE p.vendor_id=? AND p.order_id=? AND p.action=?",vendor,order,command.action());if(rows.isEmpty()){return Optional.empty();}var row=rows.getFirst();if(!command.expectedRevision().equals(row.get("expected_revision"))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}return Optional.of(JSON.readValue((String)row.get("result"),Snapshot.class));
 }
 public Snapshot progress(UUID actor,String actorName,UUID vendor,UUID order,ProgressCommand command,Instant at){
  requireNoPendingCancellation(vendor,order);var source=stageLabels(read(vendor,order));boolean dispatched=command.action().equals("DISPATCHED");if(!(dispatched&&source.state().equals("ACCEPTED")||command.action().equals("DELIVERED")&&source.state().equals("DISPATCHED"))){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}var result=requestOrder(source,command.action(),null,at);UUID event=nextEvent(source,at);
  jdbc.update("INSERT INTO order_progress(order_id,vendor_id,action,from_revision,expected_revision,actor_id,event_id,created_at) VALUES(?,?,?,?,?,?,?,?)",order,vendor,command.action(),source.revision(),command.expectedRevision(),actor,event,Timestamp.from(at));
  appendEvent(actor,actorName,vendor,source,result,event,null,null,null,false,at);if(dispatched){stock.release(order,vendor,actor,at);}notices.responded(order,event,source.buyer().organizationId(),source.submittedByAccountId(),at);audit.progressed(actor,order,!dispatched);return result;
 }
 public Page<Message> messages(UUID organization,UUID order,int size,Instant afterAt,UUID afterId){
  requireSize(size);read(organization,order);var sql=new StringBuilder("SELECT * FROM order_message WHERE order_id=?");var args=new ArrayList<Object>();args.add(order);if(afterAt!=null){sql.append(" AND(created_at>? OR(created_at=? AND id>?))");args.add(Timestamp.from(afterAt));args.add(Timestamp.from(afterAt));args.add(afterId);}sql.append(" ORDER BY created_at,id LIMIT ?");args.add(size+1);return page(jdbc.query(sql.toString(),(r,n)->new Message(r.getObject("id",UUID.class),order,r.getObject("author_organization_id",UUID.class),r.getObject("author_id",UUID.class),r.getString("author_display_name"),r.getString("text"),r.getTimestamp("created_at").toInstant()),args.toArray()),size);
 }
 public Optional<Message> replayMessage(UUID actor,UUID organization,UUID order,byte[] identity,byte[] payload,Instant at){
  var rows=jdbc.queryForList("SELECT * FROM message_replay WHERE actor_id=? AND organization_id=? AND identity_hash=?",actor,organization,identity);if(rows.isEmpty()){return Optional.empty();}var r=rows.getFirst();if(!order.equals(r.get("order_id"))||!java.security.MessageDigest.isEqual(payload,(byte[])r.get("payload_hash"))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}UUID message=(UUID)r.get("message_id");if(!at.isBefore(((Timestamp)r.get("expires_at")).toInstant())){throw new OrderFailure(OrderFailure.Reason.REPLAY_EXPIRED,message);}if(r.get("original_result")==null){throw new IllegalStateException("Unexpired message success missing");}return Optional.of(JSON.readValue(r.get("original_result").toString(),Message.class));
 }
 public Message message(UUID actor,String actorName,UUID organization,UUID order,String text,byte[] identity,byte[] payload,Instant at){
  jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended('order-lifecycle/v1/'||?::text,0))::text",String.class,order);var source=read(organization,order);boolean connected=connections.find(source.vendor().organizationId(),source.buyer().organizationId()).filter(c->c.state().equals("ACTIVE")).isPresent();if(!connected&&!Set.of("AWAITING_ACCEPTANCE","ACCEPTED","DISPATCHED").contains(source.state())){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}
  UUID id=ids.next();var previous=jdbc.queryForList("SELECT id FROM order_message WHERE order_id=? AND created_at=? ORDER BY id DESC LIMIT 1",UUID.class,order,Timestamp.from(at));if(!previous.isEmpty()){id=OrderEventIds.after(previous.getFirst(),id);}var result=new Message(id,order,organization,actor,actorName,text,at);
  jdbc.update("INSERT INTO order_message(id,order_id,author_organization_id,author_id,author_display_name,text,created_at) VALUES(?,?,?,?,?,?,?)",id,order,organization,actor,actorName,text,Timestamp.from(at));jdbc.update("INSERT INTO message_replay(actor_id,organization_id,identity_hash,order_id,payload_hash,message_id,original_result,created_at,expires_at) VALUES(?,?,?,?,?,?,?::jsonb,?,?)",actor,organization,identity,order,payload,id,JSON.writeValueAsString(result),Timestamp.from(at),Timestamp.from(at.plusSeconds(604800)));notices.messageCreated(order,id,organization.equals(source.buyer().organizationId())?source.vendor().organizationId():source.buyer().organizationId(),at);audit.messageCreated(actor,id);return result;
 }
 public Optional<Snapshot> replayStage(UUID vendor,UUID order,StageCommand command){String payload=stagePayload(command.stageId());var rows=jdbc.queryForList("SELECT result::text FROM order_stage_assignment WHERE vendor_id=? AND order_id=? AND expected_revision=? AND payload=?::jsonb",String.class,vendor,order,command.expectedRevision(),payload);if(!rows.isEmpty()){return Optional.of(JSON.readValue(rows.getFirst(),Snapshot.class));}if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM order_stage_assignment WHERE vendor_id=? AND order_id=? AND expected_revision=? AND changed)",Boolean.class,vendor,order,command.expectedRevision()))){throw new OrderFailure(OrderFailure.Reason.IDEMPOTENCY_MISMATCH);}return Optional.empty();}
 public Snapshot assignStage(UUID actor,String actorName,UUID vendor,UUID order,StageCommand command,Instant at){
  if(responseBuyer(vendor,order).isEmpty()){throw new OrderFailure(OrderFailure.Reason.NOT_FOUND);}lockOrder(vendor,order);var source=stageLabels(read(vendor,order));if(!source.state().equals("ACCEPTED")){throw new OrderFailure(OrderFailure.Reason.INVALID_STATE);}StageAssignment target=null;if(command.stageId()!=null){var selected=stages.read(vendor,command.stageId());if(!selected.state().equals("ACTIVE")){throw new StageFailure(StageFailure.Reason.INVALID_STATE);}target=new StageAssignment(selected.id(),selected.name());}
  boolean changed=!Objects.equals(source.stage()==null?null:source.stage().id(),command.stageId());long next=source.revision()+(changed?1:0);var result=new Snapshot(source.id(),next,source.number(),source.vendor(),source.buyer(),source.state(),revisions.getObject().encode("order/v1",order,next),source.terms(),source.submittedByAccountId(),source.submittedByDisplayName(),source.submittedAt(),source.fulfillment(),changed?at:source.updatedAt(),source.cancellationRequestId(),target);UUID event=changed?nextEvent(source,at):null;
  jdbc.update("INSERT INTO order_stage_assignment(order_id,vendor_id,from_revision,expected_revision,target_id,payload,result,changed,event_id,actor_id,created_at) VALUES(?,?,?,?,?,?::jsonb,?::jsonb,?,?,?,?)",order,vendor,source.revision(),command.expectedRevision(),command.stageId(),stagePayload(command.stageId()),JSON.writeValueAsString(result),changed,event,actor,Timestamp.from(at));
  if(changed){appendEvent(actor,actorName,vendor,source,result,event,null,null,null,true,at);notices.responded(order,event,source.buyer().organizationId(),source.submittedByAccountId(),at);audit.stageAssigned(actor,order);}return result;
 }
 private static String stagePayload(UUID id){var payload=new LinkedHashMap<String,Object>();payload.put("stageId",id);return JSON.writeValueAsString(payload);}
 public void compactExpiredReplays(){jdbc.update("WITH expired AS (SELECT actor_id,organization_id,identity_hash FROM message_replay WHERE original_result IS NOT NULL AND expires_at<=? ORDER BY expires_at,actor_id,organization_id,identity_hash LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE message_replay p SET original_result=NULL FROM expired e WHERE p.actor_id=e.actor_id AND p.organization_id=e.organization_id AND p.identity_hash=e.identity_hash",Timestamp.from(clock.instant()));stages.compactExpiredCreations();jdbc.update("WITH expired AS (SELECT actor_id,buyer_id,identity_hash FROM order_submission_replay WHERE original_result IS NOT NULL AND expires_at<=? ORDER BY expires_at,actor_id,buyer_id,identity_hash LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE order_submission_replay p SET original_result=NULL FROM expired e WHERE p.actor_id=e.actor_id AND p.buyer_id=e.buyer_id AND p.identity_hash=e.identity_hash",Timestamp.from(clock.instant()));}
 static int localYear(Country country,Instant at){return at.atZone(ZoneId.of(country==Country.RS?"Europe/Belgrade":"Europe/Sarajevo")).getYear();}
 private static Party party(OrganizationRecord r){return new Party(r.id(),r.displayName(),r.legalName(),r.country(),r.registrationIdentifier(),r.taxIdentifier(),r.registeredAddress());}

 /** Reuse only exact immutable line values in this one bounded query, never authority or order headers. */
 private static final class PageLineValues {
  private static final int MAX_MEMO_CHARACTERS=4*1024*1024;
  private final Map<String,List<OrderReviews.Line>> decoded=new HashMap<>();
  private int characters;
  Snapshot snapshot(String header,String rawLines){
   var order=JSON.readValue(header,Snapshot.class);
   if(rawLines==null)throw new IllegalStateException("Stored order lines missing.");
   var lines=decoded.get(rawLines);
   if(lines==null){
    lines=List.copyOf(Arrays.asList(JSON.readValue(rawLines,OrderReviews.Line[].class)));
    if(rawLines.length()<=MAX_MEMO_CHARACTERS-characters){decoded.put(rawLines,lines);characters+=rawLines.length();}
   }
   var original=order.terms();
   var terms=new OrderReviews.Result(original.id(),original.expiresAt(),original.intent(),lines,
    original.deliveryAddress(),original.deliveryContact(),original.deliveryInstructions(),original.currency(),original.goodsTotal());
   return new Snapshot(order.id(),order.revision(),order.number(),order.vendor(),order.buyer(),order.state(),
    order.originalRevision(),terms,order.submittedByAccountId(),order.submittedByDisplayName(),order.submittedAt(),
    order.fulfillment(),order.updatedAt(),order.cancellationRequestId(),order.stage());
  }
 }

}
