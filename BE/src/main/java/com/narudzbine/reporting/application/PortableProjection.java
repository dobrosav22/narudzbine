package com.narudzbine.reporting.application;
import com.narudzbine.audit.api.PrivacyFailure;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
/** One bounded REPEATABLE_READ snapshot, fixed view names and explicit record constructors only. */
final class PortableProjection {
 private final JdbcTemplate jdbc;
 PortableProjection(JdbcTemplate jdbc){this.jdbc=jdbc;}
 Generated render(UUID job,UUID source,UUID organization,String country,String type,Instant at){
  jdbc.queryForObject("SELECT set_config('narudzbine.privacy_snapshot_at',?,true)",String.class,at.toString());
  long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(25);
  try(var output=new PortableJson(source,organization,country,type,at)){
   for(var family:PortableJson.Family.values()){
    output.start(family);int before=output.records();
    // A row callback avoids collecting a whole family in memory. The global sink rejects row100001.
    jdbc.query("SELECT * FROM privacy_source_"+family.name().toLowerCase(java.util.Locale.ROOT)+" WHERE job_id=? ORDER BY 2,3 LIMIT 100001",(org.springframework.jdbc.core.RowCallbackHandler)r->{if(System.nanoTime()-deadline>=0)throw new PortableJson.Limit("SERVICE_UNAVAILABLE");output.row(row(family,r,organization,at));},job);
    if((family==PortableJson.Family.REQUESTER||family==PortableJson.Family.ORGANIZATION)&&output.records()!=before+1)throw new PrivacyFailure("ACCESS_REVOKED");
    output.end();
   }
   if(System.nanoTime()-deadline>=0)throw new PortableJson.Limit("SERVICE_UNAVAILABLE");
   byte[] bytes=output.finish();if(System.nanoTime()-deadline>=0)throw new PortableJson.Limit("SERVICE_UNAVAILABLE");
   return new Generated(bytes,output.records());
  }
 }
 private Record row(PortableJson.Family family,ResultSet r,UUID organization,Instant at)throws SQLException{return switch(family){
case REQUESTER->PortableRows.requester(r);
case ORGANIZATION->PortableRows.organization(r);
case MEMBERS->PortableRows.members(r);
case LOCATIONS->PortableRows.locations(r);
case CONTACTS->PortableRows.contacts(r);
case CONNECTIONS->PortableRows.connections(r);
case PLAN->PortableRows.plan(r);
case PLAN_REQUESTS->PortableRows.plan_requests(r);
case INVITATIONS->PortableRows.invitations(r);
case OWNERSHIP_TRANSFERS->PortableRows.ownership_transfers(r);
case PRODUCTS->PortableRows.products(r);
case SKU_RESERVATIONS->PortableRows.sku_reservations(r);
case TAXONOMY->PortableRows.taxonomy(r);
case AGREED_PRICES->PortableRows.agreed_prices(r);
case AGREED_PRICE_HISTORY->PortableRows.agreed_price_history(r);
case INVENTORY->PortableRows.inventory(r);
case STOCK_HISTORY->PortableRows.stock_history(r);
case FAVORITES->PortableRows.favorites(r);
case DRAFT_EVENTS->PortableRows.draft_events(r);
case ORDER_STAGES->PortableRows.order_stages(r);
case ORDER_EVENTS->PortableRows.order_events(r);
case CANCELLATIONS->PortableRows.cancellations(r);
case MESSAGES->PortableRows.messages(r);
case INBOX->PortableRows.inbox(r);
 case PARTNERS->PortableRows.partner(r);
 case TRACKING->PortableRows.tracking(r);
 case PRICING->PortableSnapshots.pricing(r);
 case PRICING_HISTORY->PortableSnapshots.pricingHistory(r);
 case PROMOTIONS->PortableSnapshots.promotion(r,at);
 case PROMOTION_HISTORY->PortableSnapshots.promotionHistory(r);
 case DRAFTS->PortableSnapshots.draft(r);
 case ORDERS->PortableSnapshots.order(r,organization);
 case PRODUCT_HISTORY,BUSINESS_AUDIT->PortableSnapshots.audit(r);
 case PREFERENCES->PortableSnapshots.preference(r);
 };}
 record Generated(byte[] bytes,int records){@Override public String toString(){return "PortableGenerated[redacted]";}}
}
