package com.narudzbine.organizations.application;
import com.narudzbine.organizations.api.*;
import com.narudzbine.audit.api.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.sql.Timestamp;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcOrganizationLifecycle implements OrganizationLifecycle {
 private final JdbcTemplate jdbc;private final OrganizationSettings settings;private final OrganizationAudit own;private final AdministrativeAudit administrative;private final Clock clock;
 public JdbcOrganizationLifecycle(JdbcTemplate jdbc,OrganizationSettings settings,OrganizationAudit own,AdministrativeAudit administrative,Clock clock){this.jdbc=jdbc;this.settings=settings;this.own=own;this.administrative=administrative;this.clock=clock;}
 public OrganizationRecord close(UUID actor,UUID org,String reason,boolean platform){var old=settings.read(org);if(old.state().equals("CLOSED"))return old;jdbc.update("UPDATE organization SET state='CLOSED',revision=revision+1,updated_at=? WHERE id=?",Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),org);if(platform)administrative.closed(actor,org,old.country().name(),reason);else own.closed(actor,org,reason);return settings.read(org);}
}
