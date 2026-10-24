package com.narudzbine.media.application;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Permanent claim spans provider I/O; completion commits with its source receipt. */
final class MediaDisposal {
 private final JdbcTemplate jdbc;private final Clock clock;
 MediaDisposal(JdbcTemplate jdbc,Clock clock){this.jdbc=jdbc;this.clock=clock;}
 boolean claim(UUID id,String kind){requireTransaction();return Boolean.TRUE.equals(jdbc.queryForObject("SELECT public.claim_media_disposal(?,?,?)",Boolean.class,id,kind,now()));}
 void completed(UUID id,String kind){requireTransaction();jdbc.queryForList("SELECT public.complete_media_disposal(?,?,?)",id,kind,now());}
 private Timestamp now(){return Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MILLIS));}
 private static void requireTransaction(){if(!TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Disposal requires a committing transaction");}
}
