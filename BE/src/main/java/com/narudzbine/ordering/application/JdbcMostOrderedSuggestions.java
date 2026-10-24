package com.narudzbine.ordering.application;
import com.narudzbine.ordering.api.MostOrderedSuggestions;
import com.narudzbine.organizations.api.Country;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcMostOrderedSuggestions implements MostOrderedSuggestions {
 private final JdbcTemplate jdbc;
 public JdbcMostOrderedSuggestions(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public Page list(UUID buyer,Country country,UUID vendor,int page,int size,boolean total){
  var rows=jdbc.query("""
   WITH ranked AS MATERIALIZED(
    SELECT l.product_id,l.vendor_id,count(DISTINCT o.id) AS frequency,sum(l.quantity::numeric) AS quantity
    FROM purchase_order o JOIN purchase_order_line l ON l.order_id=o.id AND l.vendor_id=o.vendor_id
    JOIN organization b ON b.id=o.buyer_id AND b.type='BUYER' AND b.state='ACTIVE' AND b.country=?
    JOIN organization v ON v.id=o.vendor_id AND v.type='VENDOR' AND v.state='ACTIVE' AND v.country=b.country
    JOIN trading_relationship r ON r.vendor_id=v.id AND r.buyer_id=b.id AND r.country=b.country AND r.state='ACTIVE'
    JOIN catalogue_product_identity p ON p.id=l.product_id AND p.vendor_id=v.id AND p.active AND NOT p.archived
    JOIN catalogue_product d ON d.id=p.id AND d.vendor_id=v.id
    LEFT JOIN LATERAL(SELECT state FROM purchase_order_event WHERE order_id=o.id ORDER BY revision DESC LIMIT 1)latest ON true
    WHERE o.buyer_id=? AND o.country=b.country AND (?::uuid IS NULL OR o.vendor_id=?) AND COALESCE(latest.state,o.state)='DELIVERED'
    GROUP BY l.product_id,l.vendor_id
   ),page AS(SELECT * FROM ranked ORDER BY frequency DESC,quantity DESC,product_id ASC LIMIT ? OFFSET ?)
   SELECT p.*,c.total FROM(SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM ranked)c LEFT JOIN page p ON true
   ORDER BY p.frequency DESC,p.quantity DESC,p.product_id ASC
   """,(r,n)->new Row(r.getObject("product_id")==null?null:new Item(r.getObject("product_id",UUID.class),r.getObject("vendor_id",UUID.class)),(Long)r.getObject("total")),country.name(),buyer,vendor,vendor,size,Math.multiplyExact(page,size),total);
  return new Page(rows.stream().map(Row::item).filter(Objects::nonNull).toList(),rows.getFirst().total());
 }
 private record Row(Item item,Long total){}
}
