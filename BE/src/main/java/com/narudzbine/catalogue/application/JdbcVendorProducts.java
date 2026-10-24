package com.narudzbine.catalogue.application;

import com.narudzbine.catalogue.api.*;
import com.narudzbine.catalogue.api.VendorProducts.*;
import com.narudzbine.audit.api.ProductAudit;
import java.util.*;
import java.sql.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcVendorProducts implements VendorProducts {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private static final String PROJECTION="SELECT d.*,p.archived,p.active,p.unit_id,p.category_id,COALESCE((SELECT array_agg(taxonomy_id ORDER BY taxonomy_id) FROM catalogue_product_tag WHERE product_id=d.id),'{}'::uuid[]) AS tag_ids,COALESCE((SELECT array_agg(g.asset_id ORDER BY g.position) FROM catalogue_product_gallery g WHERE g.product_id=d.id),'{}'::uuid[]) AS gallery_ids FROM catalogue_product d JOIN catalogue_product_identity p ON p.id=d.id";
    private final JdbcTemplate jdbc;private final Clock clock;private final ProductAudit audit;private final VendorTaxonomy taxonomy;private final ProductPricingPolicy pricingPolicy;private final ProductStockPolicy stockPolicy;private final GalleryAssets galleryAssets;
    public JdbcVendorProducts(JdbcTemplate jdbc,Clock clock,ProductAudit audit,VendorTaxonomy taxonomy,ProductPricingPolicy pricingPolicy,ProductStockPolicy stockPolicy,GalleryAssets galleryAssets){this.jdbc=jdbc;this.clock=clock;this.audit=audit;this.taxonomy=taxonomy;this.pricingPolicy=pricingPolicy;this.stockPolicy=stockPolicy;this.galleryAssets=galleryAssets;}
    private void guard(UUID vendor){if(jdbc.query("SELECT id FROM organization WHERE id=? AND type='VENDOR' FOR UPDATE",(r,n)->r.getObject(1,UUID.class),vendor).isEmpty()){throw failure(ProductFailure.Reason.NOT_FOUND);}}
    @Override public Optional<UUID> vendorForProduct(UUID id){return jdbc.query("SELECT vendor_id FROM catalogue_product WHERE id=?",(r,n)->r.getObject(1,UUID.class),id).stream().findFirst();}
    @Override public Optional<Item> find(UUID vendor,UUID id){return jdbc.query(PROJECTION+" WHERE d.vendor_id=? AND d.id=?",JdbcVendorProducts::map,vendor,id).stream().findFirst();}
    @Override public Item read(UUID vendor,UUID id){return find(vendor,id).orElseThrow(()->failure(ProductFailure.Reason.NOT_FOUND));}
    @Override public Page list(UUID vendor,Query q){return select(vendor,q,null);}
    @Override public Page published(UUID vendor,Query q,Boolean featured){return select(vendor,new Query(q.page(),q.size(),q.total(),q.query(),q.createdSort(),"ACTIVE",q.categoryId(),q.tagId()),featured);}
    private Page select(UUID vendor,Query q,Boolean featured){
        String sort=q.createdSort()?"created_at DESC,id ASC":"normalized_name ASC,id ASC",filter=" WHERE d.vendor_id=? AND (strpos(d.normalized_name,?)>0 OR strpos(d.normalized_sku,?)>0) AND (?::text IS NULL OR (?='ARCHIVED' AND p.archived) OR (?='INACTIVE' AND NOT p.archived AND NOT p.active) OR (?='ACTIVE' AND p.active)) AND (?::boolean IS NULL OR d.featured=?) AND (?::uuid IS NULL OR p.category_id=?) AND (?::uuid IS NULL OR EXISTS(SELECT 1 FROM catalogue_product_tag t WHERE t.product_id=d.id AND t.taxonomy_id=?))";
        var rows=jdbc.query("WITH filtered AS NOT MATERIALIZED (SELECT d.id,d.normalized_name,d.created_at FROM catalogue_product d JOIN catalogue_product_identity p ON p.id=d.id"+filter+"), page AS (SELECT id FROM filtered ORDER BY "+sort+" LIMIT ? OFFSET ?) SELECT projected.*,c.total FROM (SELECT CASE WHEN ? THEN(SELECT count(*) FROM filtered) ELSE NULL::bigint END total)c LEFT JOIN LATERAL("+PROJECTION+" JOIN page selected ON selected.id=d.id) projected ON true ORDER BY "+sort,
                (r,n)->new PageRow(r.getObject("id")==null?null:map(r,n),(Long)r.getObject("total")),vendor,normalized(q.query()),normalized(q.query()),q.state(),q.state(),q.state(),q.state(),featured,featured,q.categoryId(),q.categoryId(),q.tagId(),q.tagId(),q.size(),Math.multiplyExact(q.page(),q.size()),q.total());
        return new Page(rows.stream().map(PageRow::item).filter(Objects::nonNull).toList(),rows.getFirst().total());
    }
    @Override public Creation create(UUID actor,UUID vendor,UUID id,Values v,byte[] digest){
        guard(vendor);
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM catalogue_product_identity WHERE id=?)",Boolean.class,id))){return replay(actor,vendor,id,digest);}
        references(vendor,v);availableSku(vendor,v.sku());capacity(vendor);var now=now();
        if(jdbc.update("INSERT INTO catalogue_product_identity(id,vendor_id,unit_id,category_id) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING",id,vendor,v.unitId(),v.categoryId())==0){return replay(actor,vendor,id,digest);}
        jdbc.update("INSERT INTO catalogue_product(id,vendor_id,sku,normalized_sku,name,normalized_name,description,pack_description,minimum_quantity,quantity_step,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",id,vendor,v.sku(),normalized(v.sku()),v.name(),normalized(v.name()),v.description(),v.packDescription(),v.minimumQuantity(),v.quantityStep(),now,now);
        jdbc.update("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES (?,?,?)",vendor,normalized(v.sku()),id);setTags(id,v.tagIds());var item=read(vendor,id);
        jdbc.update("INSERT INTO product_creation(product_id,creator_id,vendor_id,payload_hash,original_snapshot,expires_at) VALUES (?,?,?,?,?::jsonb,?)",id,actor,vendor,digest,JSON.writeValueAsString(item),Timestamp.from(now.toInstant().plus(7,ChronoUnit.DAYS)));
        audit.product(actor,id,ProductAudit.Action.PRODUCT_CREATED,List.of(ProductAudit.Field.sku,ProductAudit.Field.name,ProductAudit.Field.description,ProductAudit.Field.unitId,ProductAudit.Field.packDescription,ProductAudit.Field.categoryId,ProductAudit.Field.tagIds,ProductAudit.Field.minimumQuantity,ProductAudit.Field.quantityStep,ProductAudit.Field.state));return new Creation(item,false);
    }
    private Creation replay(UUID actor,UUID vendor,UUID id,byte[] digest){
        read(vendor,id);
        var rows=jdbc.query("SELECT creator_id,payload_hash,expires_at,original_snapshot::text FROM product_creation WHERE product_id=? AND vendor_id=? FOR SHARE",(r,n)->new Receipt(r.getObject(1,UUID.class),r.getBytes(2),r.getTimestamp(3).toInstant(),r.getString(4)),id,vendor);
        if(rows.isEmpty()||!actor.equals(rows.getFirst().actor())){throw failure(ProductFailure.Reason.NOT_FOUND);}var r=rows.getFirst();
        if(!java.security.MessageDigest.isEqual(digest,r.hash())){throw failure(ProductFailure.Reason.IDEMPOTENCY_MISMATCH);}if(!clock.instant().isBefore(r.expires())){throw new ProductFailure(ProductFailure.Reason.REPLAY_EXPIRED,null,id);}return new Creation(JSON.readValue(r.snapshot(),Item.class),true);
    }
    @Override public Item replace(UUID actor,UUID vendor,UUID id,Values v){
        guard(vendor);var current=read(vendor,id);var old=current.values();var changed=changes(old,v);if(changed.isEmpty()){return current;}
        if(current.unitAndPackFrozen()&&(!Objects.equals(old.unitId(),v.unitId())||!Objects.equals(old.packDescription(),v.packDescription()))){throw failure(ProductFailure.Reason.PRODUCT_UNIT_PACK_FROZEN);}
        if(old.minimumQuantity()!=v.minimumQuantity()||old.quantityStep()!=v.quantityStep()){pricingPolicy.requireCompatible(vendor,id,v.minimumQuantity(),v.quantityStep());}
        if(current.state().equals("ACTIVE")&&v.unitId()==null){throw failure(ProductFailure.Reason.UNIT_REQUIRED);}references(vendor,v);
        if(!normalized(old.sku()).equals(normalized(v.sku()))){availableSku(vendor,v.sku());jdbc.update("UPDATE product_sku_reservation SET retired=true WHERE product_id=? AND NOT retired",id);jdbc.update("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES (?,?,?)",vendor,normalized(v.sku()),id);}
        jdbc.update("UPDATE catalogue_product_identity SET unit_id=?,category_id=? WHERE id=?",v.unitId(),v.categoryId(),id);
        jdbc.update("UPDATE catalogue_product SET sku=?,normalized_sku=?,name=?,normalized_name=?,description=?,pack_description=?,minimum_quantity=?,quantity_step=?,revision=revision+1,updated_at=? WHERE id=?",v.sku(),normalized(v.sku()),v.name(),normalized(v.name()),v.description(),v.packDescription(),v.minimumQuantity(),v.quantityStep(),now(),id);
        if(!old.tagIds().equals(v.tagIds())){setTags(id,v.tagIds());}
        audit.product(actor,id,ProductAudit.Action.PRODUCT_UPDATED,changed);return read(vendor,id);
    }
    @Override public Item featured(UUID actor,UUID vendor,UUID id,boolean featured){guard(vendor);var old=read(vendor,id);if(old.featured()==featured)return old;jdbc.update("UPDATE catalogue_product SET featured=?,revision=revision+1,updated_at=? WHERE id=?",featured,now(),id);audit.product(actor,id,ProductAudit.Action.PRODUCT_UPDATED,List.of(ProductAudit.Field.featured));return read(vendor,id);}
    @Override public Item gallery(UUID actor,UUID vendor,UUID id,List<UUID> requested){
        guard(vendor);var current=read(vendor,id);var ids=List.copyOf(requested);
        if(ids.size()>5||new HashSet<>(ids).size()!=ids.size()){throw new ProductFailure(ProductFailure.Reason.INVALID_REFERENCE,"/assetIds",null);}
        galleryAssets.lockAndValidate(vendor,id,current.galleryAssetIds(),ids);
        if(current.galleryAssetIds().equals(ids)){return current;}
        jdbc.update("DELETE FROM catalogue_product_gallery WHERE product_id=?",id);
        for(int i=0;i<ids.size();i++){jdbc.update("INSERT INTO catalogue_product_gallery(product_id,vendor_id,position,asset_id) VALUES (?,?,?,?)",id,vendor,i,ids.get(i));}
        var at=clock.instant().truncatedTo(ChronoUnit.MILLIS);galleryAssets.referencesChanged(current.galleryAssetIds(),ids,at);
        jdbc.update("UPDATE catalogue_product SET revision=revision+1,updated_at=? WHERE id=?",Timestamp.from(at),id);
        var result=read(vendor,id);if(!result.galleryAssetIds().equals(ids)){throw new IllegalStateException("Gallery replacement was incomplete");}
        audit.product(actor,id,ProductAudit.Action.PRODUCT_UPDATED,List.of(ProductAudit.Field.galleryAssetIds));return result;
    }
    @Override public Item publication(UUID actor,UUID vendor,UUID id,boolean active){guard(vendor);var current=read(vendor,id);if(current.state().equals("ARCHIVED")){throw failure(ProductFailure.Reason.INVALID_STATE);}if(current.state().equals(active?"ACTIVE":"INACTIVE")){return current;}if(active){if(current.values().unitId()==null){throw failure(ProductFailure.Reason.UNIT_REQUIRED);}references(vendor,current.values());pricingPolicy.requireActivationPrice(vendor,id);stockPolicy.requireActivationStock(vendor,id);}jdbc.update("UPDATE catalogue_product_identity SET active=? WHERE id=?",active,id);jdbc.update("UPDATE catalogue_product SET revision=revision+1,updated_at=? WHERE id=?",now(),id);audit.product(actor,id,active?ProductAudit.Action.PRODUCT_ACTIVATED:ProductAudit.Action.PRODUCT_DEACTIVATED,List.of(ProductAudit.Field.state));return read(vendor,id);}
    @Override public Item state(UUID actor,UUID vendor,UUID id,boolean archived){guard(vendor);var current=read(vendor,id);if(current.state().equals("ARCHIVED")==archived){return current;}if(!archived){capacity(vendor);}jdbc.update("UPDATE catalogue_product_identity SET archived=?,active=false WHERE id=?",archived,id);jdbc.update("UPDATE catalogue_product SET revision=revision+1,updated_at=? WHERE id=?",now(),id);audit.product(actor,id,archived?ProductAudit.Action.PRODUCT_ARCHIVED:ProductAudit.Action.PRODUCT_RESTORED,List.of(ProductAudit.Field.state));return read(vendor,id);}
    @Override public void freezeProducts(UUID vendor,List<UUID> supplied){
        guard(vendor);var selected=supplied.stream().distinct().sorted(Comparator.comparing(UUID::toString)).toList();var found=findMany(vendor,selected);
        var items=selected.stream().map(id->{var item=found.get(id);if(item==null)throw failure(ProductFailure.Reason.NOT_FOUND);return item;}).toList();
        for(var item:items)if(item.values().unitId()==null)throw new ProductFailure(ProductFailure.Reason.INVALID_REFERENCE,"/unitId",null);
        taxonomy.freezeUnits(vendor,items.stream().map(item->item.values().unitId()).toList());
        var changes=items.stream().filter(item->!item.unitAndPackFrozen()).toList();var at=now();
        if(!changes.isEmpty())jdbc.batchUpdate("UPDATE catalogue_product SET unit_pack_frozen=true,revision=revision+1,updated_at=? WHERE id=?",changes,1000,(statement,item)->{statement.setTimestamp(1,at);statement.setObject(2,item.id());});
    }
    @Override public void compactExpiredReceipts(){jdbc.update("UPDATE product_creation SET original_snapshot=NULL WHERE product_id IN (SELECT product_id FROM product_creation WHERE expires_at<=? AND original_snapshot IS NOT NULL ORDER BY expires_at,product_id LIMIT 1000 FOR UPDATE SKIP LOCKED)",now());}
    private void capacity(UUID vendor){Integer cap=jdbc.query("SELECT p.product_limit FROM organization_plan a JOIN plan_revision p ON p.id=a.plan_revision_id WHERE a.organization_id=?",(r,n)->r.getInt(1),vendor).stream().findFirst().orElse(null);if(cap==null||jdbc.queryForObject("SELECT count(*) FROM catalogue_product_identity WHERE vendor_id=? AND NOT archived",Long.class,vendor)>=cap){throw failure(ProductFailure.Reason.PLAN_LIMIT_EXCEEDED);}}
    private void availableSku(UUID vendor,String sku){if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM product_sku_reservation WHERE vendor_id=? AND normalized_sku=?)",Boolean.class,vendor,normalized(sku)))){throw failure(ProductFailure.Reason.SKU_RESERVED);}}
    private void references(UUID vendor,Values v){reference(vendor,v.unitId(),"UNIT","/unitId");reference(vendor,v.categoryId(),"CATEGORY","/categoryId");for(int i=0;i<v.tagIds().size();i++){reference(vendor,v.tagIds().get(i),"TAG","/tagIds");}}
    private void reference(UUID vendor,UUID id,String kind,String field){if(id==null){return;}if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM catalogue_taxonomy WHERE id=? AND vendor_id=? AND kind=? AND NOT deleted)",Boolean.class,id,vendor,kind))){throw new ProductFailure(ProductFailure.Reason.INVALID_REFERENCE,field,null);}}
    private void setTags(UUID product,List<UUID> tags){jdbc.update("DELETE FROM catalogue_product_tag WHERE product_id=?",product);for(UUID tag:tags){jdbc.update("INSERT INTO catalogue_product_tag(product_id,taxonomy_id) VALUES (?,?)",product,tag);}}
    private static List<ProductAudit.Field> changes(Values a,Values b){var f=new ArrayList<ProductAudit.Field>();if(!a.sku().equals(b.sku())){f.add(ProductAudit.Field.sku);}if(!a.name().equals(b.name())){f.add(ProductAudit.Field.name);}if(!Objects.equals(a.description(),b.description())){f.add(ProductAudit.Field.description);}if(!Objects.equals(a.unitId(),b.unitId())){f.add(ProductAudit.Field.unitId);}if(!Objects.equals(a.packDescription(),b.packDescription())){f.add(ProductAudit.Field.packDescription);}if(!Objects.equals(a.categoryId(),b.categoryId())){f.add(ProductAudit.Field.categoryId);}if(!a.tagIds().equals(b.tagIds())){f.add(ProductAudit.Field.tagIds);}if(a.minimumQuantity()!=b.minimumQuantity()){f.add(ProductAudit.Field.minimumQuantity);}if(a.quantityStep()!=b.quantityStep()){f.add(ProductAudit.Field.quantityStep);}return List.copyOf(f);}
    private static Item map(ResultSet r,int n)throws SQLException{var tags=Arrays.stream((Object[])r.getArray("tag_ids").getArray()).map(x->(UUID)x).sorted(Comparator.comparing(UUID::toString)).toList();return new Item(r.getObject("id",UUID.class),r.getLong("revision"),new Values(r.getString("sku"),r.getString("name"),r.getString("description"),r.getObject("unit_id",UUID.class),r.getString("pack_description"),r.getObject("category_id",UUID.class),tags,r.getInt("minimum_quantity"),r.getInt("quantity_step")),r.getBoolean("archived")?"ARCHIVED":r.getBoolean("active")?"ACTIVE":"INACTIVE",r.getBoolean("featured"),r.getBoolean("unit_pack_frozen"),Arrays.stream((Object[])r.getArray("gallery_ids").getArray()).map(x->(UUID)x).toList(),r.getTimestamp("created_at").toInstant(),r.getTimestamp("updated_at").toInstant());}
    private static String normalized(String value){return java.text.Normalizer.normalize(value.strip(),java.text.Normalizer.Form.NFC).toLowerCase(Locale.ROOT);}
    private Timestamp now(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));}
    private static ProductFailure failure(ProductFailure.Reason reason){return new ProductFailure(reason,null,null);}
    private record Receipt(UUID actor,byte[] hash,Instant expires,String snapshot){ }
    private record PageRow(Item item,Long total){ }

    @Override public Map<UUID,Item> findMany(UUID vendor,Collection<UUID> supplied){
        if(supplied.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
        var ids=supplied.stream().distinct().toList();if(ids.isEmpty())return Map.of();
        var args=new ArrayList<Object>();args.add(vendor);args.addAll(ids);
        var rows=jdbc.query(PROJECTION+" WHERE d.vendor_id=? AND d.id IN ("+String.join(",",Collections.nCopies(ids.size(),"?"))+")",JdbcVendorProducts::map,args.toArray());
        var result=new LinkedHashMap<UUID,Item>();for(var row:rows)result.put(row.id(),row);return Map.copyOf(result);
    }

    @Override public void createMany(UUID actor,UUID vendor,List<NewProduct> rows){
        if(rows.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");if(rows.isEmpty())return;guard(vendor);
        var ids=rows.stream().map(NewProduct::id).toList();if(new HashSet<>(ids).size()!=rows.size())throw new IllegalArgumentException("Duplicate batch identity");
        String in=String.join(",",Collections.nCopies(ids.size(),"?"));
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM catalogue_product_identity WHERE id IN ("+in+"))",Boolean.class,ids.toArray()))){for(var row:rows)create(actor,vendor,row.id(),row.values(),row.digest());return;}
        var values=rows.stream().map(NewProduct::values).toList();referencesMany(vendor,values);
        var skus=values.stream().map(value->normalized(value.sku())).toList();if(new HashSet<>(skus).size()!=rows.size())throw failure(ProductFailure.Reason.SKU_RESERVED);
        var skuArgs=new ArrayList<Object>();skuArgs.add(vendor);skuArgs.addAll(skus);
        if(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM product_sku_reservation WHERE vendor_id=? AND normalized_sku IN ("+in+"))",Boolean.class,skuArgs.toArray())))throw failure(ProductFailure.Reason.SKU_RESERVED);
        Long remaining=jdbc.query("SELECT p.product_limit-(SELECT count(*) FROM catalogue_product_identity WHERE vendor_id=a.organization_id AND NOT archived) FROM organization_plan a JOIN plan_revision p ON p.id=a.plan_revision_id WHERE a.organization_id=?",(r,n)->r.getLong(1),vendor).stream().findFirst().orElse(null);
        if(remaining==null||remaining<rows.size())throw failure(ProductFailure.Reason.PLAN_LIMIT_EXCEEDED);var at=now();
        jdbc.batchUpdate("INSERT INTO catalogue_product_identity(id,vendor_id,unit_id,category_id) VALUES(?,?,?,?)",rows,1000,(q,row)->{q.setObject(1,row.id());q.setObject(2,vendor);q.setObject(3,row.values().unitId());q.setObject(4,row.values().categoryId());});
        jdbc.batchUpdate("INSERT INTO catalogue_product(id,vendor_id,sku,normalized_sku,name,normalized_name,description,pack_description,minimum_quantity,quantity_step,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",rows,1000,(q,row)->{var v=row.values();q.setObject(1,row.id());q.setObject(2,vendor);q.setString(3,v.sku());q.setString(4,normalized(v.sku()));q.setString(5,v.name());q.setString(6,normalized(v.name()));q.setString(7,v.description());q.setString(8,v.packDescription());q.setInt(9,v.minimumQuantity());q.setInt(10,v.quantityStep());q.setTimestamp(11,at);q.setTimestamp(12,at);});
        jdbc.batchUpdate("INSERT INTO product_sku_reservation(vendor_id,normalized_sku,product_id) VALUES(?,?,?)",rows,1000,(q,row)->{q.setObject(1,vendor);q.setString(2,normalized(row.values().sku()));q.setObject(3,row.id());});
        var tags=new ArrayList<Object[]>();for(var row:rows)for(UUID tag:row.values().tagIds())tags.add(new Object[]{row.id(),tag});if(!tags.isEmpty())jdbc.batchUpdate("INSERT INTO catalogue_product_tag(product_id,taxonomy_id) VALUES(?,?)",tags);
        var created=findMany(vendor,ids);if(created.size()!=rows.size())throw new IllegalStateException("Created products missing");
        jdbc.batchUpdate("INSERT INTO product_creation(product_id,creator_id,vendor_id,payload_hash,original_snapshot,expires_at) VALUES(?,?,?,?,?::jsonb,?)",rows,1000,(q,row)->{q.setObject(1,row.id());q.setObject(2,actor);q.setObject(3,vendor);q.setBytes(4,row.digest());q.setString(5,JSON.writeValueAsString(created.get(row.id())));q.setTimestamp(6,Timestamp.from(at.toInstant().plus(7,ChronoUnit.DAYS)));});
        for(var row:rows)audit.product(actor,row.id(),ProductAudit.Action.PRODUCT_CREATED,List.of(ProductAudit.Field.sku,ProductAudit.Field.name,ProductAudit.Field.description,ProductAudit.Field.unitId,ProductAudit.Field.packDescription,ProductAudit.Field.categoryId,ProductAudit.Field.tagIds,ProductAudit.Field.minimumQuantity,ProductAudit.Field.quantityStep,ProductAudit.Field.state));
    }
    @Override public void activateMany(UUID actor,UUID vendor,List<UUID> supplied){
        if(supplied.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");if(supplied.isEmpty())return;guard(vendor);var ids=supplied.stream().distinct().toList();var found=findMany(vendor,ids);var selected=new ArrayList<UUID>();var values=new ArrayList<Values>();
        for(UUID id:ids){var item=found.get(id);if(item==null)throw failure(ProductFailure.Reason.NOT_FOUND);if(item.state().equals("ARCHIVED"))throw failure(ProductFailure.Reason.INVALID_STATE);if(item.state().equals("ACTIVE"))continue;if(item.values().unitId()==null)throw failure(ProductFailure.Reason.UNIT_REQUIRED);selected.add(id);values.add(item.values());}
        if(selected.isEmpty())return;referencesMany(vendor,values);pricingPolicy.requireActivationMany(vendor,selected);stockPolicy.requireActivationMany(vendor,selected);var at=now();
        jdbc.batchUpdate("UPDATE catalogue_product_identity SET active=true WHERE id=?",selected,1000,(q,id)->q.setObject(1,id));
        jdbc.batchUpdate("UPDATE catalogue_product SET revision=revision+1,updated_at=? WHERE id=?",selected,1000,(q,id)->{q.setTimestamp(1,at);q.setObject(2,id);});
        for(UUID id:selected)audit.product(actor,id,ProductAudit.Action.PRODUCT_ACTIVATED,List.of(ProductAudit.Field.state));
    }
    private void referencesMany(UUID vendor,List<Values> values){
        var selected=new LinkedHashSet<UUID>();for(var v:values){if(v.unitId()!=null)selected.add(v.unitId());if(v.categoryId()!=null)selected.add(v.categoryId());selected.addAll(v.tagIds());}var ids=new ArrayList<>(selected);var kinds=new HashMap<UUID,String>();
        for(int offset=0;offset<ids.size();offset+=1000){var part=ids.subList(offset,Math.min(ids.size(),offset+1000));var args=new ArrayList<Object>();args.add(vendor);args.addAll(part);jdbc.query("SELECT id,kind FROM catalogue_taxonomy WHERE vendor_id=? AND NOT deleted AND id IN ("+String.join(",",Collections.nCopies(part.size(),"?"))+")",(org.springframework.jdbc.core.RowCallbackHandler)r->kinds.put(r.getObject(1,UUID.class),r.getString(2)),args.toArray());}
        for(var v:values){referenceKind(kinds,v.unitId(),"UNIT","/unitId");referenceKind(kinds,v.categoryId(),"CATEGORY","/categoryId");for(UUID tag:v.tagIds())referenceKind(kinds,tag,"TAG","/tagIds");}
    }
    private static void referenceKind(Map<UUID,String> kinds,UUID id,String kind,String field){if(id!=null&&!kind.equals(kinds.get(id)))throw new ProductFailure(ProductFailure.Reason.INVALID_REFERENCE,field,null);}
}
