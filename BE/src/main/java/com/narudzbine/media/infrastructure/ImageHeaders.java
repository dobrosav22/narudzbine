package com.narudzbine.media.infrastructure;

import com.narudzbine.media.api.MediaFailure;
import java.nio.*;
import java.util.Arrays;

/** Bounded structural preflight. The native decoder remains authoritative for pixels. */
public final class ImageHeaders {
    private ImageHeaders() {}
    public record Size(int width,int height) {}
    public static Size inspect(byte[] bytes,String type) {
        try {
            if(bytes.length==0||bytes.length>5242880) throw invalid();
            Size size=switch(type) {
                case "image/png" -> png(bytes);
                case "image/webp" -> webp(bytes);
                case "image/jpeg" -> jpeg(bytes);
                default -> throw invalid();
            };
            if(size.width<1||size.height<1||size.width>6000||size.height>6000||(long)size.width*size.height>20000000) throw new MediaFailure("IMAGE_DIMENSIONS_EXCEEDED");
            return size;
        } catch(IndexOutOfBoundsException|ArithmeticException failure) {throw invalid();}
    }
    private static Size png(byte[] b) {
        if(b.length<33||!Arrays.equals(Arrays.copyOf(b,8),new byte[]{(byte)137,80,78,71,13,10,26,10})||!tag(b,12,"IHDR")||be(b,8)!=13) throw invalid();
        Size size=new Size(be(b,16),be(b,20));boolean end=false;
        for(int p=8;p<b.length;) {
            int n=be(b,p);if(n<0||n>b.length-p-12) throw invalid();
            if(tag(b,p+4,"acTL")||tag(b,p+4,"fcTL")||tag(b,p+4,"fdAT")) throw new MediaFailure("ANIMATED_IMAGE_NOT_ALLOWED");
            p=Math.addExact(p,n+12);
            if(tag(b,p-n-8,"IEND")) {if(n!=0||p!=b.length) throw invalid();end=true;break;}
        }
        if(!end) throw invalid();return size;
    }
    private static Size webp(byte[] b) {
        if(b.length<20||!tag(b,0,"RIFF")||!tag(b,8,"WEBP")||Integer.toUnsignedLong(le(b,4))+8!=b.length) throw invalid();
        Size size=null;
        for(int p=12;p<b.length;) {
            int n=le(b,p+4);if(n<0||n>b.length-p-8) throw invalid();int d=p+8;
            if(tag(b,p,"ANIM")||tag(b,p,"ANMF")) throw new MediaFailure("ANIMATED_IMAGE_NOT_ALLOWED");
            if(tag(b,p,"VP8X")) {if(n!=10) throw invalid();if((b[d]&2)!=0) throw new MediaFailure("ANIMATED_IMAGE_NOT_ALLOWED");size=new Size(u24(b,d+4)+1,u24(b,d+7)+1);}
            if(tag(b,p,"VP8 ")) {if(n<10||b[d+3]!=(byte)0x9d||b[d+4]!=1||b[d+5]!=0x2a) throw invalid();Size frame=new Size(u16(b,d+6)&16383,u16(b,d+8)&16383);size=consistent(size,frame);}
            if(tag(b,p,"VP8L")) {if(n<5||b[d]!=0x2f) throw invalid();int bits=le(b,d+1);Size frame=new Size((bits&16383)+1,((bits>>>14)&16383)+1);size=consistent(size,frame);}
            p=Math.addExact(p,8+n+(n&1));if(p>b.length) throw invalid();
        }
        if(size==null) throw invalid();return size;
    }
    private static Size consistent(Size size,Size frame) {if(size!=null&&!size.equals(frame)) throw invalid();return frame;}
    private static Size jpeg(byte[] b) {
        if(b.length<4||b[0]!=(byte)255||b[1]!=(byte)216||b[b.length-2]!=(byte)255||b[b.length-1]!=(byte)217) throw invalid();
        Size size=null;boolean scan=false;boolean hadScan=false;
        for(int p=2;p<b.length;) {
            if(scan) {
                while(p<b.length&&(b[p]&255)!=255) p++;
                if(p+1>=b.length) throw invalid();
                int next=b[p+1]&255;
                if(next==0||(next>=0xd0&&next<=0xd7)) {p+=2;continue;}
                scan=false;
            }
            if((b[p++]&255)!=255) throw invalid();while(p<b.length&&(b[p]&255)==255) p++;
            int marker=b[p++]&255;
            if(marker==0xd9) {if(p!=b.length||size==null||!hadScan) throw invalid();return size;}
            if(marker==0xd8||marker==0) throw invalid();
            int n=((b[p]&255)<<8)|(b[p+1]&255);if(n<2||n>b.length-p) throw invalid();
            if(marker==0xda) {if(size==null) throw invalid();scan=true;hadScan=true;}
            if(marker>=0xc0&&marker<=0xcf&&marker!=0xc4&&marker!=0xc8&&marker!=0xcc) {
                if(n<8||size!=null) throw invalid();size=new Size(((b[p+5]&255)<<8)|(b[p+6]&255),((b[p+3]&255)<<8)|(b[p+4]&255));
            }
            p+=n;
        }
        throw invalid();
    }
    private static int be(byte[] b,int p) {return ByteBuffer.wrap(b,p,4).getInt();}
    private static int le(byte[] b,int p) {return ByteBuffer.wrap(b,p,4).order(ByteOrder.LITTLE_ENDIAN).getInt();}
    private static int u16(byte[] b,int p) {return (b[p]&255)|((b[p+1]&255)<<8);}
    private static int u24(byte[] b,int p) {return u16(b,p)|((b[p+2]&255)<<16);}
    private static boolean tag(byte[] b,int p,String value) {for(int i=0;i<4;i++) if(b[p+i]!=(byte)value.charAt(i)) return false;return true;}
    private static MediaFailure invalid() {return new MediaFailure("INVALID_IMAGE");}
}
