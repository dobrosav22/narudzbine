package com.narudzbine.audit.infrastructure;
import java.sql.Timestamp;
import java.time.Clock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class PrivateReviewCleanup {
 private final JdbcTemplate jdbc;private final Clock clock;
 public PrivateReviewCleanup(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
 @Transactional(propagation=Propagation.REQUIRES_NEW,timeout=10)
 public int sweep(){return jdbc.update("WITH expired AS(SELECT id FROM privacy_review_access WHERE nonce_hash IS NOT NULL AND expires_at<=? ORDER BY expires_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED) UPDATE privacy_review_access p SET nonce_hash=NULL,session_token_hash=NULL FROM expired e WHERE p.id=e.id",Timestamp.from(clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MILLIS)));}
}
