package com.narudzbine.inventory.application;
import com.narudzbine.inventory.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcOrderStock implements OrderStock {
 private final JdbcTemplate jdbc;private final UuidGenerator ids;
 public JdbcOrderStock(JdbcTemplate jdbc,UuidGenerator ids){this.jdbc=jdbc;this.ids=ids;}
 public void lock(UUID vendor){jdbc.queryForMap("SELECT vendor_id FROM inventory_control WHERE vendor_id=? FOR UPDATE",vendor);}
 public void release(UUID order,UUID vendor,UUID actor,Instant at){
  var obligations=jdbc.queryForList("SELECT product_id,quantity FROM order_stock_obligation WHERE order_id=? AND vendor_id=? AND deducted ORDER BY product_id",order,vendor);
  for(var obligation:obligations){UUID product=(UUID)obligation.get("product_id");int quantity=((Number)obligation.get("quantity")).intValue();var b=jdbc.queryForMap("SELECT available_count,credit_quantity,revision,confirmed_epoch FROM stock_balance WHERE vendor_id=? AND product_id=? FOR UPDATE",vendor,product);int credit=((Number)b.get("credit_quantity")).intValue();long revision=((Number)b.get("revision")).longValue();if(credit<quantity){throw new IllegalStateException("Original dispatch credit obligation missing");}
   jdbc.update("INSERT INTO order_stock_release(order_id,product_id,vendor_id,quantity,actor_id,created_at,before_count,before_credit,after_credit,before_revision,after_revision,confirmed_epoch) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",order,product,vendor,quantity,actor,Timestamp.from(at),b.get("available_count"),credit,credit-quantity,revision,revision+1,b.get("confirmed_epoch"));
   jdbc.update("UPDATE stock_balance SET credit_quantity=?,revision=revision+1 WHERE vendor_id=? AND product_id=?",credit-quantity,vendor,product);
  }
 }
 public void restore(UUID order,UUID vendor,UUID actor,Instant at){
  var lines=jdbc.queryForList("SELECT product_id,quantity FROM order_stock_obligation WHERE order_id=? AND vendor_id=? AND deducted ORDER BY product_id",order,vendor);
  for(var line:lines){UUID product=(UUID)line.get("product_id");int quantity=((Number)line.get("quantity")).intValue();var row=jdbc.queryForMap("SELECT available_count,credit_quantity,revision,confirmed_epoch FROM stock_balance WHERE vendor_id=? AND product_id=? FOR UPDATE",vendor,product);Integer before=(Integer)row.get("available_count");long credit=((Number)row.get("credit_quantity")).longValue();if(before==null||credit<quantity||(long)before+quantity>1000000000){throw new IllegalStateException("Original stock credit headroom unavailable");}
   jdbc.update("INSERT INTO order_stock_credit(order_id,product_id,vendor_id,quantity,actor_id,created_at,before_count,after_count,before_credit,after_credit,before_revision,confirmed_epoch) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",order,product,vendor,quantity,actor,Timestamp.from(at),before,before+quantity,credit,credit-quantity,row.get("revision"),row.get("confirmed_epoch"));
   jdbc.update("UPDATE stock_balance SET available_count=available_count+?,credit_quantity=credit_quantity-?,revision=revision+1 WHERE product_id=?",quantity,quantity,product);
   jdbc.update("INSERT INTO stock_event(id,vendor_id,product_id,type,before_count,after_count,delta,actor_id,order_id,created_at) VALUES(?,?,?,'ORDER_CREDITED',?,?,?,?,?,?)",ids.next(),vendor,product,before,before+quantity,quantity,actor,order,Timestamp.from(at));
  }
 }
 public void deduct(UUID order,UUID vendor,UUID buyer,UUID actor,List<Line> lines,Instant at){
  var control=jdbc.queryForMap("SELECT enabled,confirmation_epoch FROM inventory_control WHERE vendor_id=? FOR UPDATE",vendor);boolean tracked=(Boolean)control.get("enabled");long epoch=((Number)control.get("confirmation_epoch")).longValue();
  var sorted=lines.stream().sorted(Comparator.comparing(line->line.product().toString())).toList();
  if(sorted.isEmpty())throw new IllegalArgumentException("Order lines required");
  var args=new ArrayList<Object>();args.add(vendor);sorted.forEach(line->args.add(line.product()));
  var balances=new HashMap<UUID,Map<String,Object>>();
  for(var row:jdbc.queryForList("SELECT product_id,available_count,confirmed_epoch FROM stock_balance WHERE vendor_id=? AND product_id IN ("+String.join(",",Collections.nCopies(sorted.size(),"?"))+") ORDER BY product_id FOR UPDATE",args.toArray()))balances.put((UUID)row.get("product_id"),row);
  for(var line:sorted){var balance=balances.get(line.product());if(balance==null)throw new IllegalStateException("Original product balance missing");Integer before=(Integer)balance.get("available_count");if(tracked&&(before==null||((Number)balance.get("confirmed_epoch")).longValue()!=epoch||before<line.quantity()))throw new IllegalStateException("Stock changed outside organization guard");}
  jdbc.batchUpdate("INSERT INTO order_stock_obligation(order_id,product_id,vendor_id,quantity,deducted,created_at) VALUES(?,?,?,?,?,?)",sorted,500,(statement,line)->{statement.setObject(1,order);statement.setObject(2,line.product());statement.setObject(3,vendor);statement.setInt(4,line.quantity());statement.setBoolean(5,tracked);statement.setTimestamp(6,Timestamp.from(at));});
  if(tracked)for(var line:sorted){int before=((Number)balances.get(line.product()).get("available_count")).intValue();jdbc.update("UPDATE stock_balance SET available_count=available_count-?,credit_quantity=credit_quantity+?,revision=revision+1 WHERE product_id=?",line.quantity(),line.quantity(),line.product());jdbc.update("INSERT INTO stock_event(id,vendor_id,product_id,type,before_count,after_count,delta,actor_id,order_id,created_at) VALUES(?,?,?,'ORDER_DEDUCTED',?,?,?,?,?,?)",ids.next(),vendor,line.product(),before,before-line.quantity(),-line.quantity(),actor,order,Timestamp.from(at));}
 }

}
