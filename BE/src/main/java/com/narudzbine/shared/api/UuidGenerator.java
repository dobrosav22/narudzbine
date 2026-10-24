package com.narudzbine.shared.api;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public final class UuidGenerator {
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public UuidGenerator(Clock clock) {
        this.clock = clock;
    }

    public UUID next() {
        long milliseconds = clock.millis();
        if (milliseconds < 0 || milliseconds > 0xffffffffffffL) {
            throw new IllegalStateException("Clock is outside the UUIDv7 timestamp range.");
        }
        long high = (milliseconds << 16) | 0x7000L | (random.nextLong() & 0xfffL);
        long low = (random.nextLong() & 0x3fffffffffffffffL) | 0x8000000000000000L;
        return new UUID(high, low);
    }
}
