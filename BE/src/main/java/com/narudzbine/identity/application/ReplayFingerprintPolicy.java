package com.narudzbine.identity.application;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.Base64;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
/** Startup-only compatibility binding. Never stores a raw key or authorizes a business request. */
public final class ReplayFingerprintPolicy {
 private final JdbcTemplate jdbc;private final TransactionTemplate tx;private final byte[] fingerprint;private final boolean explicit;private final Clock clock;
 public ReplayFingerprintPolicy(JdbcTemplate jdbc,PlatformTransactionManager manager,String encoded,boolean explicit,Clock clock){this.jdbc=jdbc;this.tx=new TransactionTemplate(manager);tx.setTimeout(10);this.explicit=explicit;this.clock=clock;try{byte[] key=Base64.getDecoder().decode(encoded);if(key.length<32){throw new IllegalArgumentException();}var digest=MessageDigest.getInstance("SHA-256");digest.update("narudzbine/replay-fingerprint-binding/v1\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII));fingerprint=digest.digest(key);}catch(java.security.GeneralSecurityException|IllegalArgumentException e){throw new IllegalArgumentException("A valid replay fingerprint key of at least32 bytes is required.");}}
 public void bind(){
  tx.executeWithoutResult(status->{
   var existing=jdbc.queryForList("SELECT fingerprint FROM replay_fingerprint_binding WHERE id=1",byte[].class);
   if(existing.isEmpty()&&!explicit&&Boolean.TRUE.equals(jdbc.queryForObject(
       "SELECT EXISTS(SELECT 1 FROM stock_replay) OR EXISTS(SELECT 1 FROM invitation_resend)",Boolean.class))){
    throw new IllegalStateException("Historical replay records require an explicitly pinned original fingerprint key before startup.");
   }
   // The unique singleton insert also serializes competing initial application instances.
   jdbc.update("INSERT INTO replay_fingerprint_binding(id,fingerprint,created_at) VALUES(1,?,?) ON CONFLICT(id) DO NOTHING",fingerprint,Timestamp.from(clock.instant()));
   byte[] actual=jdbc.queryForObject("SELECT fingerprint FROM replay_fingerprint_binding WHERE id=1",byte[].class);
   if(!MessageDigest.isEqual(fingerprint,actual)){
    throw new IllegalStateException("Replay fingerprint key does not match the retained database binding. Restore the pinned compatibility key; never delete replay history.");
   }
  });
 }
}
