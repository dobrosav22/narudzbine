package com.narudzbine.identity.application;

import com.narudzbine.identity.api.BusinessCapability;
import com.narudzbine.organizations.api.BusinessRole;
import com.narudzbine.organizations.api.LockedMembership;
import com.narudzbine.organizations.api.OrganizationType;

final class BusinessPermissions {
    private BusinessPermissions() {
    }

    static boolean allows(LockedMembership membership, BusinessCapability capability) {
        boolean owner = membership.role() == BusinessRole.OWNER;
        boolean manager = membership.role() != BusinessRole.STAFF;
        boolean buyer = membership.type() == OrganizationType.BUYER;
        return switch (capability) {
            case READ_OWN_ORGANIZATION, SEND_ORDER_MESSAGE -> true;
            case EDIT_CATALOGUE, EDIT_PRICES, EDIT_PROMOTIONS, EDIT_STOCK, FULFILL_VENDOR_ORDER -> !buyer;
            case PREPARE_BUYER_ORDER -> buyer;
            case SUBMIT_OR_CANCEL_BUYER_ORDER -> buyer && (manager || !membership.staffSubmissionRestricted());
            case READ_ORGANIZATION_AUDIT, MANAGE_ORGANIZATION_SETTINGS, MANAGE_LOCATIONS_AND_CONTACTS, MANAGE_STAFF, DISCONNECT_TRADING_PARTNER -> manager;
            case MANAGE_ADMIN_ROLES, INITIATE_OWNERSHIP_TRANSFER, CLOSE_ORGANIZATION -> owner;
            case MANAGE_ORDER_STAGES, REQUEST_VENDOR_PLAN_CHANGE -> !buyer && manager;
        };
    }
}
