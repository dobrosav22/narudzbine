package com.narudzbine;

import com.narudzbine.shared.infrastructure.database.MigrationCommand;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class BackendApplication {
    public static void main(String[] args) {
        com.narudzbine.shared.api.RecoveryContainment.commandGuard(args, System.getenv());
        if (java.util.Arrays.stream(args).anyMatch(arg -> arg.startsWith("--migrate"))) {
            if (args.length != 1 || !"--migrate".equals(args[0])) throw new IllegalArgumentException("Expected --migrate");
            MigrationCommand.run(System.getenv());
            return;
        }
        if (java.util.Arrays.stream(args).anyMatch(arg -> arg.startsWith("--backup-envelope"))) {
            com.narudzbine.shared.infrastructure.recovery.BackupEnvelopeCommand.run(args, System.getenv(), System.in, System.out);
            return;
        }
        if (java.util.Arrays.stream(args).anyMatch(arg -> arg.startsWith("--redaction-worker"))) {
            com.narudzbine.audit.infrastructure.ScopedRedactionWorkerCommand.run(args, System.getenv());
            return;
        }
        SpringApplication.run(BackendApplication.class, args);
    }
}
