package com.narudzbine.reporting.application;

import com.narudzbine.reporting.api.*;
import java.util.concurrent.Semaphore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public final class ExportEngine {
    private final JdbcExports exports;private final ExportSettings settings;private final ExportAuthority authority;private final ExportProjection projection;
    private final JdbcTemplate jdbc;private final TransactionTemplate tx,snapshot;private final Semaphore slot=new Semaphore(1);
    public ExportEngine(JdbcExports exports,ExportSettings settings,ExportAuthority authority,ExportProjection projection,JdbcTemplate jdbc,PlatformTransactionManager manager){
        this.exports=exports;this.settings=settings;this.authority=authority;this.projection=projection;this.jdbc=jdbc;
        tx=new TransactionTemplate(manager);tx.setTimeout(30);snapshot=new TransactionTemplate(manager);snapshot.setReadOnly(true);snapshot.setTimeout(25);snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);snapshot.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    public int tick(){
        if(!settings.enabled()||!slot.tryAcquire())return 0;
        try{
            tx.executeWithoutResult(s->exports.sweep());var next=exports.next();if(next.isEmpty())return 0;
            return tx.execute(status->{
                var discovered=next.get();boolean vendor="VENDOR".equals(jdbc.queryForObject("SELECT type FROM organization WHERE id=?",String.class,discovered.organization()));
                var scope=new Exports.Scope(discovered.actor(),discovered.organization(),discovered.country(),vendor);
                var access=authority.lock(scope,discovered.kind());var locked=exports.lock(discovered.id());if(locked.isEmpty())return 0;
                var job=exports.expire(locked.get());if(!job.state().equals("QUEUED"))return 1;
                if(access==ExportAuthority.Result.DEFER)return 0;
                if(access==ExportAuthority.Result.REVOKED){exports.failed(job,"ACCESS_REVOKED");return 1;}
                try{var generated=snapshot.execute(read->projection.render(scope,job,exports.now()));exports.ready(job,generated.bytes(),generated.rows());}
                catch(ExportCsv.Limit limit){exports.failed(job,limit.code());}
                catch(ReportOverflow overflow){exports.failed(job,"REPORT_OVERFLOW");}
                return 1;
            });
        }finally{slot.release();}
    }
}
