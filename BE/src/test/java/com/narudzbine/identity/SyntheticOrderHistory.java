package com.narudzbine.identity;
import java.util.*;
import java.time.*;
import java.sql.*;
import org.springframework.jdbc.core.*;
import com.narudzbine.shared.api.*;
/** Synthetic fixture only. Never installed in the shipping classpath. */
final class SyntheticOrderHistory {
 static long seed(JdbcTemplate jdbc, UUID template, int copies, Instant first, ResourceRevisions revisions, UuidGenerator ids)throws Exception {
  if(copies<1||copies>2000)throw new IllegalArgumentException("Fixture bound");
  return jdbc.execute((ConnectionCallback<Long>)c->{
   c.setAutoCommit(false);
   try {
    try(var s=c.createStatement()) {
     s.execute("CREATE TEMP TABLE load_map(order_id uuid,review_id uuid,e1 uuid,e2 uuid,e3 uuid,e4 uuid,r1 text,r2 text,r3 text,r4 text,identity_hash bytea,payload_hash bytea,at timestamptz(3),expires timestamptz(3),seq bigint,yr int) ON COMMIT DROP");
     s.execute("CREATE TEMP TABLE load_template AS SELECT * FROM purchase_order WHERE id='"+template+"'");
    }
    long sequence; int year;String country;
    try(var s=c.createStatement();var r=s.executeQuery("SELECT local_year,sequence_number,country FROM load_template")){if(!r.next())throw new IllegalArgumentException("Missing actual template");year=r.getInt(1);sequence=r.getLong(2);country=r.getString(3);}
    var sequences=new java.util.HashMap<Integer,Long>();sequences.put(year,sequence);
    try(var q=c.prepareStatement("INSERT INTO load_map VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")){
     for(int n=1;n<=copies;n++){
      UUID order=ids.next(),review=ids.next();int i=1;q.setObject(i++,order);q.setObject(i++,review);for(int e=0;e<4;e++)q.setObject(i++,ids.next());for(int r=1;r<=4;r++)q.setString(i++,revisions.encode("order/v1",order,r));
      q.setBytes(i++,digest("key",UUID.randomUUID()));q.setBytes(i++,digest("payload",review));Instant at=first.plusSeconds((n-1)*2160L);q.setTimestamp(i++,Timestamp.from(at));q.setTimestamp(i++,Timestamp.from(at.plusSeconds(900)));int localYear=at.atZone(ZoneId.of(country.equals("RS")?"Europe/Belgrade":"Europe/Sarajevo")).getYear();q.setLong(i++,sequences.merge(localYear,1L,Long::sum));q.setInt(i++,localYear);q.addBatch();
     }q.executeBatch();
    }
    try(var s=c.createStatement()){
     s.execute("CREATE FUNCTION pg_temp.load_snapshot(j jsonb,m load_map) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT j||jsonb_build_object('id',m.order_id,'number',m.yr::text||'/'||m.seq::text,'originalRevision',CASE(j->>'revision')::int WHEN 1 THEN m.r1 WHEN 2 THEN m.r2 WHEN 3 THEN m.r3 ELSE m.r4 END,'terms',(j->'terms')||jsonb_build_object('id',m.review_id,'expiresAt',m.expires),'submittedAt',m.at,'updatedAt',m.at) $$");
     clone(c,"order_review","t.id=(SELECT review_id FROM load_template)",Map.of("id","m.review_id","created_at","m.at","expires_at","m.expires","result","t.result||jsonb_build_object('id',m.review_id,'expiresAt',m.expires)"));
     s.execute("DO $$ DECLARE r record; BEGIN FOR r IN SELECT yr,count(*) AS amount FROM load_map GROUP BY yr ORDER BY yr LOOP IF NOT EXISTS(SELECT 1 FROM order_number_counter WHERE vendor_id=(SELECT vendor_id FROM load_template) AND local_year=r.yr) THEN INSERT INTO order_number_counter SELECT vendor_id,r.yr,1 FROM load_template; r.amount:=r.amount-1;END IF;FOR n IN 1..r.amount LOOP UPDATE order_number_counter SET last_number=last_number+1 WHERE vendor_id=(SELECT vendor_id FROM load_template) AND local_year=r.yr;END LOOP;END LOOP;END $$");
     clone(c,"purchase_order","t.id=(SELECT id FROM load_template)",Map.of("id","m.order_id","review_id","m.review_id","sequence_number","m.seq","local_year","m.yr","submitted_at","m.at","snapshot","pg_temp.load_snapshot(t.snapshot,m)"));
     clone(c,"purchase_order_line","t.order_id=(SELECT id FROM load_template)",Map.of("order_id","m.order_id"));
     clone(c,"order_stock_obligation","t.order_id=(SELECT id FROM load_template) AND NOT t.deducted",Map.of("order_id","m.order_id","created_at","m.at"));
     clone(c,"order_submission_replay","t.order_id=(SELECT id FROM load_template)",Map.of("review_id","m.review_id","order_id","m.order_id","identity_hash","m.identity_hash","payload_hash","m.payload_hash","original_result","pg_temp.load_snapshot(t.original_result,m)","expires_at","m.at+interval '604800 seconds'"));
     for(int rev=1;rev<=4;rev++){
      if(rev==2)clone(c,"order_response","t.order_id=(SELECT id FROM load_template)",Map.of("order_id","m.order_id","event_id","m.e2","expected_revision","m.r1","created_at","m.at"));
      if(rev>2)clone(c,"order_progress","t.order_id=(SELECT id FROM load_template) AND t.from_revision="+(rev-1),Map.of("order_id","m.order_id","event_id","m.e"+rev,"expected_revision","m.r"+(rev-1),"created_at","m.at"));
      clone(c,"purchase_order_event","t.order_id=(SELECT id FROM load_template) AND t.revision="+rev,Map.of("id","m.e"+rev,"order_id","m.order_id","created_at","m.at","result","CASE WHEN t.result IS NULL THEN NULL ELSE pg_temp.load_snapshot(t.result,m) END"));
     }
     s.execute("CREATE TEMP TABLE load_notice_map ON COMMIT DROP AS SELECT t.id AS old_id,uuidv7() AS new_id,m.order_id,m.at,CASE e.revision WHEN 2 THEN m.e2 WHEN 3 THEN m.e3 WHEN 4 THEN m.e4 ELSE NULL END AS event_id FROM order_notice t CROSS JOIN load_map m LEFT JOIN purchase_order_event e ON e.id=t.event_id WHERE t.order_id=(SELECT id FROM load_template)");
     copy(c,"order_notice","t.id=n.old_id", "order_notice t JOIN load_notice_map n ON t.id=n.old_id",Map.of("id","n.new_id","order_id","n.order_id","event_id","n.event_id","created_at","n.at"));
     copy(c,"order_delivery","true","order_delivery t JOIN load_notice_map n ON t.notice_id=n.old_id",Map.of("id","uuidv7()","notice_id","n.new_id","created_at","n.at","expires_at","n.at+interval '24 hours'"));
     s.execute("SET CONSTRAINTS ALL IMMEDIATE");
     s.execute("DROP TABLE load_template");
    }
    c.commit();return (long)copies;
   }catch(Exception failure){c.rollback();throw new IllegalStateException("Synthetic history generation failed with constraints enabled",failure);}finally{c.setAutoCommit(true);}
  });
 }
 private static void clone(Connection c,String table,String where,Map<String,String> patches)throws SQLException{copy(c,table,where,table+" t CROSS JOIN load_map m",patches);}
 private static void copy(Connection c,String table,String where,String from,Map<String,String> patches)throws SQLException {
  var columns=new ArrayList<String>();try(var q=c.prepareStatement("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=? ORDER BY ordinal_position")){q.setString(1,table);try(var r=q.executeQuery()){while(r.next())columns.add(r.getString(1));}}
  if(columns.isEmpty()||!columns.containsAll(patches.keySet()))throw new IllegalArgumentException("Fixture columns changed");
  String values=columns.stream().map(v->patches.getOrDefault(v,"t."+v)).collect(java.util.stream.Collectors.joining(","));
  try(var s=c.createStatement()){s.executeUpdate("INSERT INTO "+table+"("+String.join(",",columns)+") SELECT "+values+" FROM "+from+" WHERE "+where);}
 }
 private static byte[] digest(String domain,UUID value){try{return java.security.MessageDigest.getInstance("SHA-256").digest(("narudzbine/order/"+domain+"/v1\0"+value).getBytes(java.nio.charset.StandardCharsets.US_ASCII));}catch(Exception e){throw new IllegalStateException(e);}}
}

