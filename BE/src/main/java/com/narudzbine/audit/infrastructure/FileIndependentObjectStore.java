package com.narudzbine.audit.infrastructure;

import com.narudzbine.audit.api.*;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.util.*;

/** Local tools/tests only: conditional API publication, not independent-host or power-loss/WORM proof. */
public final class FileIndependentObjectStore implements IndependentObjects {
    private final Path root,prepared;
    public FileIndependentObjectStore(Path directory){
        IndependentEvidence.outside();try{
            Path requested=directory.toAbsolutePath().normalize();if(Files.isSymbolicLink(requested)||!Files.isDirectory(requested,LinkOption.NOFOLLOW_LINKS))throw new IOException();
            root=requested.toRealPath();if(!root.equals(requested))throw new IOException();prepared=directory(root.resolve(".prepared"));
        }catch(IOException failure){throw new EvidenceFailure("EVIDENCE_STORE_UNAVAILABLE");}
    }
    @Override public boolean create(Key key,byte[] ciphertext){
        IndependentEvidence.outside();if(ciphertext==null||ciphertext.length<1||ciphertext.length>MAX_OBJECT)throw new EvidenceFailure("EVIDENCE_SIZE_LIMIT");
        byte[] snapshot=ciphertext.clone();Path temporary=null;
        try{
            verifyRoot();Path target=target(key,true);temporary=Files.createTempFile(prepared,"object-",".tmp");
            try(var output=FileChannel.open(temporary,StandardOpenOption.WRITE,LinkOption.NOFOLLOW_LINKS)){var bytes=ByteBuffer.wrap(snapshot);while(bytes.hasRemaining())output.write(bytes);output.force(true);}
            try{Files.createLink(target,temporary);return true;}catch(FileAlreadyExistsException existing){regular(target);return false;}
        }catch(IOException failure){throw new EvidenceFailure("EVIDENCE_STORE_UNAVAILABLE");}
        finally{if(temporary!=null)try{Files.deleteIfExists(temporary);}catch(IOException failure){/* An unpublished prepared file may need explicit local cleanup; never remove the published name. */}}
    }
    @Override public Optional<byte[]> read(Key key){
        IndependentEvidence.outside();try{
            verifyRoot();Path target=target(key,false);if(!Files.exists(target,LinkOption.NOFOLLOW_LINKS))return Optional.empty();regular(target);
            try(var channel=FileChannel.open(target,StandardOpenOption.READ,LinkOption.NOFOLLOW_LINKS);var input=java.nio.channels.Channels.newInputStream(channel)){
                if(channel.size()<1||channel.size()>MAX_OBJECT)throw new EvidenceFailure("EVIDENCE_SIZE_LIMIT");byte[] bytes=input.readNBytes(MAX_OBJECT+1);if(bytes.length<1||bytes.length>MAX_OBJECT)throw new EvidenceFailure("EVIDENCE_SIZE_LIMIT");return Optional.of(bytes);
            }
        }catch(NoSuchFileException missing){return Optional.empty();}catch(IOException failure){throw new EvidenceFailure("EVIDENCE_STORE_UNAVAILABLE");}
    }
    @Override public Page list(Family family,int size,Key after){
        IndependentEvidence.outside();page(family,size,after);var selected=new TreeSet<Key>(Comparator.comparing(Key::path));int visited=0;long deadline=System.nanoTime()+java.util.concurrent.TimeUnit.SECONDS.toNanos(10);
        try{
            verifyRoot();Path base=root.resolve(family.path());if(!Files.exists(base,LinkOption.NOFOLLOW_LINKS))return new Page(List.of(),false);existingDirectory(base);
            try(var resources=Files.newDirectoryStream(base)){
                for(Path resource:resources){if(++visited>100_000||System.nanoTime()-deadline>=0)throw new EvidenceFailure("EVIDENCE_LIST_LIMIT");existingDirectory(resource);
                    try{String name=resource.getFileName().toString();var identity=new Key(family,UUID.fromString(name),1);if(!identity.resource().toString().equals(name))throw new IllegalArgumentException();}catch(IllegalArgumentException failure){throw new EvidenceFailure("EVIDENCE_UNVERIFIED");}
                    try(var entries=Files.newDirectoryStream(resource)){
                        for(Path file:entries){if(++visited>100_000||System.nanoTime()-deadline>=0)throw new EvidenceFailure("EVIDENCE_LIST_LIMIT");regular(file);Key key;
                            try{key=Key.parse(family,root.relativize(file).toString().replace('\\','/'));}catch(IllegalArgumentException failure){throw new EvidenceFailure("EVIDENCE_UNVERIFIED");}
                            if(after==null||key.path().compareTo(after.path())>0){selected.add(key);if(selected.size()>size+1)selected.pollLast();}
                        }
                    }
                }
            }
            boolean more=selected.size()>size;if(more)selected.pollLast();return new Page(List.copyOf(selected),more);
        }catch(IOException failure){throw new EvidenceFailure("EVIDENCE_STORE_UNAVAILABLE");}
    }
    private Path target(Key key,boolean create)throws IOException{
        Objects.requireNonNull(key);Path base=root.resolve(key.family().path()),resource=base.resolve(key.resource().toString());
        if(create){directory(base);directory(resource);}else{if(Files.exists(base,LinkOption.NOFOLLOW_LINKS))existingDirectory(base);if(Files.exists(resource,LinkOption.NOFOLLOW_LINKS))existingDirectory(resource);}
        Path result=root.resolve(key.path()).normalize();if(!result.startsWith(root))throw new IOException();return result;
    }
    private Path directory(Path value)throws IOException{try{Files.createDirectory(value);}catch(FileAlreadyExistsException existing){/* Verify the existing parent, never follow a redirected directory. */}existingDirectory(value);return value;}
    private void verifyRoot()throws IOException{existingDirectory(root);existingDirectory(prepared);}
    private void existingDirectory(Path value)throws IOException{if(Files.isSymbolicLink(value)||!Files.isDirectory(value,LinkOption.NOFOLLOW_LINKS)||!value.toRealPath().equals(value))throw new IOException();}
    private void regular(Path value)throws IOException{if(Files.isSymbolicLink(value)||!Files.isRegularFile(value,LinkOption.NOFOLLOW_LINKS)||!value.toRealPath().startsWith(root))throw new IOException();}
    static void page(Family family,int size,Key after){if(family==null||size<1||size>1000||after!=null&&after.family()!=family)throw new IllegalArgumentException("Bounded evidence namespace required");}
}
