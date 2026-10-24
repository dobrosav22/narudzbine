package com.narudzbine.ordering.application;
import com.narudzbine.ordering.api.ReviewFailure;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
/** Caller holds sorted original-party guards throughout review or the submission transaction. */
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcOrderReplacements {
 private final JdbcTemplate jdbc;
 public JdbcOrderReplacements(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public Optional<ReviewFailure.Reason> invalid(UUID buyer,UUID vendor,UUID predecessor){
  if(predecessor==null){return Optional.empty();}
  var rows=jdbc.queryForList("SELECT (SELECT e.state FROM purchase_order_event e WHERE e.order_id=o.id ORDER BY revision DESC LIMIT 1) AS state,EXISTS(SELECT 1 FROM order_replacement r WHERE r.predecessor_id=o.id) AS replaced FROM purchase_order o WHERE o.id=? AND o.buyer_id=? AND o.vendor_id=?",predecessor,buyer,vendor);
  if(rows.isEmpty()){return Optional.of(ReviewFailure.Reason.NOT_FOUND);}var row=rows.getFirst();return "CANCELLED".equals(row.get("state"))&&!Boolean.TRUE.equals(row.get("replaced"))?Optional.empty():Optional.of(ReviewFailure.Reason.INVALID_STATE);
 }
 public void link(UUID predecessor,UUID successor,UUID buyer,UUID vendor,UUID actor,Instant at){if(predecessor!=null){jdbc.update("INSERT INTO order_replacement(predecessor_id,successor_id,buyer_id,vendor_id,actor_id,created_at) VALUES(?,?,?,?,?,?)",predecessor,successor,buyer,vendor,actor,Timestamp.from(at));}}
}
