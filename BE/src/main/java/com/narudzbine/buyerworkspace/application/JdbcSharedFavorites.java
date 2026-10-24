package com.narudzbine.buyerworkspace.application;
import com.narudzbine.buyerworkspace.api.SharedFavorites;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcSharedFavorites implements SharedFavorites {
 private final JdbcTemplate jdbc;private final Clock clock;
 public JdbcSharedFavorites(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
 public Page list(UUID buyer,int page,int size,boolean total){
  var rows=jdbc.query("""
   WITH filtered AS MATERIALIZED (SELECT * FROM buyer_favorite WHERE buyer_id=?),
   page AS (SELECT * FROM filtered ORDER BY created_at DESC,product_id ASC LIMIT ? OFFSET ?)
   SELECT p.*,c.total FROM (SELECT CASE WHEN ? THEN count(*) ELSE NULL END total FROM filtered)c
   LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.product_id ASC
   """,(r,n)->new Row(r.getObject("product_id")==null?null:map(r),(Long)r.getObject("total")),buyer,size,Math.multiplyExact(page,size),total);
  return new Page(rows.stream().map(Row::item).filter(Objects::nonNull).toList(),rows.getFirst().total());
 }
 public Item add(UUID buyer,UUID vendor,UUID product){
  jdbc.update("INSERT INTO buyer_favorite(buyer_id,vendor_id,product_id,created_at) VALUES (?,?,?,?) ON CONFLICT(buyer_id,product_id) DO NOTHING",buyer,vendor,product,java.sql.Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)));
  return jdbc.query("SELECT * FROM buyer_favorite WHERE buyer_id=? AND product_id=?",(r,n)->map(r),buyer,product).getFirst();
 }
 public void remove(UUID buyer,UUID product){jdbc.update("DELETE FROM buyer_favorite WHERE buyer_id=? AND product_id=?",buyer,product);}
 private static Item map(ResultSet r)throws SQLException{return new Item(r.getObject("product_id",UUID.class),r.getObject("vendor_id",UUID.class),r.getTimestamp("created_at").toInstant());}
 private record Row(Item item,Long total){}
}
