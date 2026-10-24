package com.narudzbine.reporting.application;

import com.narudzbine.audit.api.PrivacyFulfillment;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** No private requester, context or artifact columns belong in the ordinary case metadata read. */
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcPrivacyFulfillment implements PrivacyFulfillment {
    private final JdbcTemplate jdbc;private final java.time.Clock clock;
    public JdbcPrivacyFulfillment(JdbcTemplate jdbc,java.time.Clock clock){this.jdbc=jdbc;this.clock=clock;}
    @Override public Optional<State> current(UUID caseId){jdbc.queryForObject("SELECT expire_privacy_exports(?,?)",Integer.class,caseId,java.sql.Timestamp.from(clock.instant().truncatedTo(java.time.temporal.ChronoUnit.MILLIS)));return jdbc.query("SELECT revision,state FROM privacy_fulfillment_metadata WHERE case_id=? UNION ALL SELECT revision,state FROM privacy_redaction_fulfillment_metadata WHERE case_id=?",(r,n)->new State(r.getLong("revision"),r.getString("state")),caseId,caseId).stream().findFirst();}
}
