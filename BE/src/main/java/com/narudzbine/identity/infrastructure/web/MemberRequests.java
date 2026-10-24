package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.organizations.api.BusinessRole;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

final class MemberRequests {
    static Change change(HttpServletRequest request,boolean roleChange) throws IOException {
        var body=AuthRequests.object(request,roleChange?Set.of("expectedRevision","role"):Set.of("expectedRevision"));
        var errors=new ArrayList<AuthErrors.FieldError>();String revision=null;BusinessRole role=null;
        try { revision=ContactRequests.revision(body); } catch(AuthHttpFailure failure) { errors.addAll(failure.fields); }
        if (roleChange) {
            try {
                if(!body.path("role").isString()) { throw new IllegalArgumentException(); }
                role=BusinessRole.valueOf(body.path("role").asString());if(role==BusinessRole.OWNER) { throw new IllegalArgumentException(); }
            } catch(IllegalArgumentException exception) { errors.add(new AuthErrors.FieldError("/role","INVALID_VALUE")); }
        }
        if(!errors.isEmpty()) { throw new AuthHttpFailure(errors); }
        return new Change(revision,role);
    }
    static Query query(HttpServletRequest request) {
        for(var e:request.getParameterMap().entrySet()) {
            if(!Set.of("page","size","includeTotal","state","role").contains(e.getKey()) || e.getValue().length!=1) { throw queryError(""); }
        }
        int page=number(request,"page",0,0,10000),size=number(request,"size",25,1,100);
        String total=request.getParameter("includeTotal"),state=request.getParameter("state"),role=request.getParameter("role");
        if(total!=null && !Set.of("true","false").contains(total)) { throw queryError("includeTotal"); }
        if(state!=null && !Set.of("ACTIVE","DEACTIVATED").contains(state)) { throw queryError("state"); }
        if(role!=null && !Set.of("OWNER","ADMIN","STAFF").contains(role)) { throw queryError("role"); }
        return new Query(page,size,state,role,"true".equals(total));
    }
    private static int number(HttpServletRequest r,String key,int fallback,int min,int max) {
        String v=r.getParameter(key);if(v==null) { return fallback; }
        try {
            if(!v.matches("0|[1-9][0-9]{0,5}")) { throw new IllegalArgumentException(); }
            int n=Integer.parseInt(v);if(n<min || n>max) { throw new IllegalArgumentException(); }return n;
        } catch(IllegalArgumentException exception) { throw queryError(key); }
    }
    private static AuthHttpFailure queryError(String field) { return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",field,"INVALID_VALUE"))); }
    record Change(String expectedRevision,BusinessRole role) { }
    record Query(int page,int size,String state,String role,boolean total) { }
}
