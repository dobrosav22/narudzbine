package com.narudzbine.reporting.application;

import com.narudzbine.reporting.api.*;
import java.sql.Timestamp;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY,readOnly=true)
public class ExportProjection {
    private static final DateTimeFormatter TIME=new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private final BusinessReports reports;private final JdbcTemplate jdbc;
    public ExportProjection(BusinessReports reports,JdbcTemplate jdbc){this.reports=reports;this.jdbc=jdbc;}
    public Generated render(Exports.Scope scope,JdbcExports.Job job,Instant asOf){
        ZoneId zone=ZoneId.of(scope.country().equals("RS")?"Europe/Belgrade":"Europe/Sarajevo");
        var range=new BusinessReports.Range(job.from(),job.to(),zone,job.from().atStartOfDay(zone).toInstant(),job.to().plusDays(1).atStartOfDay(zone).toInstant(),asOf);
        String currency=scope.country().equals("RS")?"RSD":"BAM",basis="NET_EXCLUDING_VAT";
        var own=new BusinessReports.Scope(scope.organization(),scope.country(),scope.vendor());
        ExportCsv csv;
        if(job.kind().equals("REPORT_PRODUCTS")){
            csv=new ExportCsv(List.of("productId","name","sku","unitName","orderCount","quantity","goodsTotal","currency","priceBasis"));
            var rows=reports.products(own,range,0,ExportCsv.MAX_ROWS+1,false).items();if(rows.size()>ExportCsv.MAX_ROWS)throw new ExportCsv.Limit("EXPORT_ROW_LIMIT");
            for(var p:rows)csv.row(List.of(p.productId().toString(),p.name(),p.sku(),p.unitName(),Long.toString(p.orderCount()),Long.toString(p.quantity()),p.goodsTotal(),currency,basis));
        }else if(job.kind().equals("REPORT_BUYERS")){
            csv=new ExportCsv(List.of("buyerId","displayName","activeConnection","orderCount","goodsTotal","lastOrderAt","currency","priceBasis"));
            var rows=reports.buyers(own,range,0,ExportCsv.MAX_ROWS+1,false).items();if(rows.size()>ExportCsv.MAX_ROWS)throw new ExportCsv.Limit("EXPORT_ROW_LIMIT");
            for(var b:rows)csv.row(List.of(b.buyerId().toString(),b.displayName(),Boolean.toString(b.activeConnection()),Long.toString(b.orderCount()),b.goodsTotal(),b.lastOrderAt()==null?"":b.lastOrderAt(),currency,basis));
        }else{
            csv=new ExportCsv(List.of("orderId","number","submittedAt","state","vendorId","vendorName","buyerId","buyerName","currency","priceBasis","goodsTotal","quantity"));
            String column=scope.vendor()?"vendor_id":"buyer_id";
            jdbc.query("""
                SELECT o.id,o.snapshot->>'number' AS number,o.submitted_at,
                  (SELECT e.state FROM purchase_order_event e WHERE e.order_id=o.id ORDER BY revision DESC LIMIT 1) AS state,
                  o.vendor_id,o.snapshot->'vendor'->>'displayName' AS vendor_name,o.buyer_id,o.snapshot->'buyer'->>'displayName' AS buyer_name,
                  o.snapshot->'terms'->>'goodsTotal' AS goods,
                  (SELECT sum(l.quantity::bigint) FROM purchase_order_line l WHERE l.order_id=o.id) AS units
                FROM purchase_order o WHERE o.%s=? AND o.country=? AND o.submitted_at>=? AND o.submitted_at<? AND o.submitted_at<=?
                ORDER BY o.submitted_at DESC,o.id ASC LIMIT 100001
                """.formatted(column),r->{csv.row(List.of(r.getObject("id",UUID.class).toString(),r.getString("number"),TIME.format(r.getTimestamp("submitted_at").toInstant()),r.getString("state"),r.getObject("vendor_id",UUID.class).toString(),r.getString("vendor_name"),r.getObject("buyer_id",UUID.class).toString(),r.getString("buyer_name"),currency,basis,new java.math.BigDecimal(r.getString("goods")).setScale(2).toPlainString(),Long.toString(r.getLong("units"))));},
                scope.organization(),scope.country(),Timestamp.from(range.start()),Timestamp.from(range.until()),Timestamp.from(asOf));
        }
        return new Generated(csv.bytes(),csv.rows());
    }
    public record Generated(byte[] bytes,int rows){@Override public String toString(){return "GeneratedExport[redacted]";}}
}
