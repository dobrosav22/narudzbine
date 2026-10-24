package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.LoginInput;
import com.narudzbine.organizations.api.LocationRecord;
import com.narudzbine.organizations.api.BusinessContactRecord;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class ContactRequests {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    static Input input(HttpServletRequest request, boolean create) throws IOException {
        var body = AuthRequests.object(request, create ? Set.of("id","label","contact")
                : Set.of("expectedRevision","label","contact"));
        var errors = new ArrayList<AuthErrors.FieldError>();
        UUID id = null;
        String revision = null;
        try {
            if (create) { id = id(body.path("id").isString() ? body.path("id").asString() : null,"BODY","/id"); }
            else { revision = revision(body); }
        } catch (AuthHttpFailure failure) { errors.addAll(failure.fields); }
        String label = OrganizationRequests.text(body, "label", "", 100, false, errors);
        LocationRecord.Contact contact = null; var node = body.path("contact");
        if (!node.isObject()) { error(errors, "/contact"); }
        else {
            for (String field : node.propertyNames()) {
                if (!Set.of("name","phone","email").contains(field)) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/contact"); }
            }
            String person = OrganizationRequests.text(node,"name","/contact",100,false,errors);
            String phone = OrganizationRequests.text(node,"phone","/contact",30,false,errors);
            if (phone != null && (phone.length() < 3 || !phone.matches("[+0-9 ()-]+"))) { error(errors,"/contact/phone"); }
            String email = null;
            if (!(node.has("email") && node.path("email").isNull())) {
                try {
                    if (!node.path("email").isString()) { throw new IllegalArgumentException(); }
                    email = LoginInput.email(node.path("email").asString());
                } catch (IllegalArgumentException exception) { error(errors,"/contact/email"); }
            }
            contact = new LocationRecord.Contact(person,phone,email);
        }
        if (!errors.isEmpty()) { errors.sort(Comparator.comparing(AuthErrors.FieldError::path)); throw new AuthHttpFailure(errors); }
        return new Input(id,revision,new BusinessContactRecord.Values(label,contact));
    }
    static String revisionCommand(HttpServletRequest request) throws IOException { return revision(AuthRequests.object(request,Set.of("expectedRevision"))); }
    static String revision(JsonNode body) {
        if (!body.path("expectedRevision").isString()) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/expectedRevision"); }
        String value = body.path("expectedRevision").asString();
        if (value.isEmpty() || value.length() > 256) { throw new AuthHttpFailure(422,"VALIDATION_FAILED","/expectedRevision"); }
        return value;
    }
    static UUID id(String value, String location, String path) {
        try {
            UUID id = UUID.fromString(value);
            if (!id.toString().equals(value) || id.version()!=7 || id.variant()!=2) { throw new IllegalArgumentException(); }
            return id;
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new AuthHttpFailure(List.of(new AuthErrors.FieldError(location,path,"INVALID_VALUE")));
        }
    }
    static Query query(HttpServletRequest request) {
        for (var entry : request.getParameterMap().entrySet()) {
            if (!Set.of("page","size","includeTotal","state").contains(entry.getKey()) || entry.getValue().length != 1) {
                throw new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY","","INVALID_VALUE")));
            }
        }
        int page = number(request,"page",0,0,10000), size = number(request,"size",25,1,100);
        String total = request.getParameter("includeTotal"), state = request.getParameter("state");
        if (total != null && !Set.of("true","false").contains(total)) { throw queryError("includeTotal"); }
        if (state != null && !Set.of("ACTIVE","ARCHIVED").contains(state)) { throw queryError("state"); }
        return new Query(page,size,state,"true".equals(total));
    }
    private static int number(HttpServletRequest r, String key, int fallback, int min, int max) {
        String v=r.getParameter(key); if (v==null) { return fallback; }
        try {
            if (!v.matches("0|[1-9][0-9]{0,5}")) { throw new IllegalArgumentException(); }
            int n=Integer.parseInt(v); if (n<min || n>max) { throw new IllegalArgumentException(); } return n;
        } catch (IllegalArgumentException e) { throw queryError(key); }
    }
    private static AuthHttpFailure queryError(String field) { return new AuthHttpFailure(List.of(new AuthErrors.FieldError("QUERY",field,"INVALID_VALUE"))); }
    private static void error(List<AuthErrors.FieldError> errors,String path) { errors.add(new AuthErrors.FieldError(path,"INVALID_VALUE")); }
    static byte[] digest(BusinessContactRecord.Values values, byte[] key) {
        try {
            var mac=javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(key,"HmacSHA256"));
            mac.update("narudzbine/contact-create/v1\0".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
            return mac.doFinal(JSON.writeValueAsBytes(values));
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException("Creation fingerprint unavailable."); }
    }
    record Query(int page,int size,String state,boolean total) { }
    record Input(UUID id,String expectedRevision,BusinessContactRecord.Values values) {
        @Override public String toString() { return "ContactInput[redacted]"; }
    }
}
