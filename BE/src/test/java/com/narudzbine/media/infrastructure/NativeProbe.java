package com.narudzbine.media.infrastructure;

import com.narudzbine.media.api.MediaFailure;
import java.nio.file.*;
import java.util.Arrays;
import javax.imageio.ImageIO;

/** Executed inside the exact runtime image, never packaged as an application endpoint. */
public final class NativeProbe {
    private static int checks;
    public static void main(String[] args)throws Exception {
        var nativeProcessor=new NativeImageProcessor(Path.of("/opt/magick/processor"));
        for(String name:new String[]{"alpha.png","alpha.webp","lossless.webp","rotated.jpg","progressive.jpg","profile.png","large.png","max-valid.png"}) {
            String type=name.endsWith("png")?"image/png":name.endsWith("webp")?"image/webp":"image/jpeg";
            byte[] source=read(name);var result=nativeProcessor.process(source,type);
            check(result.mediaType().equals(type)&&result.bytes().length<=5242880,"format and size "+name);
            check(result.width()<=2048&&result.height()<=2048,"resize bounds "+name);
            String raw=new String(result.bytes(),java.nio.charset.StandardCharsets.ISO_8859_1);
            check(!raw.contains("synthetic-private-metadata")&&!raw.contains("Exif")&&!raw.contains("iCCP")&&!raw.contains("eXIf"),"metadata removal "+name);
            check(Arrays.equals(result.bytes(),nativeProcessor.process(source,type).bytes()),"deterministic retry "+name);
            if(name.equals("rotated.jpg")) check(result.width()==32&&result.height()==64,"EXIF orientation");
            if(name.equals("large.png")) check(result.width()==2048&&result.height()==683,"aspect ratio");
            if(name.equals("alpha.png")) {var pixels=ImageIO.read(new java.io.ByteArrayInputStream(result.bytes()));check(pixels.getColorModel().hasAlpha()&&((pixels.getRGB(0,0)>>>24)&255)==120,"PNG transparency");}
            if(name.equals("alpha.webp")) check(webpAlpha(result.bytes()),"WebP transparency");
        }
        reject(nativeProcessor,"animated.png","image/png","ANIMATED_IMAGE_NOT_ALLOWED");
        reject(nativeProcessor,"animated.webp","image/webp","ANIMATED_IMAGE_NOT_ALLOWED");
        reject(nativeProcessor,"too-wide.png","image/png","IMAGE_DIMENSIONS_EXCEEDED");
        reject(nativeProcessor,"too-many.png","image/png","IMAGE_DIMENSIONS_EXCEEDED");
        byte[] png=read("alpha.png");bad(nativeProcessor,Arrays.copyOf(png,png.length-1),"image/png","INVALID_IMAGE");
        byte[] broken=png.clone();broken[29]^=1;bad(nativeProcessor,broken,"image/png","INVALID_IMAGE");
        bad(nativeProcessor,"<svg/>".getBytes(java.nio.charset.StandardCharsets.US_ASCII),"image/png","INVALID_IMAGE");
        bad(nativeProcessor,png,"image/jpeg","INVALID_IMAGE");
        byte[] jpeg=read("rotated.jpg"),joined=new byte[jpeg.length*2];System.arraycopy(jpeg,0,joined,0,jpeg.length);System.arraycopy(jpeg,0,joined,jpeg.length,jpeg.length);bad(nativeProcessor,joined,"image/jpeg","INVALID_IMAGE");
        bad(nativeProcessor,new byte[5242881],"image/png","INVALID_IMAGE");
        var noise=new java.awt.image.BufferedImage(2100,2100,java.awt.image.BufferedImage.TYPE_BYTE_INDEXED);
        new java.util.Random(20261020).nextBytes(((java.awt.image.DataBufferByte)noise.getRaster().getDataBuffer()).getData());
        var compressed=new java.io.ByteArrayOutputStream();ImageIO.write(noise,"png",compressed);
        if(compressed.size()>5242880)throw new AssertionError("Output-limit source fixture exceeds admission bound");
        bad(nativeProcessor,compressed.toByteArray(),"image/png","IMAGE_OUTPUT_TOO_LARGE");
        // Fault injection for the Java watchdog, separate from real native security checks.
        var slow=new NativeImageProcessor(Path.of("/probe/watchdog"));long start=System.nanoTime();bad(slow,read("alpha.png"),"image/png","IMAGE_PROCESSING_LIMIT");check(System.nanoTime()-start<java.time.Duration.ofSeconds(12).toNanos(),"parent watchdog bounds stalled child");
        System.out.println("NATIVE_CHECKS_OK "+checks);
    }
    private static boolean webpAlpha(byte[] b) {for(int p=12;p+8<=b.length;) {String tag=new String(b,p,4,java.nio.charset.StandardCharsets.US_ASCII);int n=java.nio.ByteBuffer.wrap(b,p+4,4).order(java.nio.ByteOrder.LITTLE_ENDIAN).getInt();if(tag.equals("VP8X"))return (b[p+8]&16)!=0;if(tag.equals("VP8L"))return (b[p+12]&16)!=0;p+=8+n+(n&1);}return false;}
    private static byte[] read(String name)throws Exception {return Files.readAllBytes(Path.of("/fixtures",name));}
    private static void reject(NativeImageProcessor p,String file,String type,String code)throws Exception {bad(p,read(file),type,code);}
    private static void bad(NativeImageProcessor p,byte[] input,String type,String code) {try {p.process(input,type);throw new AssertionError("Invalid image accepted");}catch(MediaFailure failure) {check(failure.code().equals(code),"failure code "+failure.code()+" expected "+code);}}
    private static void check(boolean good,String detail) {if(!good)throw new AssertionError(detail);checks++;}
}
