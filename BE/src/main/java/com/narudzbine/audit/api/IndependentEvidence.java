package com.narudzbine.audit.api;

import com.narudzbine.shared.api.SecretEnvelope;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Versioned create/read-back protocol; no Spring bean, runtime activation, overwrite or deletion capability. */
public final class IndependentEvidence {
    private static final byte[] MAGIC="NZEV1".getBytes(StandardCharsets.US_ASCII);
    private final IndependentObjects objects;private final Map<String,byte[]> keys;private final String active;
    public record Receipt(IndependentObjects.Key key,String keyVersion,String ciphertextSha256,int bytes){}
    public record Verified(byte[] bytes,String keyVersion){
        public Verified{bytes=bytes.clone();}@Override public byte[] bytes(){return bytes.clone();}
        @Override public String toString(){return "VerifiedEvidence[redacted]";}
    }
    public IndependentEvidence(IndependentObjects objects,Map<String,byte[]> keys,String active,Collection<byte[]> prohibitedKeys){
        this.objects=Objects.requireNonNull(objects);if(keys==null||keys.isEmpty()||keys.size()>32||!keys.containsKey(active))throw new IllegalArgumentException("Explicit bounded evidence key ring required");
        var copy=new HashMap<String,byte[]>();for(var entry:keys.entrySet()){
            if(entry.getKey()==null||!entry.getKey().matches("v[1-9][0-9]{0,5}")||entry.getValue()==null||entry.getValue().length!=32)throw new IllegalArgumentException("Explicit versioned256-bit evidence keys required");
            for(byte[] previous:copy.values())if(MessageDigest.isEqual(previous,entry.getValue()))throw new IllegalArgumentException("Evidence key versions must not alias");
            for(byte[] forbidden:prohibitedKeys)if(forbidden!=null&&MessageDigest.isEqual(forbidden,entry.getValue()))throw new IllegalArgumentException("Evidence and application artifact keys must be isolated");
            copy.put(entry.getKey(),entry.getValue().clone());
        }
        this.keys=Collections.unmodifiableMap(copy);this.active=active;
    }
    public Receipt ensure(IndependentObjects.Key key,byte[] plaintext){
        outside();Objects.requireNonNull(key);if(plaintext==null||plaintext.length<1||plaintext.length>IndependentObjects.MAX_PLAINTEXT)throw new EvidenceFailure("EVIDENCE_SIZE_LIMIT");
        byte[] expected=plaintext.clone();var old=objects.read(key);if(old.isPresent())return verifyExpected(key,old.get(),expected);
        byte[] prepared=encode(key,expected);
        try{objects.create(key,prepared);}catch(EvidenceFailure uncertain){
            var resolved=objects.read(key);if(resolved.isPresent())return verifyExpected(key,resolved.get(),expected);throw uncertain;
        }
        var retained=objects.read(key).orElseThrow(()->new EvidenceFailure("EVIDENCE_UNVERIFIED"));return verifyExpected(key,retained,expected);
    }
    /** A known published receipt may never be replaced merely because its object is missing. */
    public Verified require(IndependentObjects.Key key,Receipt expected){
        outside();if(expected==null||!key.equals(expected.key()))throw new EvidenceFailure("EVIDENCE_IDENTITY_CONFLICT");
        byte[] stored=objects.read(key).orElseThrow(()->new EvidenceFailure("EVIDENCE_MISSING"));
        var verified=decode(key,stored);var actual=new Receipt(key,verified.keyVersion(),hash(stored),stored.length);
        if(!actual.equals(expected))throw new EvidenceFailure("EVIDENCE_IDENTITY_CONFLICT");return verified;
    }
    public Receipt require(IndependentObjects.Key key,byte[] plaintext,Receipt expected){
        if(plaintext==null||plaintext.length<1||plaintext.length>IndependentObjects.MAX_PLAINTEXT)throw new EvidenceFailure("EVIDENCE_SIZE_LIMIT");
        var verified=require(key,expected);if(!MessageDigest.isEqual(verified.bytes(),plaintext))throw new EvidenceFailure("EVIDENCE_IDENTITY_CONFLICT");return expected;
    }
    public Optional<Verified> read(IndependentObjects.Key key){outside();return objects.read(key).map(bytes->decode(key,bytes));}
    public IndependentObjects.Page list(IndependentObjects.Family family,int size,IndependentObjects.Key after){outside();return objects.list(family,size,after);}
    private Receipt verifyExpected(IndependentObjects.Key key,byte[] stored,byte[] expected){var verified=decode(key,stored);if(!MessageDigest.isEqual(verified.bytes(),expected))throw new EvidenceFailure("EVIDENCE_IDENTITY_CONFLICT");return new Receipt(key,verified.keyVersion(),hash(stored),stored.length);}
    private byte[] encode(IndependentObjects.Key key,byte[] plain){
        byte[] name=active.getBytes(StandardCharsets.US_ASCII),cipher=envelope(key,active).encrypt(key.resource(),plain);
        return ByteBuffer.allocate(MAGIC.length+1+name.length+cipher.length).put(MAGIC).put((byte)name.length).put(name).put(cipher).array();
    }
    private Verified decode(IndependentObjects.Key key,byte[] stored){
        if(stored==null||stored.length<36||stored.length>IndependentObjects.MAX_OBJECT)throw new EvidenceFailure("EVIDENCE_UNVERIFIED");
        try{
            var input=ByteBuffer.wrap(stored);byte[] magic=new byte[MAGIC.length];input.get(magic);if(!Arrays.equals(magic,MAGIC))throw new IllegalArgumentException();
            int length=Byte.toUnsignedInt(input.get());if(length<2||length>7||input.remaining()<length+29)throw new IllegalArgumentException();byte[] name=new byte[length];input.get(name);String version=new String(name,StandardCharsets.US_ASCII);
            if(!version.matches("v[1-9][0-9]{0,5}")||!keys.containsKey(version))throw new IllegalArgumentException();byte[] cipher=new byte[input.remaining()];input.get(cipher);byte[] plain=envelope(key,version).decrypt(key.resource(),cipher);
            if(plain.length<1||plain.length>IndependentObjects.MAX_PLAINTEXT)throw new IllegalArgumentException();return new Verified(plain,version);
        }catch(IllegalArgumentException|java.nio.BufferUnderflowException failure){throw new EvidenceFailure("EVIDENCE_UNVERIFIED");}
    }
    private SecretEnvelope envelope(IndependentObjects.Key key,String version){return new SecretEnvelope(keys.get(version),"independent-evidence/v1/"+key.path()+"/"+version);}
    public static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(NoSuchAlgorithmException failure){throw new IllegalStateException("SHA-256 unavailable");}}
    public static void outside(){if(TransactionSynchronizationManager.isActualTransactionActive())throw new IllegalStateException("Independent evidence I/O must run outside database transactions");}
}
