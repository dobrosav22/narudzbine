package com.narudzbine.catalogue.api;
import java.util.List;
public final class ImportFailure extends RuntimeException {
 private final String code;private final List<CsvImports.Error> errors;
 public ImportFailure(String code){this(code,List.of());}
 public ImportFailure(String code,List<CsvImports.Error> errors){super("Import could not be completed");this.code=code;this.errors=List.copyOf(errors);}
 public String code(){return code;}public List<CsvImports.Error> errors(){return errors;}
}
