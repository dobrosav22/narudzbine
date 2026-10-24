package com.narudzbine.verification;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.extension.AfterTestExecutionCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

/** Diagnostic counts only. XML reports and the complete build determine acceptance. */
public final class VerificationProgress implements AfterTestExecutionCallback {
    private static final ConcurrentHashMap<Class<?>, Progress> CLASSES = new ConcurrentHashMap<>();
    @Override public void afterTestExecution(ExtensionContext context) {
        Class<?> type = context.getRequiredTestClass();
        Progress progress = CLASSES.computeIfAbsent(type, ignored -> new Progress());
        if (context.getExecutionException().isPresent()) {
            progress.failures.incrementAndGet();
            var failure = context.getExecutionException().orElseThrow();
            String location = java.util.Arrays.stream(failure.getStackTrace())
                    .filter(frame -> frame.getClassName().equals(type.getName()))
                    .map(frame -> frame.getFileName() + ":" + frame.getLineNumber()).findFirst().orElse("unavailable");
            System.out.printf("[verification-failure] class=%s method=%s exception=%s location=%s%n", type.getSimpleName(),
                    context.getRequiredTestMethod().getName(), failure.getClass().getSimpleName(), location);
        }
        int count = progress.completed.incrementAndGet();
        if (count % 50 == 0) {
            long seconds = (System.nanoTime() - progress.started) / 1_000_000_000L;
            System.out.printf("[verification-progress] class=%s completed=%d testFailures=%d elapsedSeconds=%d%n",
                    type.getSimpleName(), count, progress.failures.get(), seconds);
        }
    }
    private static final class Progress {
        final long started = System.nanoTime();
        final AtomicInteger completed = new AtomicInteger();
        final AtomicInteger failures = new AtomicInteger();
    }
}
