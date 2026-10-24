package com.narudzbine.reporting.application;
import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
class ExportSettingsTest {
    @Test void exportsDefaultOffAndEnabledConfigurationRequiresIsolatedKey(){
        assertThat(new ExportSettings(false,"",true).enabled()).isFalse();
        var draining=new ExportSettings(true,java.util.Base64.getEncoder().encodeToString(new byte[32]),false);assertThat(draining.enabled()).isTrue();assertThat(draining.accepting()).isFalse();
        assertThatThrownBy(()->new ExportSettings(true,"",true)).isInstanceOf(IllegalStateException.class).hasMessage("Explicit isolated256-bit export artifact key required");
        assertThatThrownBy(()->new ExportSettings(true,"invalid",true)).isInstanceOf(IllegalStateException.class);
        assertThat(new ExportSettings(true,java.util.Base64.getEncoder().encodeToString(new byte[32]),true).enabled()).isTrue();
    }
}
