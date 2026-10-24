package com.narudzbine.identity.application;

import com.narudzbine.reporting.api.*;
import com.narudzbine.organizations.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public final class ExportAccess implements ExportAuthority {
    private final MembershipAccess memberships;private final JdbcTemplate jdbc;
    public ExportAccess(MembershipAccess memberships,JdbcTemplate jdbc){this.memberships=memberships;this.jdbc=jdbc;}
    @Override public Result lock(Exports.Scope scope,String kind){
        var member=memberships.lockForOrganizationWrite(scope.requester());
        if(member.isEmpty()||!member.get().organizationId().equals(scope.organization())||!member.get().country().name().equals(scope.country())||!member.get().organizationActive()||kind.equals("REPORT_BUYERS")&&member.get().type()!=OrganizationType.VENDOR)return Result.REVOKED;
        var rows=jdbc.queryForList("SELECT state,email_verified,credential_operation_pending FROM account_identity WHERE id=? AND kind='BUSINESS' FOR UPDATE",scope.requester());
        if(rows.isEmpty()||!rows.getFirst().get("state").equals("ACTIVE")||!Boolean.TRUE.equals(rows.getFirst().get("email_verified")))return Result.REVOKED;
        return Boolean.TRUE.equals(rows.getFirst().get("credential_operation_pending"))?Result.DEFER:Result.ALLOWED;
    }
}
