package com.narudzbine.testing;

import com.narudzbine.audit.api.*;
import com.narudzbine.audit.infrastructure.*;
import com.narudzbine.shared.api.*;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.UUID;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Synthetic local operator and original case; uses the real hold service and schema guards. */
public final class RetentionHoldFixture implements AutoCloseable {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final UUID actor=UUID.randomUUID(),session=UUID.randomUUID(),caseId=UUID.randomUUID();
    private final PrivateCaseReview.Actor principal=new PrivateCaseReview.Actor(actor,session,"NATIVE");
    private final PrivateCaseReview.Target target;
    private final JdbcRetentionHolds holds;
    private final RetentionHolds.Context context=new RetentionHolds.Context("Synthetic hold fixture","SYN-LOCAL-HOLD");
    private RetentionHolds.View active;
    public RetentionHoldFixture(JdbcTemplate jdbc,Clock clock,UUID organization){
        this.jdbc=jdbc;this.clock=clock;tx=new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
        target=new PrivateCaseReview.Target(organization,jdbc.queryForObject("SELECT country FROM organization WHERE id=?",String.class,organization));
        var beans=new StaticListableBeanFactory();beans.addBean("revisions",new ResourceRevisions(new byte[32]));
        holds=new JdbcRetentionHolds(jdbc,new JdbcPrivateCaseReview(jdbc,clock,new UuidGenerator(clock)),clock,new UuidGenerator(clock),beans.getBeanProvider(ResourceRevisions.class));
        tx.executeWithoutResult(s->{
            jdbc.execute("SET LOCAL narudzbine.operator_change_reference='SYN-HOLD-FIXTURE'");
            jdbc.update("INSERT INTO account_identity(id,kind,email,email_verified,display_name,state) VALUES(?,'PLATFORM_ADMIN',?,true,'Synthetic','ACTIVE')",actor,actor+"@example.com");jdbc.update("INSERT INTO platform_account(id) VALUES(?)",actor);
            jdbc.update("INSERT INTO application_session(id,account_id,transport,token_hash,device_label,created_at,last_qualified_activity_at,absolute_expires_at,auth_at,auth_method_type,credential_generation,security_epoch) VALUES(?,?,'NATIVE',?,'Synthetic',?,?,?,?,'PASSWORD',0,0)",session,actor,UUID.randomUUID().toString().replace("-","").getBytes(java.nio.charset.StandardCharsets.US_ASCII),at(),at(),Timestamp.from(clock.instant().plusSeconds(43200)),at());
            jdbc.update("INSERT INTO privacy_operator(account_id,created_at) VALUES(?,?)",actor,at());
            UUID requester=jdbc.queryForObject("SELECT owner_account_id FROM organization WHERE id=?",UUID.class,organization);
            jdbc.update("INSERT INTO privacy_case(id,requester_id,organization_id,country,kind,private_reason,created_at) VALUES(?,?,?,?,'EXPORT','Synthetic hold fixture',?)",caseId,requester,organization,target.country(),at());
        });
    }
    public RetentionHolds.View activate(){return tx.execute(s->{fresh();active=holds.activate(principal,caseId,target,UUID.randomUUID(),context);return active;});}
    public void release(){if(active!=null){tx.executeWithoutResult(s->{fresh();holds.release(principal,caseId,active.id(),active.revision(),context);});active=null;}}
    private void fresh(){jdbc.update("UPDATE application_session SET auth_at=?,last_qualified_activity_at=? WHERE id=?",at(),at(),session);}
    private Timestamp at(){return Timestamp.from(clock.instant());}
    @Override public void close(){release();}
}
