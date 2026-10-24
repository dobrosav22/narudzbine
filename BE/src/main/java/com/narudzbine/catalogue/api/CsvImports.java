package com.narudzbine.catalogue.api;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
/** Callers hold current vendor authority; confirmation is one local transaction. */
public interface CsvImports {
 record Row(int row,UUID id,VendorProducts.Values product,BigDecimal basePrice,boolean activate){@Override public String toString(){return "ImportRow[redacted]";}}
 record Error(int row,String column,String code){}
 record Preview(UUID id,UUID vendor,UUID creator,Instant createdAt,Instant expiresAt,int rowCount,boolean requiresPrice,List<Row> rows,List<Error> errors,String originalRevision){public Preview{rows=List.copyOf(rows);errors=List.copyOf(errors);}public boolean valid(){return errors.isEmpty();}}
 record Result(UUID id,List<UUID> productIds,Instant completedAt){public Result{productIds=List.copyOf(productIds);}}
 Preview store(UUID actor,UUID vendor,UUID id,int rowCount,boolean requiresPrice,List<Row> rows,List<Error> errors,String originalRevision);
 Preview read(UUID vendor,UUID id);
 Preview lock(UUID vendor,UUID id);
 List<Error> validate(UUID vendor,List<Row> rows,int rowCount);
 Optional<Result> replay(UUID vendor,UUID id,String expected);
 void recordProduct(UUID vendor,UUID preview,Row row);
 Result complete(UUID actor,UUID vendor,Preview preview,String expected);
 void cleanup();
}
