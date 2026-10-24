package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.nio.file.Files;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
class UploadBodyTest {
    @Test void streamsPrivateTemporaryFileAndRemovesItOnClose()throws Exception{
        var r=new MockHttpServletRequest();r.setContentType("application/octet-stream");byte[] bytes=new byte[]{(byte)137,80,78,71,13,10,26,10};r.setContent(bytes);var body=UploadBody.read(r);assertThat(Files.readAllBytes(body.path)).isEqualTo(bytes);assertThat(body.bytes).isEqualTo(8);assertThat(body.mediaType).isEqualTo("image/png");if(Files.getFileStore(body.path).supportsFileAttributeView("posix")){assertThat(Files.getPosixFilePermissions(body.path)).doesNotContain(java.nio.file.attribute.PosixFilePermission.GROUP_READ,java.nio.file.attribute.PosixFilePermission.OTHERS_READ);}body.close();assertThat(Files.exists(body.path)).isFalse();
    }
    @Test void encodedOrUnsupportedTransportNeverCreatesAnAdmittedBody(){for(String encoding:java.util.List.of("gzip","identity")){var r=new MockHttpServletRequest();r.setContentType("image/png");r.addHeader("Content-Encoding",encoding);r.setContent(new byte[5242881]);assertThatThrownBy(()->UploadBody.read(r)).isInstanceOf(AuthHttpFailure.class).satisfies(e->assertThat(((AuthHttpFailure)e).status).isEqualTo(415));}}
}
