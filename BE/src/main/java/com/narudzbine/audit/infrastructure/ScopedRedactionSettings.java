package com.narudzbine.audit.infrastructure;
import com.narudzbine.audit.api.*;
import java.util.*;
import org.springframework.core.env.Environment;
import tools.jackson.databind.json.JsonMapper;
final class ScopedRedactionSettings {
  String mode,localRoot,endpoint,bucket,access,secret,url,username,password,active,reference,environment;Map<String,byte[]> keys;List<byte[]> prohibited;
  String identityEndpoint,identityKey,identityConformance; UUID identityTenant; boolean identityAbsence;
  static ScopedRedactionSettings read(Environment env){
   try{
    var s=new ScopedRedactionSettings();s.mode=required(env,"mode");s.reference=required(env,"configuration-reference");if(!s.reference.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}"))throw invalid();s.environment=required(env,"environment");if(!s.environment.matches("[A-Z][A-Z0-9_]{0,31}"))throw invalid();
    s.url=required(env,"jdbc-url");s.username=required(env,"username");s.password=required(env,"password");if(!s.url.startsWith("jdbc:postgresql:")||(env.containsProperty("spring.datasource.url")&&!s.url.equals(env.getProperty("spring.datasource.url")))||s.username.equals(env.getProperty("spring.datasource.username")))throw invalid();
    s.active=required(env,"active-key-version");String ring=required(env,"key-ring");if(ring.length()>4096)throw invalid();var tree=JsonMapper.builder().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build().readTree(ring);if(!tree.isObject()||tree.size()<1||tree.size()>32)throw invalid();s.keys=new HashMap<>();for(var entry:tree.properties()){if(!entry.getValue().isString())throw invalid();s.keys.put(entry.getKey(),Base64.getDecoder().decode(entry.getValue().asString()));}s.prohibited=new ArrayList<>();for(String property:List.of("privacy.exports.artifact-key","reporting.exports.artifact-key")){String key=env.getProperty(property,"");if(!key.isEmpty())try{s.prohibited.add(Base64.getDecoder().decode(key));}catch(IllegalArgumentException ignored){/* Disabled unrelated settings may be absent or unusable. */}}
    // Validate key separation before opening either object storage or database connections.
    new IndependentEvidence(new UnavailableObjects(),s.keys,s.active,s.prohibited);
    if(s.mode.equals("LOCAL_SYNTHETIC")){s.localRoot=required(env,"local-root");if(!env.getProperty("audit.redaction-worker.local-synthetic-acknowledged",Boolean.class,false))throw invalid();}
    else if(s.mode.equals("R2")){
     s.endpoint=required(env,"endpoint");s.bucket=required(env,"bucket");s.access=required(env,"access-key");s.secret=required(env,"secret-key");String conformance=required(env,"conformance-reference");if(!s.endpoint.matches("https://[0-9a-f]{32}\\.eu\\.r2\\.cloudflarestorage\\.com")||!s.bucket.matches("[a-z0-9][a-z0-9-]{1,61}[a-z0-9]")||!conformance.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}"))throw invalid();
     if(s.bucket.equals(env.getProperty("media.storage.bucket"))||s.access.equals(env.getProperty("media.storage.access-key"))||s.secret.equals(env.getProperty("media.storage.secret-key")))throw invalid();
    }else throw invalid();
    if(env.containsProperty("audit.redaction-worker.identity-endpoint")){
     s.identityEndpoint=required(env,"identity-endpoint");s.identityTenant=UUID.fromString(required(env,"identity-tenant-id"));s.identityKey=required(env,"identity-api-key");s.identityConformance=required(env,"identity-conformance-reference");
     String absence=env.getProperty("audit.redaction-worker.identity-allow-absence","false");if(!Set.of("true","false").contains(absence))throw invalid();s.identityAbsence=Boolean.parseBoolean(absence);
     var uri=java.net.URI.create(s.identityEndpoint);if(!"https".equals(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||!"/api/login".equals(uri.getPath())||uri.getQuery()!=null||uri.getFragment()!=null||s.identityKey.chars().anyMatch(Character::isISOControl)||!s.identityConformance.matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}")||s.identityKey.equals(env.getProperty("identity.provider.api-key")))throw invalid();
    }else for(String suffix:List.of("identity-tenant-id","identity-api-key","identity-conformance-reference","identity-allow-absence"))if(env.containsProperty("audit.redaction-worker."+suffix))throw invalid();
    return s;
   }catch(RuntimeException failure){throw invalid();} // Never expose key-ring values or parser excerpts.
  }
  static String required(Environment env,String key){String value=env.getProperty("audit.redaction-worker."+key,"");if(value.isBlank())throw invalid();return value;}
  static IllegalStateException invalid(){return new IllegalStateException("Explicit isolated scoped redaction configuration required");}
  @Override public String toString(){return "ScopedRedactionSettings[redacted]";}
 private static final class UnavailableObjects implements IndependentObjects {public boolean create(Key k,byte[] b){throw new UnsupportedOperationException();}public Optional<byte[]> read(Key k){throw new UnsupportedOperationException();}public Page list(Family f,int n,Key a){throw new UnsupportedOperationException();}}
}
