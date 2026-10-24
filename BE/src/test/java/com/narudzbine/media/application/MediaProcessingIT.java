package com.narudzbine.media.application;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.media.api.*;
import com.narudzbine.shared.api.UuidGenerator;
import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.support.*;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@Testcontainers
class MediaProcessingIT {
    @Container static final PostgreSQLContainer DB=new PostgreSQLContainer(DockerImageName.parse("postgres@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336").asCompatibleSubstituteFor("postgres"));
    private static JdbcTemplate owner,workerJdbc;private static TransactionTemplate ownerTx,workerTx;
    private final MutableClock clock=new MutableClock();private final UuidGenerator ids=new UuidGenerator(clock);
    private final Storage storage=new Storage();private MediaProcessing worker;private JdbcMediaUploads uploads;
    private UUID vendor,asset;private String key;private byte[] source,encoded;
    private final java.util.concurrent.atomic.AtomicReference<String> invalid=new java.util.concurrent.atomic.AtomicReference<>();
    @BeforeAll static void migrate()throws Exception {
        MigrationCommand.migrate(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());
        var ds=new DriverManagerDataSource(DB.getJdbcUrl(),DB.getUsername(),DB.getPassword());owner=new JdbcTemplate(ds);ownerTx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        owner.execute("CREATE ROLE processing_test LOGIN PASSWORD 'synthetic-worker-only'");
        String grants=Files.readString(Path.of("native/processing-grants.sql")).replace("__PROCESSING_ROLE__","processing_test");owner.execute(grants);
        var workerDs=new DriverManagerDataSource(DB.getJdbcUrl(),"processing_test","synthetic-worker-only");workerJdbc=new JdbcTemplate(workerDs);workerTx=new TransactionTemplate(new DataSourceTransactionManager(workerDs));
        workerJdbc.execute("SET lock_timeout='2s'");
    }
    @BeforeEach void fixture()throws Exception {
        owner.execute("TRUNCATE media_asset CASCADE");
        vendor=ids.next();UUID actor=ids.next();asset=ids.next();key="quarantine/"+vendor+"/"+asset;
        source=Files.readAllBytes(Path.of("src/test/resources/media/alpha.png"));encoded=new byte[]{1,2,3,4};
        ownerTx.executeWithoutResult(s->{owner.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");owner.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);owner.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);});
        uploads=new JdbcMediaUploads(owner,clock,ids);
        ownerTx.executeWithoutResult(s->{var claim=uploads.reserve(vendor,asset,new MediaUploads.Source(source.length,MediaProcessing.sha(source),"image/png"));uploads.complete(vendor,asset,claim.fence());});
        storage.objects.put(key,source);
        worker=new MediaProcessing(workerJdbc,clock,ids,storage,storage,(raw,type)->{assertThat(raw).isEqualTo(source);if(invalid.get()!=null)throw new MediaFailure(invalid.get());return image();},new DataSourceTransactionManager(workerJdbc.getDataSource()));
    }
    private ImageProcessor.Image image(){return new ImageProcessor.Image(encoded,"image/png",64,32);}
    private MediaProcessing.Claim claim(){return workerTx.execute(s->worker.claim(asset));}
    private String state(){return owner.queryForObject("SELECT state FROM media_asset WHERE id=?",String.class,asset);}
    private long events(String kind){return owner.queryForObject("SELECT count(*) FROM media_upload_event WHERE asset_id=? AND kind=?",Long.class,asset,kind);}
    @Test void heldReadyPublicationKeepsRawAndReleaseResumesCleanup(){
        try(var hold=new com.narudzbine.testing.RetentionHoldFixture(owner,clock,vendor)){
            hold.activate();assertThat(worker.tick()).isEqualTo(1);assertThat(state()).isEqualTo("READY");assertThat(storage.objects).containsKey(key);assertThat(events("RAW_DELETED")).isZero();assertThat(worker.clearReadyRaw()).isZero();assertThat(owner.queryForObject("SELECT count(*) FROM media_disposal_claim",Long.class)).isZero();
            hold.release();assertThat(worker.clearReadyRaw()).isEqualTo(1);assertThat(storage.objects).doesNotContainKey(key);assertThat(events("RAW_DELETED")).isEqualTo(1);assertThat(owner.queryForObject("SELECT completed_at IS NOT NULL FROM media_disposal_claim WHERE asset_id=? AND kind='READY_RAW'",Boolean.class,asset)).isTrue();
        }
    }
    @Test void heldQuarantineDisposalDoesNotCallProviderAndResumesAfterRelease(){
        invalid.set("INVALID_IMAGE");worker.tick();clock.advance(3600);
        try(var hold=new com.narudzbine.testing.RetentionHoldFixture(owner,clock,vendor)){
            hold.activate();assertThat(ownerTx.<Optional<MediaUploads.Cleanup>>execute(s->uploads.claimCleanup(asset))).isEmpty();assertThat(storage.objects).containsKey(key);assertThat(storage.markers).doesNotContain(key);
            hold.release();var cleanup=ownerTx.<Optional<MediaUploads.Cleanup>>execute(s->uploads.claimCleanup(asset)).orElseThrow();storage.delete(cleanup.key());ownerTx.executeWithoutResult(s->uploads.deleted(cleanup));assertThat(state()).isEqualTo("DELETED");assertThat(owner.queryForObject("SELECT completed_at IS NOT NULL FROM media_disposal_claim WHERE asset_id=? AND kind='QUARANTINE'",Boolean.class,asset)).isTrue();
        }
    }
    @Test void heldProcessedDisposalPreservesBytesUntilRelease(){
        worker.tick();clock.advance(86400);
        try(var hold=new com.narudzbine.testing.RetentionHoldFixture(owner,clock,vendor)){
            hold.activate();assertThat(cleanup().clean(asset)).isFalse();assertThat(storage.objects).containsKey("processed/"+vendor+"/"+asset);assertThat(cleanupEvents("DELETED")).isZero();
            hold.release();assertThat(cleanup().clean(asset)).isTrue();assertThat(owner.queryForObject("SELECT completed_at IS NOT NULL FROM media_disposal_claim WHERE asset_id=? AND kind='PROCESSED'",Boolean.class,asset)).isTrue();
        }
    }
    @Test void committedQuarantineClaimBlocksHoldEvenBeforeProviderCall(){
        invalid.set("INVALID_IMAGE");worker.tick();clock.advance(3600);var pending=ownerTx.<Optional<MediaUploads.Cleanup>>execute(s->uploads.claimCleanup(asset)).orElseThrow();
        try(var hold=new com.narudzbine.testing.RetentionHoldFixture(owner,clock,vendor)){
            assertThatThrownBy(hold::activate).isInstanceOf(com.narudzbine.audit.api.PrivacyFailure.class).extracting(e->((com.narudzbine.audit.api.PrivacyFailure)e).code()).isEqualTo("HOLD_ACTIVATION_BLOCKED");clock.advance(121);assertThatThrownBy(hold::activate).isInstanceOf(com.narudzbine.audit.api.PrivacyFailure.class);
            storage.delete(pending.key());ownerTx.executeWithoutResult(s->uploads.deleted(pending));assertThat(hold.activate().state()).isEqualTo("ACTIVE");
        }
    }
    @Test void uncertainProcessedDeletionRetainsClaimAndBlocksActivation(){
        worker.tick();clock.advance(86400);storage.loseDelete=true;assertThatThrownBy(()->cleanup().clean(asset)).isInstanceOf(MediaFailure.class);
        try(var hold=new com.narudzbine.testing.RetentionHoldFixture(owner,clock,vendor)){
            assertThatThrownBy(hold::activate).isInstanceOf(com.narudzbine.audit.api.PrivacyFailure.class).extracting(e->((com.narudzbine.audit.api.PrivacyFailure)e).code()).isEqualTo("HOLD_ACTIVATION_BLOCKED");assertThat(cleanup().clean(asset)).isTrue();assertThat(hold.activate().state()).isEqualTo("ACTIVE");assertThat(owner.queryForObject("SELECT count(*) FROM media_disposal_claim WHERE asset_id=? AND kind='PROCESSED'",Long.class,asset)).isEqualTo(1);
        }
    }
    @Test void uncertainRawDisposalBlocksActivationUntilReceiptReconciles(){
        storage.loseDelete=true;worker.tick();assertThat(state()).isEqualTo("READY");
        try(var hold=new com.narudzbine.testing.RetentionHoldFixture(owner,clock,vendor)){
            assertThatThrownBy(hold::activate).isInstanceOf(com.narudzbine.audit.api.PrivacyFailure.class).extracting(e->((com.narudzbine.audit.api.PrivacyFailure)e).code()).isEqualTo("HOLD_ACTIVATION_BLOCKED");
            assertThat(owner.queryForObject("SELECT count(*) FROM media_disposal_claim WHERE asset_id=? AND completed_at IS NULL",Long.class,asset)).isEqualTo(1);worker.clearReadyRaw();assertThat(owner.queryForObject("SELECT count(*) FROM media_disposal_claim WHERE asset_id=?",Long.class,asset)).isEqualTo(1);assertThat(hold.activate().state()).isEqualTo("ACTIVE");
        }
    }
    @Test void readyPublicationStoresVerifiedProofAndDeletesOnlyRawExactlyOnce(){assertThat(worker.tick()).isEqualTo(1);assertThat(state()).isEqualTo("READY");assertThat(storage.objects.get("processed/"+vendor+"/"+asset)).isEqualTo(encoded);assertThat(storage.objects).doesNotContainKey(key);assertThat(storage.markers).contains(key);assertThat(events("PROCESSING_READY")).isEqualTo(1);assertThat(events("RAW_DELETED")).isEqualTo(1);assertThat(worker.tick()).isZero();assertThat(worker.clearReadyRaw()).isZero();var result=owner.queryForMap("SELECT width,height,processed_bytes,processed_sha256,ready_at,unreferenced_at FROM media_asset WHERE id=?",asset);assertThat(result.get("width")).isEqualTo(64);assertThat(result.get("height")).isEqualTo(32);assertThat(result.get("ready_at")).isEqualTo(result.get("unreferenced_at"));assertThat((byte[])result.get("processed_sha256")).isEqualTo(HexFormat.of().parseHex(MediaProcessing.sha(encoded)));}
    @Test void lostProcessedResponseRetainsLeaseAndRecoversWithoutSecondWrite(){storage.loseWrite=true;assertThat(worker.tick()).isZero();assertThat(state()).isEqualTo("PROCESSING");assertThat(events("PROCESSING_READY")).isZero();assertThat(storage.objects).containsKey(key);clock.advance(121);assertThat(worker.tick()).isEqualTo(1);assertThat(state()).isEqualTo("READY");assertThat(storage.writes).isEqualTo(1);}
    @Test void failedRawDeletionNeverDemotesReadyAndNextTickReconciles(){storage.loseDelete=true;assertThat(worker.tick()).isZero();assertThat(state()).isEqualTo("READY");assertThat(events("RAW_DELETED")).isZero();assertThat(storage.markers).contains(key);assertThat(worker.tick()).isZero();assertThat(events("RAW_DELETED")).isEqualTo(1);assertThat(events("PROCESSING_READY")).isEqualTo(1);}
    @Test void definitivelyInvalidMediaFailsAndRawWaitsForOneHour(){invalid.set("INVALID_IMAGE");assertThat(worker.tick()).isZero();assertThat(state()).isEqualTo("FAILED");assertThat(events("PROCESSING_FAILED")).isEqualTo(1);assertThat(storage.objects).containsKey(key);assertThat(ownerTx.<Optional<MediaUploads.Cleanup>>execute(s->uploads.claimCleanup(asset))).isEmpty();clock.advance(3600);var cleanup=ownerTx.<Optional<MediaUploads.Cleanup>>execute(s->uploads.claimCleanup(asset)).orElseThrow();storage.delete(cleanup.key());ownerTx.executeWithoutResult(s->uploads.deleted(cleanup));assertThat(state()).isEqualTo("DELETED");assertThat(owner.queryForObject("SELECT failure_code FROM media_asset WHERE id=?",String.class,asset)).isEqualTo("INVALID_IMAGE");assertThat(events("RAW_DELETED")).isEqualTo(1);}
    @Test void infrastructureFailuresAreBoundedAndNeverMistakenForInvalidImage(){storage.unavailable=true;for(int n=0;n<3;n++){assertThat(worker.tick()).isZero();assertThat(state()).isEqualTo("PROCESSING");clock.advance(121);}assertThat(worker.tick()).isZero();assertThat(state()).isEqualTo("FAILED");assertThat(owner.queryForObject("SELECT failure_code FROM media_asset WHERE id=?",String.class,asset)).isEqualTo("SERVICE_UNAVAILABLE");assertThat(owner.queryForObject("SELECT attempts FROM media_processing_job WHERE asset_id=?",Integer.class,asset)).isEqualTo(3);}
    @Test void staleWorkerCannotPublishFailOrOverwriteNewLease(){var first=claim();assertThat(claim()).isNull();clock.advance(121);var second=claim();assertThat(second.fence()).isNotEqualTo(first.fence());assertThat(workerTx.<Boolean>execute(s->worker.publish(first,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()))).isFalse();workerTx.executeWithoutResult(s->worker.fail(first,"INVALID_IMAGE"));assertThat(state()).isEqualTo("PROCESSING");assertThat(workerTx.<Boolean>execute(s->worker.publish(second,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()))).isTrue();assertThat(events("PROCESSING_READY")).isEqualTo(1);}
    @Test void expiredProcessingCanBeCleanedButLiveLeaseExcludesCleanup(){clock.advance(3600);var claim=claim();assertThat(ownerTx.<Optional<MediaUploads.Cleanup>>execute(s->uploads.claimCleanup(asset))).isEmpty();assertThat(ownerTx.<List<UUID>>execute(s->uploads.expiredCandidates(25))).doesNotContain(asset);clock.advance(3600);assertThat(ownerTx.<List<UUID>>execute(s->uploads.expiredCandidates(25))).contains(asset);assertThat(ownerTx.<Optional<MediaUploads.Cleanup>>execute(s->uploads.claimCleanup(asset))).isPresent();assertThat(workerTx.<Boolean>execute(s->worker.publish(claim,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()))).isFalse();}
    @Test void ttlCleanupFencesProcessedKeyAgainstPausedStaleWorker(){var stale=claim();clock.advance(3600);var maintenance=new QuarantineMaintenance(uploads,storage,new DataSourceTransactionManager(owner.getDataSource()));assertThat(maintenance.sweep()).isEqualTo(1);assertThat(state()).isEqualTo("DELETED");String processed="processed/"+vendor+"/"+asset;assertThat(storage.markers).contains(processed);assertThatThrownBy(()->storage.processed(processed,encoded,MediaProcessing.sha(encoded),"image/png")).isInstanceOf(MediaFailure.class);assertThat(workerTx.<Boolean>execute(s->worker.publish(stale,processed,MediaProcessing.sha(encoded),image()))).isFalse();}
    @Test void publicationAndEventRollbackTogetherWhenEventInsertFails(){var claim=claim();owner.execute("REVOKE INSERT ON media_upload_event FROM processing_test");try{assertThatThrownBy(()->workerTx.executeWithoutResult(s->worker.publish(claim,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()))).isInstanceOf(org.springframework.dao.DataAccessException.class);}finally{owner.execute("GRANT INSERT ON media_upload_event TO processing_test");}assertThat(state()).isEqualTo("PROCESSING");assertThat(owner.queryForObject("SELECT processed_key FROM media_asset WHERE id=?",String.class,asset)).isNull();assertThat(workerTx.<Boolean>execute(s->worker.publish(claim,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()))).isTrue();}
    @Test void committedPublicationWithUnknownCallerOutcomeReplaysAsCompleted(){var c=claim();assertThat(workerTx.<Boolean>execute(s->worker.publish(c,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()))).isTrue();assertThat(workerTx.<Boolean>execute(s->worker.publish(c,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()))).isFalse();assertThat(events("PROCESSING_READY")).isEqualTo(1);}
    @Test void processingRoleCannotCreateAssetsChangeSourcesOrCommercialRows(){assertThatThrownBy(()->workerJdbc.update("UPDATE media_upload SET sha256=repeat('0',64) WHERE asset_id=?",asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->workerJdbc.update("UPDATE organization SET display_name='forbidden' WHERE id=?",vendor)).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->workerJdbc.update("DELETE FROM media_asset WHERE id=?",asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);}
    @Test void startupAcceptsRestrictedWorkerRoleAndRejectsOwnerOrMissingProofGrant(){com.narudzbine.media.infrastructure.ProcessingAuthority.verify(workerJdbc);assertThatThrownBy(()->com.narudzbine.media.infrastructure.ProcessingAuthority.verify(owner)).isInstanceOf(IllegalStateException.class);owner.execute("REVOKE UPDATE(processed_sha256) ON media_asset FROM processing_test");try{assertThatThrownBy(()->com.narudzbine.media.infrastructure.ProcessingAuthority.verify(workerJdbc)).isInstanceOf(IllegalStateException.class);}finally{owner.execute("GRANT UPDATE(processed_sha256) ON media_asset TO processing_test");}}
    @Test void concurrentWorkersClaimOnlyOnce()throws Exception{try(var pool=Executors.newFixedThreadPool(2)){var start=new CountDownLatch(1);Callable<MediaProcessing.Claim> call=()->{start.await();return claim();};var a=pool.submit(call);var b=pool.submit(call);start.countDown();var values=Arrays.asList(a.get(5,TimeUnit.SECONDS),b.get(5,TimeUnit.SECONDS));assertThat(values.stream().filter(Objects::nonNull).count()).isEqualTo(1);assertThat(owner.queryForObject("SELECT attempts FROM media_processing_job WHERE asset_id=?",Integer.class,asset)).isEqualTo(1);}}
    @Test void databaseRejectsPartialReadyAndRetainsReadyProof(){var c=claim();assertThatThrownBy(()->ownerTx.executeWithoutResult(s->owner.update("UPDATE media_asset SET state='READY' WHERE id=?",asset))).isInstanceOf(org.springframework.dao.DataAccessException.class);workerTx.executeWithoutResult(s->worker.publish(c,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()));assertThatThrownBy(()->owner.update("UPDATE media_asset SET width=1 WHERE id=?",asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->owner.update("UPDATE media_processing_job SET attempts=3 WHERE asset_id=?",asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);}
    @Test void previousUploadSchemaUpgradePreservesConfirmedSourceAndStartsProcessing()throws Exception {
        String name="processing_upgrade_"+UUID.randomUUID().toString().replace("-","");owner.execute("CREATE DATABASE "+name);
        String url=DB.getJdbcUrl().substring(0,DB.getJdbcUrl().lastIndexOf('/')+1)+name;
        org.flywaydb.core.Flyway.configure().dataSource(url,DB.getUsername(),DB.getPassword()).target("20261020120000").cleanDisabled(true).load().migrate();
        var data=new DriverManagerDataSource(url,DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(data);var manager=new DataSourceTransactionManager(data);var transaction=new TransactionTemplate(manager);UUID actor=ids.next();
        var oldUploads=new JdbcMediaUploads(jdbc,clock,ids);
        transaction.executeWithoutResult(s->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);var c=oldUploads.reserve(vendor,asset,new MediaUploads.Source(source.length,MediaProcessing.sha(source),"image/png"));oldUploads.complete(vendor,asset,c.fence());});
        var before=jdbc.queryForMap("SELECT * FROM media_upload WHERE asset_id=?",asset);var events=jdbc.queryForList("SELECT * FROM media_upload_event ORDER BY id");
        MigrationCommand.migrate(url,DB.getUsername(),DB.getPassword());MigrationCommand.migrate(url,DB.getUsername(),DB.getPassword());
        assertThat(jdbc.queryForMap("SELECT * FROM media_upload WHERE asset_id=?",asset)).isEqualTo(before);assertThat(jdbc.queryForList("SELECT * FROM media_upload_event ORDER BY id")).isEqualTo(events);
        assertThat(jdbc.queryForObject("SELECT attempts FROM media_processing_job WHERE asset_id=?",Integer.class,asset)).isZero();
        var upgraded=new MediaProcessing(jdbc,clock,ids,storage,storage,(b,t)->image(),manager);assertThat(upgraded.tick()).isEqualTo(1);assertThat(jdbc.queryForObject("SELECT state FROM media_asset WHERE id=?",String.class,asset)).isEqualTo("READY");
        new com.narudzbine.shared.infrastructure.database.DatabaseReadiness(data).verifySchema();
    }
    @Test void previousNativeSchemaUpgradeRetainsCompletedJobAndAllowsCleanup()throws Exception {
        String name="processing_upgrade_"+UUID.randomUUID().toString().replace("-","");owner.execute("CREATE DATABASE "+name);
        String url=DB.getJdbcUrl().substring(0,DB.getJdbcUrl().lastIndexOf('/')+1)+name;
        org.flywaydb.core.Flyway.configure().dataSource(url,DB.getUsername(),DB.getPassword()).target("20261020130000").cleanDisabled(true).load().migrate();
        var data=new DriverManagerDataSource(url,DB.getUsername(),DB.getPassword());var jdbc=new JdbcTemplate(data);var manager=new DataSourceTransactionManager(data);var transaction=new TransactionTemplate(manager);UUID actor=ids.next();
        var oldUploads=new JdbcMediaUploads(jdbc,clock,ids);
        transaction.executeWithoutResult(s->{jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES (?,'BUSINESS',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO organization(id,type,country,currency,display_name,legal_name,registration_identifier,address_line1,address_city,address_postal_code,address_country,default_language,state,owner_account_id) VALUES (?,'VENDOR','RS','RSD','Synthetic','Synthetic',?,'Synthetic','Synthetic','11000','RS','en','ACTIVE',?)",vendor,vendor.toString(),actor);jdbc.update("INSERT INTO business_account(id,organization_id,role) VALUES (?,?,'OWNER')",actor,vendor);var c=oldUploads.reserve(vendor,asset,new MediaUploads.Source(source.length,MediaProcessing.sha(source),"image/png"));oldUploads.complete(vendor,asset,c.fence());});
        var oldWorker=new MediaProcessing(jdbc,clock,ids,storage,storage,(b,t)->image(),manager);
        // Seed the completed legacy cycle without invoking schema69 destruction functions on schema48.
        var legacyClaim=transaction.execute(s->oldWorker.claim(asset));storage.objects.put("processed/"+vendor+"/"+asset,encoded);
        assertThat(transaction.<Boolean>execute(s->oldWorker.publish(legacyClaim,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()))).isTrue();
        storage.delete(key);transaction.executeWithoutResult(s->{jdbc.update("UPDATE media_upload SET raw_deleted_at=? WHERE asset_id=?",java.sql.Timestamp.from(clock.instant()),asset);jdbc.update("INSERT INTO media_upload_event(id,asset_id,kind,occurred_at) VALUES(?,?,'RAW_DELETED',?)",ids.next(),asset,java.sql.Timestamp.from(clock.instant()));});var completedJob=jdbc.queryForMap("SELECT * FROM media_processing_job WHERE asset_id=?",asset);var proof=jdbc.queryForMap("SELECT processed_key,encode(processed_sha256,'hex') AS processed_sha256,processed_bytes,ready_at FROM media_asset WHERE id=?",asset);
        var before=jdbc.queryForMap("SELECT * FROM media_upload WHERE asset_id=?",asset);var events=jdbc.queryForList("SELECT * FROM media_upload_event ORDER BY id");
        MigrationCommand.migrate(url,DB.getUsername(),DB.getPassword());MigrationCommand.migrate(url,DB.getUsername(),DB.getPassword());
        assertThat(jdbc.queryForMap("SELECT * FROM media_upload WHERE asset_id=?",asset)).isEqualTo(before);assertThat(jdbc.queryForList("SELECT * FROM media_upload_event ORDER BY id")).isEqualTo(events);
        assertThat(jdbc.queryForObject("SELECT attempts FROM media_processing_job WHERE asset_id=?",Integer.class,asset)).isEqualTo(1);
        var upgraded=new MediaProcessing(jdbc,clock,ids,storage,storage,(b,t)->image(),manager);assertThat(upgraded.tick()).isZero();assertThat(jdbc.queryForMap("SELECT * FROM media_processing_job WHERE asset_id=?",asset)).isEqualTo(completedJob);assertThat(jdbc.queryForMap("SELECT processed_key,encode(processed_sha256,'hex') AS processed_sha256,processed_bytes,ready_at FROM media_asset WHERE id=?",asset)).isEqualTo(proof);assertThat(jdbc.queryForObject("SELECT state FROM media_asset WHERE id=?",String.class,asset)).isEqualTo("READY");
        clock.advance(86400);assertThat(new ProcessedMaintenance(jdbc,storage,clock,ids,manager).clean(asset)).isTrue();assertThat(jdbc.queryForObject("SELECT state FROM media_processing_job WHERE asset_id=?",String.class,asset)).isEqualTo("READY");
        new com.narudzbine.shared.infrastructure.database.DatabaseReadiness(data).verifySchema();
    }
    private ProcessedMaintenance cleanup(){return new ProcessedMaintenance(owner,storage,clock,ids,new DataSourceTransactionManager(owner.getDataSource()));}
    private long cleanupEvents(String kind){return owner.queryForObject("SELECT count(*) FROM media_cleanup_event WHERE asset_id=? AND kind=?",Long.class,asset,kind);}
    @Test void processedCleanupExact24HourBoundaryPreservesCompletedJobProofAndEvidence(){
        assertThat(worker.tick()).isEqualTo(1);var before=owner.queryForMap("SELECT processed_key,encode(processed_sha256,'hex') AS processed_sha256,processed_bytes,width,height,ready_at FROM media_asset WHERE id=?",asset);var job=owner.queryForMap("SELECT * FROM media_processing_job WHERE asset_id=?",asset);
        clock.advance(86399);assertThat(cleanup().clean(asset)).isFalse();clock.advance(1);assertThat(cleanup().clean(asset)).isTrue();assertThat(state()).isEqualTo("DELETED");assertThat(cleanup().clean(asset)).isFalse();assertThat(cleanupEvents("CLAIMED")).isEqualTo(1);assertThat(cleanupEvents("DELETED")).isEqualTo(1);assertThat(events("RAW_DELETED")).isEqualTo(1);assertThat(owner.queryForMap("SELECT * FROM media_processing_job WHERE asset_id=?",asset)).isEqualTo(job);assertThat(owner.queryForMap("SELECT processed_key,encode(processed_sha256,'hex') AS processed_sha256,processed_bytes,width,height,ready_at FROM media_asset WHERE id=?",asset)).isEqualTo(before);assertThat(storage.markers).contains(key,"processed/"+vendor+"/"+asset);assertThat(storage.objects).isEmpty();
        assertThatThrownBy(()->owner.update("UPDATE media_asset SET processed_bytes=1 WHERE id=?",asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->owner.update("UPDATE media_asset SET state='READY',processed_deleted_at=NULL WHERE id=?",asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->owner.update("DELETE FROM media_cleanup_event WHERE asset_id=?",asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    @Test void processedCleanupUnknownStorageOutcomeKeepsClaimForRepeatWithoutDuplicateEvents(){
        worker.tick();clock.advance(86400);storage.loseDelete=true;assertThatThrownBy(()->cleanup().clean(asset)).isInstanceOf(MediaFailure.class);assertThat(state()).isEqualTo("READY");assertThat(cleanupEvents("CLAIMED")).isEqualTo(1);assertThat(cleanupEvents("DELETED")).isZero();assertThatThrownBy(()->ownerTx.execute(s->new JdbcMediaAssets(owner).proof(asset))).isInstanceOf(MediaFailure.class);assertThat(cleanup().clean(asset)).isTrue();assertThat(cleanupEvents("CLAIMED")).isEqualTo(1);assertThat(cleanupEvents("DELETED")).isEqualTo(1);
    }
    @Test void processedCleanupRetainedRawDeletionAndWorkerRaceStayConsistent(){
        var c=claim();workerTx.executeWithoutResult(s->worker.publish(c,"processed/"+vendor+"/"+asset,MediaProcessing.sha(encoded),image()));clock.advance(86400);assertThat(cleanup().clean(asset)).isTrue();assertThat(events("RAW_DELETED")).isEqualTo(1);assertThat(worker.clearReadyRaw()).isZero();assertThat(cleanup().sweep()).isZero();
    }
    @Test void processedCleanupEventCommitFailureRollsBackDatabaseAndReconcilesFencedStorage(){
        worker.tick();clock.advance(86400);owner.execute("CREATE FUNCTION fail_synthetic_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='DELETED' THEN RAISE EXCEPTION 'Synthetic cleanup failure';END IF;RETURN NEW;END $$");owner.execute("CREATE TRIGGER tr_synthetic_cleanup BEFORE INSERT ON media_cleanup_event FOR EACH ROW EXECUTE FUNCTION fail_synthetic_cleanup()");try{assertThatThrownBy(()->cleanup().clean(asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);}finally{owner.execute("DROP TRIGGER tr_synthetic_cleanup ON media_cleanup_event");owner.execute("DROP FUNCTION fail_synthetic_cleanup()");}assertThat(state()).isEqualTo("READY");assertThat(cleanupEvents("CLAIMED")).isEqualTo(1);assertThat(cleanupEvents("DELETED")).isZero();assertThat(cleanup().clean(asset)).isTrue();assertThat(state()).isEqualTo("DELETED");assertThat(cleanupEvents("DELETED")).isEqualTo(1);
    }
    @Test void processedCleanupConcurrentCleanersProduceOneClaimAndCompletion()throws Exception{
        worker.tick();clock.advance(86400);try(var pool=Executors.newFixedThreadPool(2)){var start=new CountDownLatch(1);Callable<Boolean> call=()->{start.await();return cleanup().clean(asset);};var a=pool.submit(call);var b=pool.submit(call);start.countDown();a.get(10,TimeUnit.SECONDS);b.get(10,TimeUnit.SECONDS);}assertThat(state()).isEqualTo("DELETED");assertThat(cleanupEvents("CLAIMED")).isEqualTo(1);assertThat(cleanupEvents("DELETED")).isEqualTo(1);
    }
    @Test void processedCleanupDatabaseRejectsMissingCompletionEvidence(){
        worker.tick();clock.advance(86400);assertThatThrownBy(()->ownerTx.executeWithoutResult(s->owner.update("UPDATE media_asset SET state='DELETED',cleanup_claimed_at=?,processed_deleted_at=? WHERE id=?",java.sql.Timestamp.from(clock.instant()),java.sql.Timestamp.from(clock.instant()),asset))).isInstanceOf(org.springframework.transaction.TransactionSystemException.class);assertThat(state()).isEqualTo("READY");assertThat(cleanupEvents("DELETED")).isZero();assertThat(cleanup().clean(asset)).isTrue();
    }
    @Test void processedCleanupUsesOneTimestampPerTransactionWithAdvancingClock(){
        worker.tick();clock.advance(86400);Clock ticking=new Clock(){@Override public Instant instant(){Instant at=clock.instant();clock.advance(1);return at;}@Override public ZoneId getZone(){return ZoneOffset.UTC;}@Override public Clock withZone(ZoneId zone){return this;}};var maintenance=new ProcessedMaintenance(owner,storage,ticking,ids,new DataSourceTransactionManager(owner.getDataSource()));assertThat(maintenance.clean(asset)).isTrue();assertThat(owner.queryForObject("SELECT occurred_at=(SELECT processed_deleted_at FROM media_asset WHERE id=?) FROM media_cleanup_event WHERE asset_id=? AND kind='DELETED'",Boolean.class,asset,asset)).isTrue();
    }
    @Test void processedCleanupProcessingRoleCannotForgeCleanupEvidence(){
        worker.tick();assertThatThrownBy(()->workerJdbc.update("UPDATE media_asset SET processed_deleted_at=now() WHERE id=?",asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);assertThatThrownBy(()->workerJdbc.update("INSERT INTO media_cleanup_event(id,asset_id,kind,occurred_at) VALUES (?,?,'DELETED',now())",ids.next(),asset)).isInstanceOf(org.springframework.dao.DataAccessException.class);
    }
    static class MutableClock extends Clock {private Instant time=Instant.parse("2026-10-20T12:00:00Z");void advance(long seconds){time=time.plusSeconds(seconds);}@Override public Instant instant(){return time;}@Override public java.time.ZoneId getZone(){return ZoneOffset.UTC;}@Override public Clock withZone(java.time.ZoneId zone){return this;}}
    static class Storage implements ProcessingStorage,PrivateQuarantine {
        final Map<String,byte[]> objects=new ConcurrentHashMap<>();final Set<String> markers=ConcurrentHashMap.newKeySet();boolean loseWrite,loseDelete,unavailable;int writes;
        private void outside(){assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();if(unavailable)throw new MediaFailure("SERVICE_UNAVAILABLE");}
        @Override public byte[] raw(String key,long bytes,String sha){outside();byte[] value=objects.get(key);assertThat(value.length).isEqualTo(bytes);assertThat(MediaProcessing.sha(value)).isEqualTo(sha);return value;}
        @Override public void processed(String key,byte[] bytes,String sha,String type){outside();if(markers.contains(key))throw new MediaFailure("SERVICE_UNAVAILABLE");assertThat(MediaProcessing.sha(bytes)).isEqualTo(sha);byte[] old=objects.putIfAbsent(key,bytes);if(old==null)writes++;else assertThat(old).isEqualTo(bytes);if(loseWrite){loseWrite=false;throw new MediaFailure("SERVICE_UNAVAILABLE");}}
        @Override public void delete(String key){outside();objects.remove(key);markers.add(key);if(loseDelete){loseDelete=false;throw new MediaFailure("SERVICE_UNAVAILABLE");}}
        @Override public void fenceProcessed(String key){delete(key);}
        @Override public void ensure(String key,Path file,long bytes,String sha,String md5,String type){throw new AssertionError("Unexpected upload call");}
    }
}
