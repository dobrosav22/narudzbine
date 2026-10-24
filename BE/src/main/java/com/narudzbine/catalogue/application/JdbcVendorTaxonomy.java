package com.narudzbine.catalogue.application;

import com.narudzbine.catalogue.api.*;
import com.narudzbine.audit.api.TaxonomyAudit;
import java.util.*;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcVendorTaxonomy implements VendorTaxonomy {
 private final JdbcTemplate jdbc; private final Clock clock; private final TaxonomyAudit audit;
 public JdbcVendorTaxonomy(JdbcTemplate jdbc,Clock clock,TaxonomyAudit audit){this.jdbc=jdbc;this.clock=clock;this.audit=audit;}
 private void guard(UUID vendor){if(jdbc.query("SELECT id FROM organization WHERE id=? AND type='VENDOR' FOR UPDATE",(r,n)->r.getObject(1,UUID.class),vendor).isEmpty()){throw fail(TaxonomyFailure.Reason.NOT_FOUND,null);}}
    @Override public OfferPage offerNames(UUID vendor,int size,UUID after){var rows=jdbc.query("SELECT t.id,t.name,t.kind FROM catalogue_taxonomy t WHERE t.vendor_id=? AND NOT t.deleted AND t.kind IN ('CATEGORY','TAG') AND (?::uuid IS NULL OR t.id>?) AND EXISTS(SELECT 1 FROM catalogue_product d JOIN catalogue_product_identity p ON p.id=d.id WHERE d.vendor_id=t.vendor_id AND p.active AND (p.category_id=t.id OR EXISTS(SELECT 1 FROM catalogue_product_tag x WHERE x.product_id=d.id AND x.taxonomy_id=t.id))) ORDER BY t.id LIMIT ?",(rs,n)->new OfferName(rs.getObject(1,UUID.class),rs.getString(2),Kind.valueOf(rs.getString(3))),vendor,after,after,size+1);return new OfferPage(rows.stream().limit(size).toList(),rows.size()>size);}
 @Override public Item read(UUID vendor,Kind kind,UUID id){var rows=jdbc.query("SELECT * FROM catalogue_taxonomy WHERE vendor_id=? AND kind=? AND id=?",JdbcVendorTaxonomy::map,vendor,kind.name(),id);if(rows.isEmpty()){throw fail(TaxonomyFailure.Reason.NOT_FOUND,null);}return rows.getFirst();}
 @Override public Page list(UUID vendor,Kind kind,int page,int size,boolean total,String query,boolean createdSort){
  String sort=createdSort?"created_at DESC,id ASC":"normalized_name ASC,id ASC";
  var rows=jdbc.query("WITH filtered AS MATERIALIZED (SELECT * FROM catalogue_taxonomy WHERE vendor_id=? AND kind=? AND NOT deleted AND strpos(normalized_name,?)>0), page AS (SELECT * FROM filtered ORDER BY "+sort+" LIMIT ? OFFSET ?) SELECT p.*,c.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM filtered) c LEFT JOIN page p ON true ORDER BY "+sort,
   (r,n)->new Row(r.getObject("id")==null?null:map(r,n),(Long)r.getObject("total")),vendor,kind.name(),normalized(query),size,Math.multiplyExact(page,size),total);
  return new Page(rows.stream().map(Row::item).filter(Objects::nonNull).toList(),rows.getFirst().total());
 }
 @Override public Creation create(UUID actor,UUID vendor,Kind kind,UUID id,String name,byte[] digest){
  guard(vendor);
  if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM catalogue_taxonomy WHERE id=?)",Boolean.class,id))){return replay(actor,vendor,kind,id,digest);}
  available(vendor,kind,id,name);var now=now();
  int inserted=jdbc.update("INSERT INTO catalogue_taxonomy(id,vendor_id,kind,name,normalized_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",id,vendor,kind.name(),name,normalized(name),now,now);
  if(inserted==0){return replay(actor,vendor,kind,id,digest);}
  jdbc.update("INSERT INTO taxonomy_creation(resource_id,creator_id,vendor_id,payload_hash,original_snapshot,expires_at) SELECT id,?,vendor_id,?,to_jsonb(t),? FROM catalogue_taxonomy t WHERE id=?",actor,digest,Timestamp.from(now.toInstant().plus(7,ChronoUnit.DAYS)),id);
  audit.taxonomy(actor,id,TaxonomyAudit.Kind.valueOf(kind.name()),TaxonomyAudit.Action.TAXONOMY_CREATED);return new Creation(read(vendor,kind,id),false);
 }
 private Creation replay(UUID actor,UUID vendor,Kind kind,UUID id,byte[] digest){
  Item current=read(vendor,kind,id);
  var rows=jdbc.query("SELECT creator_id,payload_hash,expires_at FROM taxonomy_creation WHERE resource_id=? AND vendor_id=? FOR SHARE",(r,n)->new Receipt(r.getObject(1,UUID.class),r.getBytes(2),r.getTimestamp(3).toInstant()),id,vendor);
  if(rows.isEmpty() || !actor.equals(rows.getFirst().actor())){throw fail(TaxonomyFailure.Reason.NOT_FOUND,null);}var r=rows.getFirst();
  if(!java.security.MessageDigest.isEqual(digest,r.hash())){throw fail(TaxonomyFailure.Reason.IDEMPOTENCY_MISMATCH,null);}
  if(!clock.instant().isBefore(r.expires())){throw fail(TaxonomyFailure.Reason.REPLAY_EXPIRED,current.id());}
  return new Creation(jdbc.queryForObject("SELECT (jsonb_populate_record(NULL::catalogue_taxonomy,original_snapshot)).* FROM taxonomy_creation WHERE resource_id=?",JdbcVendorTaxonomy::map,id),true);
 }
 @Override public Item rename(UUID actor,UUID vendor,Kind kind,UUID id,String name){guard(vendor);var current=read(vendor,kind,id);if(current.deleted()){throw fail(TaxonomyFailure.Reason.NOT_FOUND,null);}if(current.name().equals(name)){return current;}if(current.nameFrozen()){throw fail(TaxonomyFailure.Reason.UNIT_NAME_FROZEN,null);}available(vendor,kind,id,name);
  jdbc.update("UPDATE catalogue_taxonomy SET name=?,normalized_name=?,revision=revision+1,updated_at=? WHERE id=?",name,normalized(name),now(),id);audit.taxonomy(actor,id,TaxonomyAudit.Kind.valueOf(kind.name()),TaxonomyAudit.Action.TAXONOMY_RENAMED);return read(vendor,kind,id);
 }
 @Override public void delete(UUID actor,UUID vendor,Kind kind,UUID id){guard(vendor);var current=read(vendor,kind,id);if(current.deleted()){return;}
  if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM catalogue_product_identity WHERE unit_id=? OR category_id=?) OR EXISTS(SELECT 1 FROM catalogue_product_tag WHERE taxonomy_id=?) OR EXISTS(SELECT 1 FROM catalogue_promotion_taxonomy WHERE taxonomy_id=?)",Boolean.class,id,id,id,id))){throw fail(TaxonomyFailure.Reason.RESOURCE_REFERENCED,null);}
  jdbc.update("UPDATE catalogue_taxonomy SET deleted=true,revision=revision+1,updated_at=? WHERE id=?",now(),id);audit.taxonomy(actor,id,TaxonomyAudit.Kind.valueOf(kind.name()),TaxonomyAudit.Action.TAXONOMY_DELETED);
 }
 @Override public void freezeUnits(UUID vendor,List<UUID> units){guard(vendor);for(UUID id:units.stream().distinct().sorted(Comparator.comparing(UUID::toString)).toList()){var unit=read(vendor,Kind.UNIT,id);if(unit.deleted()){throw fail(TaxonomyFailure.Reason.NOT_FOUND,null);}if(!unit.nameFrozen()){jdbc.update("UPDATE catalogue_taxonomy SET name_frozen=true,revision=revision+1,updated_at=? WHERE id=?",now(),id);}}}
 @Override public void compactExpiredReceipts(){jdbc.update("UPDATE taxonomy_creation SET original_snapshot=NULL WHERE resource_id IN (SELECT resource_id FROM taxonomy_creation WHERE expires_at<=? AND original_snapshot IS NOT NULL ORDER BY expires_at,resource_id LIMIT 1000 FOR UPDATE SKIP LOCKED)",now());}
 private void available(UUID vendor,Kind kind,UUID id,String name){if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM catalogue_taxonomy WHERE vendor_id=? AND kind=? AND normalized_name=? AND NOT deleted AND id<>?)",Boolean.class,vendor,kind.name(),normalized(name),id))){throw fail(TaxonomyFailure.Reason.DUPLICATE_NAME,null);}}
 private static String normalized(String name){return java.text.Normalizer.normalize(name.strip(),java.text.Normalizer.Form.NFC).toLowerCase(Locale.ROOT);}
 private Timestamp now(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));}
 private static Item map(ResultSet r,int n)throws SQLException{return new Item(r.getObject("id",UUID.class),r.getLong("revision"),r.getString("name"),r.getBoolean("name_frozen"),r.getBoolean("deleted"));}
 private static TaxonomyFailure fail(TaxonomyFailure.Reason reason,UUID id){return new TaxonomyFailure(reason,id);}
 private record Receipt(UUID actor,byte[] hash,Instant expires) { }
 private record Row(Item item,Long total) { }

 @Override public Map<UUID,Item> readMany(UUID vendor,Kind kind,Collection<UUID> supplied){
  if(supplied.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var ids=supplied.stream().distinct().toList();if(ids.isEmpty())return Map.of();
  var args=new ArrayList<Object>();args.add(vendor);args.add(kind.name());args.addAll(ids);
  var rows=jdbc.query("SELECT * FROM catalogue_taxonomy WHERE vendor_id=? AND kind=? AND id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")",JdbcVendorTaxonomy::map,args.toArray());
  var result=new LinkedHashMap<UUID,Item>();for(var row:rows)result.put(row.id(),row);if(result.size()!=ids.size())throw fail(TaxonomyFailure.Reason.NOT_FOUND,null);return Map.copyOf(result);
 }
}
