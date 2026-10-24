package com.narudzbine.shared.infrastructure.recovery;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.BackendApplication;
import java.util.List;
import org.junit.jupiter.api.Test;
class BootstrapCommandTest {
 @Test void malformedMigrationPrefixesNeverStartTheServerOrOpenTheDatabase(){for(String[] args:List.of(new String[]{"--migrate-invalid"},new String[]{"--migrate=true"},new String[]{"--migrate","--force"}))assertThatThrownBy(()->BackendApplication.main(args)).isInstanceOf(IllegalArgumentException.class).hasMessage("Expected --migrate");}
 @Test void malformedBackupPrefixesNeverStartTheServerOrReadSourceInput(){for(String[] args:List.of(new String[]{"--backup-envelope-invalid"},new String[]{"--backup-envelope","unknown"},new String[]{"--backup-envelope","encrypt","--force"}))assertThatThrownBy(()->BackendApplication.main(args)).isInstanceOf(IllegalArgumentException.class).hasMessage("Expected --backup-envelope encrypt|decrypt");}
}
