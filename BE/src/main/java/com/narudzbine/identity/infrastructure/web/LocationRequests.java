package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.LoginInput;
import com.narudzbine.organizations.api.LocationRecord;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.text.Normalizer;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class LocationRequests {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    static Input input(HttpServletRequest request, boolean create) throws IOException {
        var body = AuthRequests.object(request, create ? Set.of("id","name","address","contact","instructions")
                : Set.of("expectedRevision","name","address","contact","instructions"));
        var errors = new ArrayList<AuthErrors.FieldError>();
        UUID id = create ? id(body.path("id").isString() ? body.path("id").asString() : null, "BODY", "/id") : null;
        String revision = create ? null : revision(body);
        String name = OrganizationRequests.text(body, "name", "", 100, false, errors);
        var address = OrganizationRequests.address(body.path("address"), "/address", errors);
        LocationRecord.Contact contact = null; var node = body.path("contact");
        if (body.has("contact") && node.isNull()) { /* Vendor may explicitly omit the contact. */ }
        else if (!node.isObject()) { error(errors, "/contact"); }
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
        String instructions = null;
        if (!(body.has("instructions") && body.path("instructions").isNull())) {
            if (!body.path("instructions").isString()) { error(errors,"/instructions"); }
            else {
                instructions = Normalizer.normalize(body.path("instructions").asString().replace("\r\n","\n").replace('\r','\n').strip(),Normalizer.Form.NFC);
                if (instructions.isBlank() || instructions.codePointCount(0,instructions.length()) > 2000
                        || instructions.codePoints().anyMatch(c -> (Character.isISOControl(c) && c != '\n' && c != '\t') || (c >= 0xd800 && c <= 0xdfff))) { error(errors,"/instructions"); }
            }
        }
        if (!errors.isEmpty()) { errors.sort(Comparator.comparing(AuthErrors.FieldError::path)); throw new AuthHttpFailure(errors); }
        return new Input(id,revision,new LocationRecord.Values(name,address,contact,instructions));
    }
    static String revisionCommand(HttpServletRequest request) throws IOException { return revision(AuthRequests.object(request,Set.of("expectedRevision"))); }
    private static String revision(JsonNode body) {
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
    static byte[] digest(LocationRecord.Values values) {
        try { return java.security.MessageDigest.getInstance("SHA-256").digest(JSON.writeValueAsBytes(values)); }
        catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable."); }
    }
    record Query(int page,int size,String state,boolean total) { }
    record Input(UUID id,String expectedRevision,LocationRecord.Values values) {
        @Override public String toString() { return "LocationInput[redacted]"; }
    }
}
