package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.catalogue.api.CsvImports;
import com.narudzbine.shared.api.UuidGenerator;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.*;
import java.nio.charset.*;
import java.util.*;
import org.springframework.http.MediaType;
import tools.jackson.databind.json.JsonMapper;
/** Bounded text-only CSV grammar; no evaluation, auto-detection or external I/O. */
final class CsvRequests {
 static final int MAX_BYTES=5242880;
 private static final JsonMapper JSON=JsonMapper.builder().enable(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
 private static final Set<String> HEADERS=Set.of("sku","name","description","unitId","packDescription","categoryId","tagIds","basePrice","minimumQuantity","quantityStep","activate");
 record Parsed(int rowCount,boolean requiresPrice,List<CsvImports.Row> rows,List<CsvImports.Error> errors){@Override public String toString(){return "ParsedImport[redacted]";}}
 static Parsed read(HttpServletRequest request,UuidGenerator ids)throws IOException{
  try{if(Collections.list(request.getHeaders("Content-Type")).size()!=1){throw new IllegalArgumentException();}var type=MediaType.parseMediaType(request.getContentType());if(!type.getType().equals("text")||!type.getSubtype().equals("csv")||type.getCharset()!=null&&!type.getCharset().equals(StandardCharsets.UTF_8)||type.getParameters().keySet().stream().anyMatch(k->!Set.of("charset","header").contains(k))||type.getParameter("header")!=null&&!type.getParameter("header").equals("present")||request.getHeader("Content-Encoding")!=null){throw new IllegalArgumentException();}}catch(IllegalArgumentException e){throw new AuthHttpFailure(415,"UNSUPPORTED_MEDIA_TYPE","/file");}
  if(request.getContentLengthLong()>MAX_BYTES){throw new AuthHttpFailure(413,"PAYLOAD_TOO_LARGE","/file");}byte[] bytes=request.getInputStream().readNBytes(MAX_BYTES+1);if(bytes.length>MAX_BYTES){throw new AuthHttpFailure(413,"PAYLOAD_TOO_LARGE","/file");}String text;try{text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();}catch(CharacterCodingException e){throw invalid("CSV_INVALID_UTF8");}return parse(text,ids);
 }
 static Parsed parse(String text,UuidGenerator ids){
  if(text.startsWith("\ufeff")){text=text.substring(1);}text=text.replace("\r\n","\n");if(text.indexOf('\r')>=0||text.indexOf('\0')>=0){throw invalid("CSV_INVALID_FILE");}var records=records(text);if(records.size()<2){throw invalid("CSV_EMPTY");}var headers=records.getFirst();if(headers.size()>HEADERS.size()||!new HashSet<>(headers).containsAll(Set.of("sku","name"))||headers.size()!=new HashSet<>(headers).size()||!HEADERS.containsAll(headers)){throw invalid("CSV_INVALID_HEADERS");}
  var rows=new ArrayList<CsvImports.Row>();var errors=new ArrayList<CsvImports.Error>();var skuRows=new HashMap<String,List<Integer>>();boolean pricePermission=false;
  for(int i=1;i<records.size();i++){var cells=records.get(i);if(cells.size()!=headers.size()){errors.add(new CsvImports.Error(i,"*","COLUMN_COUNT"));continue;}var values=new HashMap<String,String>();for(int j=0;j<headers.size();j++){values.put(headers.get(j),cells.get(j));}String sku=java.text.Normalizer.normalize(values.get("sku").strip(),java.text.Normalizer.Form.NFC).toLowerCase(Locale.ROOT);skuRows.computeIfAbsent(sku,k->new ArrayList<>()).add(i);
   var b=JSON.createObjectNode().put("id",ids.next().toString());for(String column:List.of("sku","name","description","unitId","packDescription","categoryId")){String v=values.get(column);if(v!=null&&(!v.isBlank()||Set.of("sku","name").contains(column))){b.put(column,v);}}
   for(String column:List.of("minimumQuantity","quantityStep")){String v=values.get(column);if(v!=null&&!v.isBlank()){if(v.matches("[1-9][0-9]{0,9}")){b.put(column,Long.parseLong(v));}else{b.put(column,v);}}}
   String tags=values.get("tagIds");if(tags!=null&&!tags.isBlank()){try{var node=JSON.readTree(tags);if(!node.isArray()){throw new IllegalArgumentException();}b.set("tagIds",node);}catch(RuntimeException e){b.put("tagIds","invalid");}}
   boolean activate=false;var local=new ArrayList<AuthErrors.FieldError>();String activation=values.get("activate");if(activation!=null&&!activation.isBlank()){if(!Set.of("true","false").contains(activation)){local.add(new AuthErrors.FieldError("/activate","INVALID_VALUE"));}else{activate=activation.equals("true");}}
   java.math.BigDecimal price=null;String p=values.get("basePrice");if(p!=null&&!p.isBlank()){pricePermission=true;price=PricingRequests.amount(JSON.getNodeFactory().stringNode(p.strip()),"/basePrice",local);}
   ProductRequests.Input input=null;try{input=ProductRequests.parse(b,true);}catch(AuthHttpFailure f){local.addAll(f.fields);}for(var error:local){String[] path=error.path().split("/");errors.add(new CsvImports.Error(i,path.length>1?path[1]:"*",error.code()));}if(local.isEmpty()){rows.add(new CsvImports.Row(i,input.id(),input.values(),price,activate));}
  }
  for(var duplicates:skuRows.values()){if(duplicates.size()>1){for(int row:duplicates){errors.add(new CsvImports.Error(row,"sku","DUPLICATE_SKU"));}}}
  return new Parsed(records.size()-1,pricePermission,List.copyOf(rows),List.copyOf(errors));
 }
 private static List<List<String>> records(String text){
  var records=new ArrayList<List<String>>();var row=new ArrayList<String>();var cell=new StringBuilder();int state=0;
  for(int i=0;i<text.length();i++){char c=text.charAt(i);if(state==2){if(c=='"'){if(i+1<text.length()&&text.charAt(i+1)=='"'){cell.append('"');i++;}else{state=3;}}else{cell.append(c);}}else if(c==','||c=='\n'){row.add(cell.toString());cell.setLength(0);state=0;if(row.size()>64){throw invalid("CSV_INVALID_FILE");}if(c=='\n'){records.add(List.copyOf(row));row.clear();if(records.size()>1001){throw invalid("CSV_TOO_MANY_ROWS");}}}else if(state==3){throw invalid("CSV_INVALID_FILE");}else if(c=='"'){if(state!=0){throw invalid("CSV_INVALID_FILE");}state=2;}else{cell.append(c);state=1;}if(cell.length()>20000){throw invalid("CSV_CELL_TOO_LARGE");}}
  if(state==2){throw invalid("CSV_INVALID_FILE");}if(state!=0||!row.isEmpty()){row.add(cell.toString());if(row.size()>64){throw invalid("CSV_INVALID_FILE");}records.add(List.copyOf(row));}if(records.size()>1001){throw invalid("CSV_TOO_MANY_ROWS");}return records;
 }
 private static AuthHttpFailure invalid(String code){return new AuthHttpFailure(422,code,"/file");}
}
