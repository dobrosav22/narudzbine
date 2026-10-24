package com.narudzbine.media.infrastructure;

import static org.assertj.core.api.Assertions.*;
import com.narudzbine.media.api.MediaFailure;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class ImageHeadersTest {
    private byte[] read(String name)throws Exception{return Files.readAllBytes(Path.of("src/test/resources/media",name));}
    @Test void acceptedHeadersIncludeProgressiveJpegLosslessWebpAndAlphaPng()throws Exception{for(String file:List.of("alpha.png","alpha.webp","lossless.webp","rotated.jpg","progressive.jpg","profile.png","max-valid.png")){String type=file.endsWith("png")?"image/png":file.endsWith("jpg")?"image/jpeg":"image/webp";var size=ImageHeaders.inspect(read(file),type);assertThat(size.width()).isPositive();assertThat(size.height()).isPositive();}}
    @Test void dimensionsAndAnimationAreRejectedBeforeDecoderInvocation()throws Exception{for(String file:List.of("too-wide.png","too-many.png"))assertThatThrownBy(()->ImageHeaders.inspect(read(file),"image/png")).isInstanceOf(MediaFailure.class).hasMessage("IMAGE_DIMENSIONS_EXCEEDED");for(String file:List.of("animated.png","animated.webp"))assertThatThrownBy(()->ImageHeaders.inspect(read(file),file.endsWith("png")?"image/png":"image/webp")).isInstanceOf(MediaFailure.class).hasMessage("ANIMATED_IMAGE_NOT_ALLOWED");}
    @Test void concatenatedJpegAndTrailingPngBytesAreNotSilentlyIgnored()throws Exception{byte[] jpeg=read("rotated.jpg"),twice=new byte[jpeg.length*2];System.arraycopy(jpeg,0,twice,0,jpeg.length);System.arraycopy(jpeg,0,twice,jpeg.length,jpeg.length);assertThatThrownBy(()->ImageHeaders.inspect(twice,"image/jpeg")).isInstanceOf(MediaFailure.class);assertThatThrownBy(()->ImageHeaders.inspect(Arrays.copyOf(read("alpha.png"),200),"image/png")).isInstanceOf(MediaFailure.class);}
    @Test void boundedMalformedHeadersNeverEscapeAsUncheckedParserFailures(){Random random=new Random(20261020);for(int n=0;n<1000;n++){byte[] input=new byte[n%201];random.nextBytes(input);for(String type:List.of("image/png","image/jpeg","image/webp"))assertThatThrownBy(()->ImageHeaders.inspect(input,type)).isInstanceOf(MediaFailure.class);}}
}
