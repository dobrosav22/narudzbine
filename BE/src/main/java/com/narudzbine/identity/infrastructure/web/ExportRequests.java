package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.reporting.api.Exports;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

final class ExportRequests {
    static Exports.Command parse(HttpServletRequest r)throws IOException{
        var b=AuthRequests.object(r,Set.of("id","kind","from","to"));
        var errors=new ArrayList<AuthErrors.FieldError>();UUID id=null;
        try{id=ContactRequests.id(b.path("id").isString()?b.path("id").asString():null,"BODY","/id");}catch(AuthHttpFailure f){errors.addAll(f.fields);}
        String kind=b.path("kind").isString()?b.path("kind").asString():"";
        if(!Set.of("ORDERS","REPORT_PRODUCTS","REPORT_BUYERS").contains(kind))errors.addAll(invalid("kind").fields);
        LocalDate from=null,to=null;
        try{from=date(b.path("from").isString()?b.path("from").asString():null,"from");}catch(AuthHttpFailure f){errors.addAll(f.fields);}
        try{to=date(b.path("to").isString()?b.path("to").asString():null,"to");}catch(AuthHttpFailure f){errors.addAll(f.fields);}
        if(from!=null&&to!=null){if(from.isAfter(to))errors.addAll(invalid("from").fields);else if(ChronoUnit.MONTHS.between(YearMonth.from(from),YearMonth.from(to))+1>60)errors.addAll(invalid("to").fields);}
        if(!errors.isEmpty())throw new AuthHttpFailure(errors.stream().sorted(Comparator.comparing(AuthErrors.FieldError::path)).toList());
        return new Exports.Command(id,kind,from,to);
    }
    static void current(Exports.Command c,String country,Instant at){
        if(c.to().isAfter(at.atZone(ZoneId.of(country.equals("RS")?"Europe/Belgrade":"Europe/Sarajevo")).toLocalDate()))throw invalid("to");
    }
    private static LocalDate date(String v,String field){try{if(v==null||!v.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"))throw new IllegalArgumentException();var d=LocalDate.parse(v);if(d.getYear()<1||d.getYear()>9998)throw new IllegalArgumentException();return d;}catch(DateTimeException|IllegalArgumentException e){throw invalid(field);}}
    private static AuthHttpFailure invalid(String field){return new AuthHttpFailure(List.of(new AuthErrors.FieldError("BODY","/"+field,"INVALID_VALUE")));}
}
