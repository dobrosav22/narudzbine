package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.reporting.api.BusinessReports;
import jakarta.servlet.http.HttpServletRequest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

final class ReportRequests {
    record Query(LocalDate from, LocalDate to, String grouping, int page, int size, boolean total) {
        BusinessReports.Range range(String country, Instant asOf) {
            ZoneId zone=ZoneId.of(country.equals("RS")?"Europe/Belgrade":"Europe/Sarajevo");
            if(to.isAfter(asOf.atZone(zone).toLocalDate()))throw StockRequests.invalid("to");
            return new BusinessReports.Range(from,to,zone,from.atStartOfDay(zone).toInstant(),to.plusDays(1).atStartOfDay(zone).toInstant(),asOf);
        }
    }
    static Query parse(HttpServletRequest request, boolean summary) {
        Set<String> allowed=summary?Set.of("from","to","grouping"):Set.of("from","to","page","size","includeTotal");
        for(var e:request.getParameterMap().entrySet())if(!allowed.contains(e.getKey())||e.getValue().length!=1)throw StockRequests.invalid(e.getKey());
        LocalDate from=date(request,"from"),to=date(request,"to");
        if(from.isAfter(to))throw StockRequests.invalid("from");
        String grouping=request.getParameter("grouping");
        if(summary&&(grouping==null||!Set.of("DAY","MONTH").contains(grouping)))throw StockRequests.invalid("grouping");
        if("DAY".equals(grouping)?ChronoUnit.DAYS.between(from,to)+1>366:ChronoUnit.MONTHS.between(YearMonth.from(from),YearMonth.from(to))+1>60)throw StockRequests.invalid("to");
        int page=number(request,"page",0,0,10000),size=number(request,"size",25,1,100);
        String total=request.getParameter("includeTotal");if(total!=null&&!Set.of("true","false").contains(total))throw StockRequests.invalid("includeTotal");
        return new Query(from,to,grouping,page,size,"true".equals(total));
    }
    private static LocalDate date(HttpServletRequest r,String field) {
        String v=r.getParameter(field);
        try {if(v==null||!v.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))throw new IllegalArgumentException();LocalDate d=LocalDate.parse(v);if(d.getYear()<1||d.getYear()>9998)throw new IllegalArgumentException();return d;}
        catch(java.time.DateTimeException|IllegalArgumentException e){throw StockRequests.invalid(field);}
    }
    private static int number(HttpServletRequest r,String field,int fallback,int min,int max) {
        String v=r.getParameter(field);if(v==null)return fallback;
        try {if(!v.matches("0|[1-9][0-9]{0,5}"))throw new IllegalArgumentException();int n=Integer.parseInt(v);if(n<min||n>max)throw new IllegalArgumentException();return n;}
        catch(IllegalArgumentException e){throw StockRequests.invalid(field);}
    }
}
