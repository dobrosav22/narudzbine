package com.narudzbine.media.infrastructure;

import com.narudzbine.media.api.*;
import java.io.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.concurrent.*;

/** One bounded child, no shell, credentials or client-controlled arguments. */
public final class NativeImageProcessor implements ImageProcessor {
    private final Path executable;
    public NativeImageProcessor(Path executable) {
        this.executable=executable.toAbsolutePath();
        byte[] proof=run("--self-test",new byte[0],4096);
        if(!new String(proof,java.nio.charset.StandardCharsets.US_ASCII).equals("SANDBOX_OK ImageMagick 7.1.2-34 landlock+seccomp stdin-stdout\n")) throw new IllegalStateException("Native sandbox qualification failed");
    }
    @Override public Image process(byte[] source,String type) {
        ImageHeaders.inspect(source,type);
        String format=switch(type) {case "image/jpeg"->"JPEG";case "image/png"->"PNG";case "image/webp"->"WEBP";default->throw new MediaFailure("INVALID_IMAGE");};
        byte[] bytes=run(format,source,5242880);
        var size=ImageHeaders.inspect(bytes,type);
        if(size.width()>2048||size.height()>2048) throw new MediaFailure("INVALID_IMAGE");
        return new Image(bytes,type,size.width(),size.height());
    }
    private byte[] run(String command,byte[] input,int cap) {
        Process child=null;Path directory=null;
        var tasks=Executors.newVirtualThreadPerTaskExecutor();
        try {
            directory=Files.createTempDirectory("media-native-");
            var builder=new ProcessBuilder(executable.toString(),command).directory(directory.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD);
            builder.environment().clear();builder.environment().put("MAGICK_CONFIGURE_PATH","/opt/magick/etc/ImageMagick-7");builder.environment().put("LANG","C");
            child=builder.start();Process running=child;
            var write=tasks.submit(()->{try(var out=running.getOutputStream()) {out.write(input);}return true;});
            var read=tasks.submit(()->{try(var in=running.getInputStream()) {byte[] bytes=in.readNBytes(cap+1);if(bytes.length>cap) throw new MediaFailure("IMAGE_OUTPUT_TOO_LARGE");return bytes;}});
            if(!child.waitFor(Duration.ofSeconds(10))) throw new MediaFailure("IMAGE_PROCESSING_LIMIT");
            byte[] output=read.get(1,TimeUnit.SECONDS);
            if(child.exitValue()==4) throw new MediaFailure("IMAGE_OUTPUT_TOO_LARGE");
            if(child.exitValue()==2) throw new MediaFailure("INVALID_IMAGE");
            if(child.exitValue()!=0) throw new MediaFailure("SERVICE_UNAVAILABLE");
            write.get(1,TimeUnit.SECONDS);return output;
        } catch(MediaFailure failure) {throw failure;}
          catch(ExecutionException failure) {if(failure.getCause() instanceof MediaFailure media) throw media;throw new MediaFailure("SERVICE_UNAVAILABLE");}
          catch(InterruptedException failure) {Thread.currentThread().interrupt();throw new MediaFailure("SERVICE_UNAVAILABLE");}
          catch(Exception failure) {throw new MediaFailure("SERVICE_UNAVAILABLE");}
        finally {
            if(child!=null) {if(child.isAlive()) child.destroyForcibly();try {child.getOutputStream().close();child.getInputStream().close();}catch(IOException ignored) { /* Child is terminated. */ }}
            tasks.shutdownNow();
            if(directory!=null) {try {Files.deleteIfExists(directory);}catch(IOException failure) {throw new IllegalStateException("Native private directory cleanup failed",failure);}}
        }
    }
}
