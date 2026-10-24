package com.narudzbine.audit.infrastructure;

import java.sql.Timestamp;
import java.time.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PrivacyReplayCleanup {
    private final JdbcTemplate jdbc;private final Clock clock;
    public PrivacyReplayCleanup(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
    /** One bounded transaction; never deletes the immutable case or replay identity. */
    @Transactional(timeout=10)
    public int sweep(){return jdbc.update("WITH expired AS(SELECT id FROM privacy_case_creation WHERE original_response IS NOT NULL AND created_at<=? ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED) UPDATE privacy_case_creation p SET original_response=NULL FROM expired e WHERE p.id=e.id",Timestamp.from(clock.instant().minus(Duration.ofDays(7))));}
}
