package com.narudzbine.catalogue.application;
import com.narudzbine.catalogue.api.*;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcProductPricingContext implements ProductPricingContext {
 private final JdbcTemplate jdbc;
 public JdbcProductPricingContext(JdbcTemplate jdbc){this.jdbc=jdbc;}
 @Override public Rules require(UUID vendor,UUID product){var rows=jdbc.query("SELECT d.minimum_quantity,d.quantity_step,p.archived,p.active,o.currency FROM catalogue_product d JOIN catalogue_product_identity p ON p.id=d.id JOIN organization o ON o.id=d.vendor_id WHERE d.vendor_id=? AND d.id=?",(r,n)->new Rules(r.getInt(1),r.getInt(2),r.getBoolean(3)?"ARCHIVED":r.getBoolean(4)?"ACTIVE":"INACTIVE",r.getString(5)),vendor,product);if(rows.isEmpty()){throw new ProductFailure(ProductFailure.Reason.NOT_FOUND,null,null);}return rows.getFirst();}

 @Override public java.util.Map<UUID,Rules> requireMany(UUID vendor,java.util.Collection<UUID> supplied){
  if(supplied.size()>1000)throw new IllegalArgumentException("Batch exceeds internal bound");
  var ids=supplied.stream().distinct().toList();if(ids.isEmpty())return java.util.Map.of();
  var args=new java.util.ArrayList<Object>();args.add(vendor);args.addAll(ids);var result=new java.util.LinkedHashMap<UUID,Rules>();
  jdbc.query("SELECT d.id,d.minimum_quantity,d.quantity_step,p.archived,p.active,o.currency FROM catalogue_product d JOIN catalogue_product_identity p ON p.id=d.id JOIN organization o ON o.id=d.vendor_id WHERE d.vendor_id=? AND d.id IN ("+String.join(",",java.util.Collections.nCopies(ids.size(),"?"))+")",(org.springframework.jdbc.core.RowCallbackHandler)r->result.put(r.getObject(1,UUID.class),new Rules(r.getInt(2),r.getInt(3),r.getBoolean(4)?"ARCHIVED":r.getBoolean(5)?"ACTIVE":"INACTIVE",r.getString(6))),args.toArray());
  if(result.size()!=ids.size())throw new ProductFailure(ProductFailure.Reason.NOT_FOUND,null,null);return java.util.Map.copyOf(result);
 }
}
