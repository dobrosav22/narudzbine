package com.narudzbine.organizations.application;
import com.narudzbine.organizations.api.*;
import com.narudzbine.audit.api.AdministrativeAudit;
import java.util.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.sql.Timestamp;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Caller holds current named-platform authority and target organization guard for correction. */
@Service
@Transactional(propagation=Propagation.MANDATORY)
public class JdbcAdministrativeOrganizations implements AdministrativeOrganizations {
 private final JdbcTemplate jdbc;private final OrganizationSettings settings;private final AdministrativeAudit audit;private final Clock clock;
 public JdbcAdministrativeOrganizations(JdbcTemplate jdbc,OrganizationSettings settings,AdministrativeAudit audit,Clock clock){this.jdbc=jdbc;this.settings=settings;this.audit=audit;this.clock=clock;}
 public Page list(Query q){
  var rows=jdbc.query("""
   WITH filtered AS MATERIALIZED(SELECT * FROM organization
    WHERE (?::text IS NULL OR country=?) AND (?::text IS NULL OR type=?) AND (?::text IS NULL OR state=?)
     AND (strpos(lower(display_name),lower(?))>0 OR strpos(lower(legal_name),lower(?))>0 OR strpos(normalized_registration_identifier,lower(?))>0)),
   page AS(SELECT * FROM filtered ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?)
   SELECT p.*,c.total FROM(SELECT CASE WHEN ? THEN count(*) ELSE NULL END AS total FROM filtered)c LEFT JOIN page p ON true ORDER BY p.created_at DESC,p.id ASC
   """,(r,n)->new Row(r.getObject("id")==null?null:OrganizationRows.map(r,n),(Long)r.getObject("total")),q.country(),q.country(),q.type(),q.type(),q.state(),q.state(),q.query(),q.query(),q.query(),q.size(),Math.multiplyExact(q.page(),q.size()),q.total());
  return new Page(rows.stream().map(Row::item).filter(Objects::nonNull).toList(),rows.getFirst().total());
 }
 public OrganizationRecord read(UUID id){if(!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM organization WHERE id=?)",Boolean.class,id)))throw new OrganizationAdministrationFailure("NOT_FOUND");return settings.read(id);}
 public OrganizationRecord correct(UUID actor,UUID id,Correction v,String reason){
  var old=read(id);if(old.country()!=v.address().country())throw new OrganizationAdministrationFailure("COUNTRY_IMMUTABLE");var fields=new ArrayList<String>();if(!old.displayName().equals(v.displayName()))fields.add("displayName");if(!old.legalName().equals(v.legalName()))fields.add("legalName");if(!old.registrationIdentifier().equals(v.registrationIdentifier()))fields.add("registrationIdentifier");if(!Objects.equals(old.taxIdentifier(),v.taxIdentifier()))fields.add("taxIdentifier");if(!old.registeredAddress().equals(v.address()))fields.add("registeredAddress");if(fields.isEmpty())return old;
  var a=v.address();try{jdbc.update("UPDATE organization SET display_name=?,legal_name=?,registration_identifier=?,tax_identifier=?,address_line1=?,address_line2=?,address_city=?,address_postal_code=?,address_latitude=?,address_longitude=?,revision=revision+1,updated_at=? WHERE id=?",v.displayName(),v.legalName(),v.registrationIdentifier(),v.taxIdentifier(),a.line1(),a.line2(),a.city(),a.postalCode(),a.latitude(),a.longitude(),Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),id);}catch(DuplicateKeyException collision){throw new OrganizationAdministrationFailure("ORGANIZATION_IDENTIFIER_IN_USE");}
  audit.organization(actor,id,old.country().name(),fields,reason);return read(id);
 }
 public OrganizationRecord state(UUID actor,UUID id,boolean active,String reason){
  var old=read(id);if(old.state().equals("CLOSED"))throw new OrganizationAdministrationFailure("ORGANIZATION_CLOSED");String next=active?"ACTIVE":"SUSPENDED";if(old.state().equals(next))return old;
  jdbc.update("UPDATE organization SET state=?,revision=revision+1,updated_at=? WHERE id=?",next,Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS)),id);
  audit.state(actor,id,old.country().name(),active,reason);return read(id);
 }
 private record Row(OrganizationRecord item,Long total){}
}
