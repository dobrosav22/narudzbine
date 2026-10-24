package com.narudzbine.reporting.application;

import com.narudzbine.reporting.api.*;
import java.math.BigDecimal;
import java.sql.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

@Service
@Transactional(propagation=Propagation.MANDATORY,readOnly=true)
public class JdbcBusinessReports implements BusinessReports {
    private static final BigDecimal MAX_MONEY = new BigDecimal("9999999999999999999999.99");
    private static final BigDecimal MAX_INTEGER = new BigDecimal("9000000000000000");
    private static final DateTimeFormatter TIME = new java.time.format.DateTimeFormatterBuilder().appendInstant(3).toFormatter();
    private final JdbcTemplate jdbc;
    public JdbcBusinessReports(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    // Scope and country are bound parameters, never supplied as raw query expressions.
    private String eligible(Scope scope) {
        return """
            WITH eligible AS (
              SELECT o.* FROM purchase_order o
              WHERE o.%s=? AND o.country=? AND o.submitted_at>=? AND o.submitted_at<? AND o.submitted_at<=?
              AND (SELECT e.state FROM purchase_order_event e WHERE e.order_id=o.id ORDER BY e.revision DESC LIMIT 1)='DELIVERED'
            )
            """.formatted(scope.vendor() ? "vendor_id" : "buyer_id");
    }
    private Object[] args(Scope scope, Range r, Object... tail) {
        var values = new ArrayList<Object>(List.of(scope.organizationId(), scope.country(), Timestamp.from(r.start()),
                Timestamp.from(r.until()), Timestamp.from(r.asOf())));
        values.addAll(Arrays.asList(tail)); return values.toArray();
    }
    @Override public Summary summary(Scope scope, Range r, String grouping) {
        String unit = grouping.equals("DAY") ? "day" : "month";
        var rows = jdbc.query(eligible(scope) + """
            SELECT date_trunc(?,o.submitted_at AT TIME ZONE ?)::date AS period,
              count(*) AS orders, sum((o.snapshot->'terms'->>'goodsTotal')::numeric) AS goods,
              sum((SELECT sum(l.quantity::numeric) FROM purchase_order_line l WHERE l.order_id=o.id)) AS units
            FROM eligible o GROUP BY 1 ORDER BY 1
            """, (rs,n) -> new Bucket(rs.getObject("period",LocalDate.class), integer(rs.getBigDecimal("orders")),
                    integer(rs.getBigDecimal("units")), money(rs.getBigDecimal("goods"))), args(scope,r,unit,r.zone().getId()));
        var byPeriod = new HashMap<LocalDate,Bucket>(); rows.forEach(b -> byPeriod.put(b.periodStart(),b));
        var buckets = new ArrayList<Bucket>(); BigDecimal goods=BigDecimal.ZERO, orders=BigDecimal.ZERO, units=BigDecimal.ZERO;
        LocalDate first=grouping.equals("DAY")?r.from():r.from().withDayOfMonth(1);
        for(LocalDate d=first;!d.isAfter(r.to());d=grouping.equals("DAY")?d.plusDays(1):d.plusMonths(1)) {
            Bucket b=byPeriod.getOrDefault(d,new Bucket(d,0,0,"0.00")); buckets.add(b);
            goods=goods.add(new BigDecimal(b.goodsTotal())); orders=orders.add(BigDecimal.valueOf(b.orderCount())); units=units.add(BigDecimal.valueOf(b.quantity()));
        }
        Long active=scope.vendor()?jdbc.queryForObject("SELECT count(*) FROM trading_relationship WHERE vendor_id=? AND country=? AND state='ACTIVE'",Long.class,scope.organizationId(),scope.country()):null;
        return new Summary(r.from(),r.to(),grouping,r.zone().getId(),scope.country().equals("RS")?"RSD":"BAM",
                "NET_EXCLUDING_VAT",TIME.format(r.asOf()),integer(orders),integer(units),money(goods),active,List.copyOf(buckets));
    }
    @Override public Page<Product> products(Scope scope, Range r, int page, int size, boolean total) {
        String projection = eligible(scope) + """
            , lines AS (SELECT o.submitted_at,l.* FROM eligible o JOIN purchase_order_line l ON l.order_id=o.id),
            totals AS (SELECT product_id,count(*) AS orders,sum(quantity::numeric) AS units,
                       sum((snapshot->'price'->>'lineTotal')::numeric) AS goods FROM lines GROUP BY product_id),
            labels AS (SELECT DISTINCT ON(product_id) product_id,snapshot FROM lines ORDER BY product_id,submitted_at DESC,order_id ASC)
            """;
        var items=jdbc.query(projection+"""
            SELECT t.*,l.snapshot->>'name' AS name,l.snapshot->>'sku' AS sku,l.snapshot->>'unitName' AS unit_name
            FROM totals t JOIN labels l USING(product_id) ORDER BY units DESC,product_id ASC LIMIT ? OFFSET ?
            """,(rs,n)->new Product(rs.getObject("product_id",UUID.class),rs.getString("name"),rs.getString("sku"),rs.getString("unit_name"),
                    integer(rs.getBigDecimal("orders")),integer(rs.getBigDecimal("units")),money(rs.getBigDecimal("goods"))),args(scope,r,size,page*size));
        Long count=total?jdbc.queryForObject(projection+"SELECT count(*) FROM totals",Long.class,args(scope,r)):null;
        return new Page<>(List.copyOf(items),page,size,count);
    }
    @Override public Page<Buyer> buyers(Scope scope, Range r, int page, int size, boolean total) {
        String projection=eligible(scope)+"""
            , totals AS (SELECT buyer_id,count(*) AS orders,sum((snapshot->'terms'->>'goodsTotal')::numeric) AS goods,
                         max(submitted_at) AS last_at FROM eligible GROUP BY buyer_id),
            labels AS (SELECT DISTINCT ON(buyer_id) buyer_id,snapshot->'buyer'->>'displayName' AS name
                       FROM eligible ORDER BY buyer_id,submitted_at DESC,id ASC),
            active AS (SELECT buyer_id FROM trading_relationship WHERE vendor_id=? AND country=? AND state='ACTIVE'),
            ids AS (SELECT buyer_id FROM totals UNION SELECT buyer_id FROM active),
            result AS (SELECT i.buyer_id,coalesce(l.name,o.display_name) AS name,a.buyer_id IS NOT NULL AS active,
                       coalesce(t.orders,0) AS orders,coalesce(t.goods,0) AS goods,t.last_at
                       FROM ids i JOIN organization o ON o.id=i.buyer_id AND o.country=? AND o.type='BUYER'
                       LEFT JOIN totals t USING(buyer_id) LEFT JOIN labels l USING(buyer_id) LEFT JOIN active a USING(buyer_id))
            """;
        var tail=new Object[]{scope.organizationId(),scope.country(),scope.country()};
        var pageTail=new ArrayList<Object>(Arrays.asList(tail));pageTail.add(size);pageTail.add(page*size);
        var items=jdbc.query(projection+"SELECT * FROM result ORDER BY goods DESC,buyer_id ASC LIMIT ? OFFSET ?",
                (rs,n)->new Buyer(rs.getObject("buyer_id",UUID.class),rs.getString("name"),rs.getBoolean("active"),
                    integer(rs.getBigDecimal("orders")),money(rs.getBigDecimal("goods")),rs.getTimestamp("last_at")==null?null:TIME.format(rs.getTimestamp("last_at").toInstant())),args(scope,r,pageTail.toArray()));
        Long count=total?jdbc.queryForObject(projection+"SELECT count(*) FROM result",Long.class,args(scope,r,tail)):null;
        return new Page<>(List.copyOf(items),page,size,count);
    }
    private static long integer(BigDecimal value) {
        if(value==null)return 0;
        if(value.signum()<0||value.compareTo(MAX_INTEGER)>0)throw new ReportOverflow();
        try{return value.longValueExact();}catch(ArithmeticException e){throw new ReportOverflow();}
    }
    private static String money(BigDecimal value) {
        if(value==null)return "0.00";
        if(value.signum()<0||value.compareTo(MAX_MONEY)>0)throw new ReportOverflow();
        try{return value.setScale(2).toPlainString();}catch(ArithmeticException e){throw new ReportOverflow();}
    }
}
