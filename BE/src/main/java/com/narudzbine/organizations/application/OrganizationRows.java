package com.narudzbine.organizations.application;
import com.narudzbine.organizations.api.*;
import java.sql.*;
import java.math.BigDecimal;
import java.util.UUID;
final class OrganizationRows {
 static OrganizationRecord map(ResultSet row,int index)throws SQLException{return new OrganizationRecord(
                row.getObject("id", UUID.class), row.getLong("revision"), row.getString("display_name"), row.getString("legal_name"),
                OrganizationType.valueOf(row.getString("type")), Country.valueOf(row.getString("country")), row.getString("currency"),
                row.getString("registration_identifier"), row.getString("tax_identifier"), new OrganizationRecord.Address(
                    row.getString("address_line1"), row.getString("address_line2"), row.getString("address_city"),
                    row.getString("address_postal_code"), Country.valueOf(row.getString("address_country")),
                    normalized(row.getBigDecimal("address_latitude")), normalized(row.getBigDecimal("address_longitude"))),
                row.getString("default_language"), row.getString("state"), row.getBoolean("staff_submission_restricted"),
                row.getObject("partner_contact_id", UUID.class), row.getObject("owner_account_id", UUID.class), row.getTimestamp("created_at").toInstant(),
                row.getTimestamp("updated_at").toInstant());}
 private static BigDecimal normalized(BigDecimal value){return value==null?null:value.stripTrailingZeros();}
}
