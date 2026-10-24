package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.SupportedLocales;
import com.narudzbine.organizations.api.Country;
import com.narudzbine.organizations.api.OrganizationRecord;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import tools.jackson.databind.JsonNode;

final class OrganizationRequests {
    private static final Set<String> FIELDS = Set.of("expectedRevision", "displayName", "legalName", "registeredAddress",
            "defaultLanguage", "staffSubmissionRestricted", "partnerContactId");
    private static final Set<String> ADDRESS_FIELDS = Set.of("line1", "line2", "city", "postalCode", "country", "latitude", "longitude");

    static Update update(HttpServletRequest request, SupportedLocales locales) throws IOException {
        var body = AuthRequests.object(request, FIELDS);
        var errors = new ArrayList<AuthErrors.FieldError>();
        String revision = body.path("expectedRevision").isString() ? body.path("expectedRevision").asString() : null;
        if (revision == null || revision.isEmpty() || revision.length() > 256) { error(errors, "/expectedRevision"); }
        String display = text(body, "displayName", "", 200, false, errors);
        String legal = text(body, "legalName", "", 200, false, errors);
        String language = null;
        try {
            if (!body.path("defaultLanguage").isString()) { throw new IllegalArgumentException(); }
            language = locales.canonical(body.path("defaultLanguage").asString());
        } catch (IllegalArgumentException exception) { error(errors, "/defaultLanguage"); }
        if (!body.path("staffSubmissionRestricted").isBoolean()) { error(errors, "/staffSubmissionRestricted"); }
        java.util.UUID partnerContact=null;
        if(!body.has("partnerContactId")){error(errors,"/partnerContactId");}
        else if(!body.path("partnerContactId").isNull()){
            try{partnerContact=ContactRequests.id(body.path("partnerContactId").isString()?body.path("partnerContactId").asString():null,"BODY","/partnerContactId");}
            catch(AuthHttpFailure ex){errors.addAll(ex.fields);}
        }
        var parsed = address(body.path("registeredAddress"), "/registeredAddress", errors);
        if (!errors.isEmpty()) {
            errors.sort(java.util.Comparator.comparing(AuthErrors.FieldError::path));
            throw new AuthHttpFailure(errors);
        }
        return new Update(revision, new OrganizationRecord.Values(display, legal, parsed, language,
                body.path("staffSubmissionRestricted").asBoolean(),partnerContact));
    }

    static OrganizationRecord.Address address(JsonNode address, String prefix, List<AuthErrors.FieldError> errors) {
        OrganizationRecord.Address parsed = null;
        if (!address.isObject()) { error(errors, prefix); }
        else {
            for (String field : address.propertyNames()) {
                if (!ADDRESS_FIELDS.contains(field)) { throw new AuthHttpFailure(422, "VALIDATION_FAILED", prefix); }
            }
            String line1 = text(address, "line1", prefix, 200, false, errors);
            String line2 = text(address, "line2", prefix, 200, true, errors);
            String city = text(address, "city", prefix, 100, false, errors);
            String postal = text(address, "postalCode", prefix, 20, false, errors);
            Country country = null;
            try {
                if (!address.path("country").isString()) { throw new IllegalArgumentException(); }
                country = Country.valueOf(address.path("country").asString());
            } catch (IllegalArgumentException exception) { error(errors, prefix + "/country"); }
            BigDecimal latitude = coordinate(address, "latitude", prefix, 90, errors);
            BigDecimal longitude = coordinate(address, "longitude", prefix, 180, errors);
            parsed = new OrganizationRecord.Address(line1, line2, city, postal, country, latitude, longitude);
        }
        return parsed;
    }

    static String text(JsonNode parent, String field, String prefix, int max, boolean nullable,
            List<AuthErrors.FieldError> errors) {
        var node = parent.path(field);
        if (parent.has(field) && nullable && node.isNull()) { return null; }
        if (!node.isString()) { error(errors, prefix + "/" + field); return null; }
        String value = Normalizer.normalize(node.asString().strip(), Normalizer.Form.NFC);
        if (value.isBlank() || value.codePointCount(0, value.length()) > max
                || value.codePoints().anyMatch(c -> Character.isISOControl(c) || (c >= 0xd800 && c <= 0xdfff))) {
            error(errors, prefix + "/" + field); return null;
        }
        return value;
    }

    private static BigDecimal coordinate(JsonNode parent, String field, String prefix, int bound, List<AuthErrors.FieldError> errors) {
        if (parent.has(field) && parent.path(field).isNull()) { return null; }
        try {
            var node = parent.path(field);
            if (!node.isNumber()) { throw new IllegalArgumentException(); }
            BigDecimal value = new BigDecimal(node.toString()).stripTrailingZeros();
            if (value.abs().compareTo(BigDecimal.valueOf(bound)) > 0 || value.scale() > 16383) { throw new IllegalArgumentException(); }
            return value;
        } catch (IllegalArgumentException exception) { error(errors, prefix + "/" + field); return null; }
    }

    private static void error(List<AuthErrors.FieldError> errors, String path) { errors.add(new AuthErrors.FieldError(path, "INVALID_VALUE")); }
    record Update(String expectedRevision, OrganizationRecord.Values values) {
        @Override public String toString() { return "OrganizationUpdate[redacted]"; }
    }
}
