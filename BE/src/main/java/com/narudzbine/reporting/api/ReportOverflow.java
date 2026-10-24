package com.narudzbine.reporting.api;

public final class ReportOverflow extends RuntimeException {
    public ReportOverflow() { super("Report exceeds supported aggregate bounds"); }
}
