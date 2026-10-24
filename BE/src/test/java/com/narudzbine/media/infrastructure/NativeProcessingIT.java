package com.narudzbine.media.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Path;
import java.util.Map;
import com.github.dockerjava.api.model.Capability;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.images.builder.ImageFromDockerfile;
import org.testcontainers.utility.MountableFile;

class NativeProcessingIT {
    @Test void actualPinnedRuntimeProcessesFixturesInsideEnforcedSandbox()throws Exception {
        Path base=Path.of("").toAbsolutePath();
        var image=new ImageFromDockerfile("narudzbine-native-it:vs11",false)
            .withFileFromString("Dockerfile",java.nio.file.Files.readString(base.resolve("Dockerfile"))+"\nCOPY probe/classes /probe/classes\nCOPY probe/tests /probe/tests\nCOPY probe/fixtures /fixtures\nCOPY --chown=10001:10001 probe/watchdog /probe/watchdog\nRUN chmod 0555 /probe/watchdog\n")
            .withFileFromPath("native",base.resolve("native"))
            .withFileFromPath("probe/classes",base.resolve("target/classes"))
            .withFileFromPath("probe/tests",base.resolve("target/test-classes"))
            .withFileFromPath("probe/fixtures",base.resolve("src/test/resources/media"))
            .withFileFromPath("probe/watchdog",base.resolve("src/test/resources/media-watchdog.sh"))
            .withFileFromPath("target/narudzbine-backend-0.1.0-SNAPSHOT.jar",base.resolve("target/narudzbine-backend-0.1.0-SNAPSHOT.jar"));
        try(var runtime=new GenericContainer<>(image)
                .withCreateContainerCmdModifier(c->c.withEntrypoint("/bin/sleep").getHostConfig().withNetworkMode("none").withReadonlyRootfs(true).withCapDrop(Capability.ALL).withSecurityOpts(java.util.List.of("no-new-privileges:true")).withTmpFs(Map.of("/tmp","rw,noexec,nosuid,size=64m,mode=1777")))
                .withCommand("300")) {
            runtime.start();var result=runtime.execInContainer("java","-cp","/probe/classes:/probe/tests","com.narudzbine.media.infrastructure.NativeProbe");
            assertThat(result.getExitCode()).as(result.getStderr()+result.getStdout()).isZero();
            assertThat(result.getStdout()).contains("NATIVE_CHECKS_OK 49");
        }
    }
}
