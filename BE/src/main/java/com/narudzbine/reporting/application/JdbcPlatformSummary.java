package com.narudzbine.reporting.application;
import com.narudzbine.reporting.api.PlatformSummary;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
@Transactional(propagation=Propagation.MANDATORY,readOnly=true)
public class JdbcPlatformSummary implements PlatformSummary {
 private final JdbcTemplate jdbc;
 public JdbcPlatformSummary(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public List<Country> read(){return jdbc.query("""
  SELECT c.country,
   (SELECT count(*) FROM organization o WHERE o.country=c.country AND o.type='BUYER' AND o.state='ACTIVE') buyers,
   (SELECT count(*) FROM organization o WHERE o.country=c.country AND o.type='VENDOR' AND o.state='ACTIVE') vendors,
   (SELECT count(*) FROM account_identity a JOIN business_account b ON b.id=a.id JOIN organization o ON o.id=b.organization_id WHERE o.country=c.country AND o.state='ACTIVE' AND a.state='ACTIVE' AND a.email_verified) users,
   (SELECT count(*) FROM trading_relationship r JOIN organization v ON v.id=r.vendor_id JOIN organization b ON b.id=r.buyer_id WHERE r.country=c.country AND v.country=c.country AND b.country=c.country AND r.state='ACTIVE' AND v.state='ACTIVE' AND b.state='ACTIVE') connections,
   (SELECT count(*) FROM plan_change_request r JOIN organization o ON o.id=r.vendor_id WHERE o.country=c.country AND r.state='PENDING') requests
  FROM(VALUES('RS',1),('BA',2))c(country,ordinal) ORDER BY ordinal
  """,(r,n)->new Country(r.getString("country"),r.getLong("buyers"),r.getLong("vendors"),r.getLong("users"),r.getLong("connections"),r.getLong("requests")));}
}
