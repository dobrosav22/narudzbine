package com.narudzbine.audit;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.*;
import java.sql.Timestamp;
import java.time.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class DeliveryBodyRetentionMigrationIT {
 @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
 @Test void populated61KeepsDeliveryAndOriginalBusinessEvidence(){
  Flyway.configure().dataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword()).target("20261021090000").cleanDisabled(true).load().migrate();
  var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(ds);Instant now=Instant.parse("2026-10-21T00:00:00Z");var ids=new UuidGenerator(Clock.fixed(now,ZoneOffset.UTC));var actor=ids.next();var owner=ids.next();var org=ids.next();var context=ids.next();var event=ids.next();
  new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(ds)).executeWithoutResult(s->{
   jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN','synthetic-admin-migration@example.com',true,'Synthetic administrator','ACTIVE'),(?,'BUSINESS','synthetic-owner-migration@example.com',true,'Synthetic owner','ACTIVE')",actor,owner);
   jdbc.update("INSERT INTO platform_account(id) VALUES(?)",actor);
   jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'BUYER','RS','RSD','Synthetic organization','Synthetic legal','SYN-MIGRATION','Synthetic address','Synthetic city','11000','RS','sr-Latn-RS','ACTIVE',?)",org,owner);
   jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER')",owner,org);
  });
  jdbc.update("INSERT INTO support_access(id,administrator_id,organization_id,country,security_epoch,credential_generation,reason,case_reference,created_at,expires_at) VALUES(?,?,?,'RS',0,0,'Synthetic investigation','SYN-MIGRATION',?,?)",context,actor,org,Timestamp.from(now),Timestamp.from(now.plusSeconds(1800)));
  jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) VALUES(?,'PLATFORM_ADMIN',?,'COMMERCIAL_SUPPORT_READ','SUPPORT_ACCESS',?,'SUCCESS',?,?,ARRAY['supportContext'])",event,actor,context,ids.next(),Timestamp.from(now));
  jdbc.update("INSERT INTO support_read_evidence(audit_id,context_id,organization_id,country,resource_type,resource_id,filters) VALUES(?,?,?,'RS','REPORT',?,'{}')",event,context,org,org);
  var privacy=ids.next();
  jdbc.update("INSERT INTO privacy_case(id,requester_id,organization_id,country,kind,private_reason,created_at) VALUES(?,?,?,'RS','EXPORT','Synthetic private retention request',?)",privacy,owner,org,Timestamp.from(now));
  jdbc.update("INSERT INTO privacy_case_creation(id,requester_id,organization_id,country,payload_digest,created_at,original_response) VALUES(?,?,?,'RS',decode(repeat('11',32),'hex'),?,jsonb_build_object('id',?::text,'organizationId',?::text,'state','REQUESTED'))",privacy,owner,org,Timestamp.from(now),privacy,org);
  String privateCase=jdbc.queryForObject("SELECT to_jsonb(p)::text FROM privacy_case p WHERE id=?",String.class,privacy);
  String receipt=jdbc.queryForObject("SELECT to_jsonb(p)::text FROM privacy_case_creation p WHERE id=?",String.class,privacy);
  var export=ids.next();var vendor=ids.next();var vendorOwner=ids.next();var promotion=ids.next();
  jdbc.update("INSERT INTO commercial_export(id,requester_id,organization_id,country,kind,from_date,to_date,original_response,created_at,revision,state) VALUES(?,?,?,'RS','ORDERS','2026-10-21','2026-10-21',jsonb_build_object('id',?::text,'revision','synthetic','state','QUEUED','expiresAt',NULL,'failureCode',NULL),?,1,'QUEUED')",export,owner,org,export,Timestamp.from(now));
  new org.springframework.transaction.support.TransactionTemplate(new org.springframework.jdbc.datasource.DataSourceTransactionManager(ds)).executeWithoutResult(t->{
   jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'BUSINESS','retention-vendor-migration@example.com',true,'Synthetic vendor owner','ACTIVE')",vendorOwner);
   jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES(?,'VENDOR','RS','RSD','Synthetic retention vendor','Synthetic legal','SYN-RETENTION-VENDOR','Synthetic address','Synthetic city','11000','RS','sr-Latn-RS','ACTIVE',?)",vendor,vendorOwner);
   jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES(?,?,'OWNER')",vendorOwner,vendor);
  });
  jdbc.update("INSERT INTO catalogue_promotion_identity(id,vendor_id) VALUES(?,?)",promotion,vendor);
  jdbc.update("INSERT INTO promotion(id,vendor_id,definition,target_labels,starts_at,ends_at,created_at,updated_at) VALUES(?,?,jsonb_build_object('name','Synthetic retention promotion','kind','PERCENTAGE','value',10,'productMode','ALL','buyerMode','ALL','productIds','[]'::jsonb,'categoryIds','[]'::jsonb,'buyerIds','[]'::jsonb,'startsAt','2026-10-21T00:01:00Z','endsAt','2026-10-21T00:02:00Z'),jsonb_build_object('products','[]'::jsonb,'categories','[]'::jsonb,'buyers','[]'::jsonb),?,?,?,?)",promotion,vendor,Timestamp.from(now.plusSeconds(60)),Timestamp.from(now.plusSeconds(120)),Timestamp.from(now),Timestamp.from(now));
  jdbc.update("INSERT INTO promotion_creation(promotion_id,creator_id,vendor_id,payload_hash,original_snapshot,expires_at) SELECT id,?,?,decode(repeat('22',32),'hex'),to_jsonb(p),? FROM promotion p WHERE id=?",vendorOwner,vendor,Timestamp.from(now.plusSeconds(7*86400)),promotion);
  jdbc.update("INSERT INTO promotion_history(promotion_id,revision,actor_id,snapshot,occurred_at) SELECT id,1,?,to_jsonb(p),? FROM promotion p WHERE id=?",vendorOwner,Timestamp.from(now),promotion);
  String exportBefore=jdbc.queryForObject("SELECT to_jsonb(e)::text FROM commercial_export e WHERE id=?",String.class,export),promotionBefore=jdbc.queryForObject("SELECT to_jsonb(p)::text FROM promotion_creation p WHERE promotion_id=?",String.class,promotion),historyBefore=jdbc.queryForObject("SELECT to_jsonb(p)::text FROM promotion_history p WHERE promotion_id=?",String.class,promotion);
  var audits=jdbc.queryForList("SELECT to_jsonb(a)::text AS snapshot FROM audit_event a ORDER BY id");var contexts=jdbc.queryForList("SELECT to_jsonb(s)::text FROM support_access s ORDER BY id");var reads=jdbc.queryForList("SELECT to_jsonb(s)::text FROM support_read_evidence s ORDER BY audit_id");var identities=jdbc.queryForList("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a ORDER BY id");
  var delivery=ids.next();var source=ids.next();
  jdbc.update("INSERT INTO external_fanout(source_kind,source_id,created_at) VALUES('RESET',?,?)",source,Timestamp.from(now));
  jdbc.update("INSERT INTO external_job(id,source_kind,source_id,channel,state,attempts,next_attempt_at,rendered_body,rendered_destination,provider_reference,terminal_at,created_at) VALUES(?,'RESET',?,'EMAIL','UNKNOWN',1,?,decode('112233','hex'),'synthetic@example.com','synthetic-migration-reference',?,?)",delivery,source,Timestamp.from(now),Timestamp.from(now.minusSeconds(604800)),Timestamp.from(now));
  String deliveryBefore=jdbc.queryForObject("SELECT to_jsonb(j)::text FROM external_job j WHERE id=?",String.class,delivery),fanoutBefore=jdbc.queryForObject("SELECT to_jsonb(f)::text FROM external_fanout f WHERE source_id=?",String.class,source);
  MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
  assertThat(jdbc.queryForObject("SELECT(to_jsonb(j)-'metadata_retired')::text FROM external_job j WHERE id=?",String.class,delivery)).isEqualTo(deliveryBefore);assertThat(jdbc.queryForObject("SELECT NOT metadata_retired FROM external_job WHERE id=?",Boolean.class,delivery)).isTrue();
  assertThat(jdbc.queryForObject("SELECT to_jsonb(f)::text FROM external_fanout f WHERE source_id=?",String.class,source)).isEqualTo(fanoutBefore);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ix_external_job_body_retention'",Integer.class)).isEqualTo(1);
  assertThat(jdbc.queryForList("SELECT to_jsonb(a)::text AS snapshot FROM audit_event a ORDER BY id")).isEqualTo(audits);assertThat(jdbc.queryForList("SELECT to_jsonb(s)::text FROM support_access s ORDER BY id")).isEqualTo(contexts);assertThat(jdbc.queryForList("SELECT to_jsonb(s)::text FROM support_read_evidence s ORDER BY audit_id")).isEqualTo(reads);assertThat(jdbc.queryForList("SELECT (to_jsonb(a)-'privacy_retired_at')::text AS snapshot FROM account_identity a ORDER BY id")).isEqualTo(identities);assertThat(jdbc.queryForObject("SELECT target_organization_id IS NULL AND target_country IS NULL FROM audit_event WHERE id=?",Boolean.class,event)).isTrue();
  assertThatThrownBy(()->jdbc.update("UPDATE audit_event SET target_organization_id=? WHERE id=?",org,event)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("append-only");
  assertThatThrownBy(()->jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,target_organization_id) VALUES(?,'PLATFORM_ADMIN',?,'ACCOUNT_LANGUAGE_CHANGED','ACCOUNT',?,'SUCCESS',?,?,ARRAY['languageOverride'],?)",ids.next(),actor,actor,ids.next(),Timestamp.from(now),org)).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("ck_audit_administrative_target");
  jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields,reason,target_organization_id,target_country) VALUES(?,'PLATFORM_ADMIN',?,'ADMIN_ORGANIZATION_CLOSED','ORGANIZATION',?,'SUCCESS',?,?,ARRAY['state','sessions'],'Synthetic private review',?,'RS')",ids.next(),actor,org,ids.next(),Timestamp.from(now),org);
  assertThatThrownBy(()->jdbc.update("INSERT INTO audit_event(id,actor_type,actor_id,action,resource_type,resource_id,outcome,request_id,occurred_at,changed_fields) VALUES(?,'PLATFORM_ADMIN',?,'ADMIN_ORGANIZATION_CLOSED','ORGANIZATION',?,'SUCCESS',?,?,ARRAY['state'])",ids.next(),actor,org,ids.next(),Timestamp.from(now))).isInstanceOf(org.springframework.dao.DataAccessException.class).hasStackTraceContaining("ck_audit_action_resource");
  assertThat(jdbc.queryForObject("SELECT version FROM backend_schema_version WHERE id=1",Integer.class)).isEqualTo(78);
  assertThat(jdbc.queryForObject("SELECT to_jsonb(p)::text FROM privacy_case p WHERE id=?",String.class,privacy)).isEqualTo(privateCase);
  assertThat(jdbc.queryForObject("SELECT to_jsonb(p)::text FROM privacy_case_creation p WHERE id=?",String.class,privacy)).isEqualTo(receipt);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN('ix_stock_replay_retention','ix_inventory_lifecycle_replay_retention','ix_pricing_deactivation_replay_retention','ix_message_replay_retention','ix_order_stage_creation_retention','ix_draft_creation_retention')",Integer.class)).isEqualTo(6);
  assertThat(jdbc.queryForObject("SELECT (to_jsonb(e)-'artifact_held')::text FROM commercial_export e WHERE id=?",String.class,export)).isEqualTo(exportBefore);assertThat(jdbc.queryForObject("SELECT artifact_held FROM commercial_export WHERE id=?",Boolean.class,export)).isFalse();
  assertThat(jdbc.queryForObject("SELECT to_jsonb(p)::text FROM promotion_creation p WHERE promotion_id=?",String.class,promotion)).isEqualTo(promotionBefore);
  assertThat(jdbc.queryForObject("SELECT to_jsonb(p)::text FROM promotion_history p WHERE promotion_id=?",String.class,promotion)).isEqualTo(historyBefore);
  assertThat(jdbc.queryForObject("SELECT count(*) FROM pg_indexes WHERE indexname IN('ix_promotion_creation_retention','ix_export_creation_retention')",Integer.class)).isEqualTo(2);
  new DatabaseReadiness(ds).verifySchema();
 }
}
