package com.narudzbine.catalogue.application;
import com.narudzbine.catalogue.api.*;
import com.narudzbine.catalogue.api.CsvImports.*;
import com.narudzbine.catalogue.api.CsvImports.Error;
import com.narudzbine.audit.api.ImportAudit;
import java.sql.Timestamp;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcCsvImports implements CsvImports {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private final JdbcTemplate jdbc;private final ProductStockPolicy stock;private final ImportAudit audit;private final Clock clock;
 public JdbcCsvImports(JdbcTemplate jdbc,ProductStockPolicy stock,ImportAudit audit,Clock clock){this.jdbc=jdbc;this.stock=stock;this.audit=audit;this.clock=clock;}
 public Preview store(UUID actor,UUID vendor,UUID id,int rowCount,boolean requiresPrice,List<Row> rows,List<Error> local,String revision){
  var errors=new ArrayList<>(local);errors.addAll(validate(vendor,rows,rowCount));var at=now();var result=new Preview(id,vendor,actor,at,at.plusSeconds(1800),rowCount,requiresPrice,rows,bounded(errors),revision);
  jdbc.update("INSERT INTO catalogue_import_preview(id,vendor_id,creator_id,created_at,expires_at,row_count,requires_price,valid,rows,errors,original_revision) VALUES(?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?)",id,vendor,actor,time(result.createdAt()),time(result.expiresAt()),rowCount,requiresPrice,result.valid(),JSON.writeValueAsString(rows),JSON.writeValueAsString(result.errors()),revision);audit.imported(actor,id,false);return result;
 }
 public Preview read(UUID vendor,UUID id){return load(vendor,id,false);}
 public Preview lock(UUID vendor,UUID id){stock.importTracking(vendor);return load(vendor,id,true);}
 private Preview load(UUID vendor,UUID id,boolean lock){return jdbc.query("SELECT * FROM catalogue_import_preview WHERE vendor_id=? AND id=?"+(lock?" FOR UPDATE":""),(r,n)->new Preview(id,vendor,r.getObject("creator_id",UUID.class),r.getTimestamp("created_at").toInstant(),r.getTimestamp("expires_at").toInstant(),r.getInt("row_count"),r.getBoolean("requires_price"),r.getString("rows")==null?List.of():Arrays.asList(JSON.readValue(r.getString("rows"),Row[].class)),r.getString("errors")==null?List.of():Arrays.asList(JSON.readValue(r.getString("errors"),Error[].class)),r.getString("original_revision")),vendor,id).stream().findFirst().orElseThrow(()->new ImportFailure("NOT_FOUND"));}
 public List<Error> validate(UUID vendor,List<Row> rows,int rowCount){
  boolean tracked=stock.importTracking(vendor);var errors=new ArrayList<Error>();var references=new HashSet<UUID>();var skus=new HashSet<String>();for(var row:rows){var p=row.product();if(p.unitId()!=null){references.add(p.unitId());}if(p.categoryId()!=null){references.add(p.categoryId());}references.addAll(p.tagIds());skus.add(normalized(p.sku()));}
  var kinds=new HashMap<UUID,String>();jdbc.query(c->{var q=c.prepareStatement("SELECT id,kind FROM catalogue_taxonomy WHERE vendor_id=? AND NOT deleted AND id=ANY(?)");q.setObject(1,vendor);q.setArray(2,c.createArrayOf("uuid",references.toArray()));return q;},r->{kinds.put(r.getObject(1,UUID.class),r.getString(2));});
  var reserved=new HashSet<String>();jdbc.query(c->{var q=c.prepareStatement("SELECT normalized_sku FROM product_sku_reservation WHERE vendor_id=? AND normalized_sku=ANY(?)");q.setObject(1,vendor);q.setArray(2,c.createArrayOf("text",skus.toArray()));return q;},r->{reserved.add(r.getString(1));});
  Long available=jdbc.query("SELECT p.product_limit-(SELECT count(*) FROM catalogue_product_identity WHERE vendor_id=a.organization_id AND NOT archived) AS available FROM organization_plan a JOIN plan_revision p ON p.id=a.plan_revision_id WHERE a.organization_id=?",(r,n)->r.getLong(1),vendor).stream().findFirst().orElse(0L);
  for(var row:rows){var p=row.product();int n=row.row();if(reserved.contains(normalized(p.sku()))){errors.add(new Error(n,"sku","SKU_RESERVED"));}if(rowCount>available){errors.add(new Error(n,"sku","PLAN_LIMIT_EXCEEDED"));}reference(errors,n,"unitId",p.unitId(),"UNIT",kinds);reference(errors,n,"categoryId",p.categoryId(),"CATEGORY",kinds);for(var tag:p.tagIds()){reference(errors,n,"tagIds",tag,"TAG",kinds);}if(row.activate()){if(p.unitId()==null){errors.add(new Error(n,"unitId","UNIT_REQUIRED"));}if(row.basePrice()==null){errors.add(new Error(n,"basePrice","BASE_PRICE_REQUIRED"));}if(tracked){errors.add(new Error(n,"activate","STOCK_CONFIRMATION_REQUIRED"));}}}
  return bounded(errors);
 }
 private static void reference(List<Error> errors,int row,String column,UUID id,String expected,Map<UUID,String> kinds){if(id!=null&&!expected.equals(kinds.get(id))){errors.add(new Error(row,column,"INVALID_REFERENCE"));}}
 public Optional<Result> replay(UUID vendor,UUID id,String expected){var rows=jdbc.queryForList("SELECT s.* FROM catalogue_import_success s JOIN catalogue_import_preview p ON p.id=s.preview_id WHERE p.vendor_id=? AND s.preview_id=?",vendor,id);if(rows.isEmpty()){return Optional.empty();}var s=rows.getFirst();if(!expected.equals(s.get("expected_revision"))){throw new ImportFailure("IDEMPOTENCY_MISMATCH");}return Optional.of(JSON.readValue(s.get("result").toString(),Result.class));}
 public void recordProduct(UUID vendor,UUID preview,Row row){jdbc.update("INSERT INTO catalogue_import_product(preview_id,row_number,product_id,vendor_id) VALUES(?,?,?,?)",preview,row.row(),row.id(),vendor);}
 public Result complete(UUID actor,UUID vendor,Preview preview,String expected){Instant at=now();if(!at.isBefore(preview.expiresAt())){throw new ImportFailure("PREVIEW_EXPIRED");}var result=new Result(preview.id(),preview.rows().stream().map(Row::id).toList(),at);jdbc.update("INSERT INTO catalogue_import_success(preview_id,vendor_id,actor_id,expected_revision,completed_at,result) VALUES(?,?,?,?,?,?::jsonb)",preview.id(),vendor,actor,expected,time(at),JSON.writeValueAsString(result));audit.imported(actor,preview.id(),true);return result;}
 public void cleanup(){jdbc.update("WITH due AS(SELECT p.id FROM catalogue_import_preview p LEFT JOIN catalogue_import_success s ON s.preview_id=p.id WHERE p.rows IS NOT NULL AND ((s.preview_id IS NULL AND p.expires_at+interval '24 hours'<=?) OR(s.preview_id IS NOT NULL AND s.completed_at+interval '7 days'<=?)) ORDER BY p.created_at,p.id LIMIT 1000 FOR UPDATE OF p SKIP LOCKED) UPDATE catalogue_import_preview SET rows=NULL,errors=NULL WHERE id IN(SELECT id FROM due)",time(now()),time(now()));}
 public static List<Error> bounded(List<Error> errors){var counts=new HashMap<Integer,Integer>();return errors.stream().distinct().sorted(Comparator.comparingInt(Error::row).thenComparing(Error::column).thenComparing(Error::code)).filter(e->counts.merge(e.row(),1,Integer::sum)<=100).toList();}
 private static String normalized(String value){return java.text.Normalizer.normalize(value.strip(),java.text.Normalizer.Form.NFC).toLowerCase(Locale.ROOT);}
 private Instant now(){return clock.instant().truncatedTo(ChronoUnit.MILLIS);}private static Timestamp time(Instant at){return Timestamp.from(at);}
}
