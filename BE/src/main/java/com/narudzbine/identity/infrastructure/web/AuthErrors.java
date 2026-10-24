package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.*;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import java.util.Locale;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = {AuthController.class, PrivacyController.class, ScopedRedactionsController.class, CaseDispositionsController.class, RedactionPreviewController.class, PortableExportsController.class, PrivateCaseReviewController.class, RetentionHoldsController.class, LocaleController.class, SelfDeactivationController.class, OwnAccountController.class, OrganizationController.class, LocationController.class, ContactController.class, MemberController.class, OwnershipController.class, PasswordController.class, EmailChangeController.class, ExternalController.class, RecoveryController.class, SetupController.class,TradingController.class,PlanController.class,TaxonomyController.class,ProductController.class,PricingController.class,AgreedPriceController.class,PromotionController.class,InventoryController.class,BuyerOffersController.class,FavoritesController.class,ReportsController.class,ExportsController.class,AuditController.class,SupportController.class,AdministrativeDirectoryController.class,OrganizationClosureController.class,MostOrderedController.class,DraftsController.class,OrderReviewsController.class,CsvImportController.class,BulkController.class,MediaController.class,ImageContentController.class,InboxController.class,DevicesController.class,OrdersController.class,OrderStagesController.class,ReorderController.class})
public final class AuthErrors {
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(AuthErrors.class);
    private final com.narudzbine.shared.api.ResourceRevisions revisions;
    public AuthErrors(org.springframework.beans.factory.ObjectProvider<com.narudzbine.shared.api.ResourceRevisions> revisions) { this.revisions = revisions.getIfAvailable(); }

    @ExceptionHandler(com.narudzbine.audit.api.PrivacyFailure.class)
    ResponseEntity<?> privacy(com.narudzbine.audit.api.PrivacyFailure failure,HttpServletResponse response){
        int status=switch(failure.code()){case "NOT_FOUND"->404;case "SERVICE_UNAVAILABLE"->503;default->409;};
        var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+failure.code().toLowerCase(Locale.ROOT));body.put("title","Privacy request could not be completed");body.put("status",status);body.put("code",failure.code());body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",List.of());if(failure.resource()!=null)body.put("resourceId",failure.resource());return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }

    @ExceptionHandler(com.narudzbine.organizations.api.OrganizationAdministrationFailure.class)
    ResponseEntity<Problem> administrative(com.narudzbine.organizations.api.OrganizationAdministrationFailure f,HttpServletResponse response){return error(f.code().equals("COUNTRY_IMMUTABLE")?new AuthHttpFailure(422,"VALIDATION_FAILED","/registeredAddress/country"):new AuthHttpFailure(f.code().equals("NOT_FOUND")?404:409,f.code()),response);}

    @ExceptionHandler(com.narudzbine.reporting.api.ExportFailure.class)
    ResponseEntity<?> export(com.narudzbine.reporting.api.ExportFailure f,HttpServletResponse response){
        int status=f.code().equals("NOT_FOUND")?404:f.code().equals("SERVICE_UNAVAILABLE")?503:409;
        var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+f.code().toLowerCase(Locale.ROOT));body.put("title","Export request could not be completed");body.put("status",status);body.put("code",f.code());body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",List.of());if(f.resource()!=null)body.put("resourceId",f.resource());return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }

    @ExceptionHandler(com.narudzbine.identity.application.DeviceService.Failure.class)
    ResponseEntity<?> device(com.narudzbine.identity.application.DeviceService.Failure failure,HttpServletResponse response){
        int status=switch(failure.code()){case "NOT_FOUND"->404;case "DEVICE_CONFLICT","DEVICE_LIMIT_REACHED","DEVICE_VERIFICATION_INVALID"->409;default->503;};
        var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+failure.code().toLowerCase(Locale.ROOT));body.put("title","Device request could not be completed");body.put("status",status);body.put("code",failure.code());body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",List.of());return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }
    @ExceptionHandler(com.narudzbine.notifications.api.InboxFailure.class)
    ResponseEntity<?> inbox(com.narudzbine.notifications.api.InboxFailure failure,HttpServletResponse response){
        int status=switch(failure.code()){case "NOT_FOUND"->404;case "REVISION_CONFLICT"->409;default->503;};
        var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+failure.code().toLowerCase(Locale.ROOT));body.put("title","Inbox request could not be completed");body.put("status",status);body.put("code",failure.code());body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",List.of());return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }
    @ExceptionHandler(com.narudzbine.media.api.MediaFailure.class)
    ResponseEntity<?> media(com.narudzbine.media.api.MediaFailure failure,HttpServletResponse response){
        int status=switch(failure.code()){case "NOT_FOUND"->404;case "IDEMPOTENCY_MISMATCH","UPLOAD_IN_PROGRESS","INVALID_STATE"->409;default->503;};
        var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+failure.code().toLowerCase(Locale.ROOT));body.put("title","Media request could not be completed");body.put("status",status);body.put("code",failure.code());body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",List.of());return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }
    @ExceptionHandler(com.narudzbine.organizations.api.LocationFailure.class)
    ResponseEntity<java.util.Map<String,Object>> location(com.narudzbine.organizations.api.LocationFailure failure, HttpServletResponse response) {
        String code = switch (failure.reason()) {
            case NOT_FOUND -> "NOT_FOUND";
            case DUPLICATE_NAME -> "DUPLICATE_NAME";
            case CREATE_CONFLICT -> "IDEMPOTENCY_MISMATCH";
            case REPLAY_EXPIRED -> "REPLAY_EXPIRED";
            case REVISION_CONFLICT -> "REVISION_CONFLICT";
        };
        int status = failure.reason() == com.narudzbine.organizations.api.LocationFailure.Reason.NOT_FOUND ? 404 : 409;
        var body = new java.util.LinkedHashMap<String,Object>();
        body.put("type", "urn:narudzbine:problem:" + code.toLowerCase(Locale.ROOT));
        body.put("title", "Location request could not be completed"); body.put("status",status); body.put("code",code);
        body.put("requestId",response.getHeader("X-Request-Id")); body.put("errors",List.of());
        if (failure.revision() != null) { body.put("currentRevision",revisions.encode("location/v1",failure.resourceId(),failure.revision())); }
        if (failure.reason() == com.narudzbine.organizations.api.LocationFailure.Reason.REPLAY_EXPIRED) { body.put("resourceId",failure.resourceId()); }
        return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }

    @ExceptionHandler(com.narudzbine.organizations.api.ContactFailure.class)
    ResponseEntity<java.util.Map<String,Object>> contact(com.narudzbine.organizations.api.ContactFailure failure, HttpServletResponse response) {
        String code = switch (failure.reason()) {
            case NOT_FOUND -> "NOT_FOUND";
            case CREATE_CONFLICT -> "IDEMPOTENCY_MISMATCH";
            case REPLAY_EXPIRED -> "REPLAY_EXPIRED";
            case REVISION_CONFLICT -> "REVISION_CONFLICT";
        };
        int status = failure.reason() == com.narudzbine.organizations.api.ContactFailure.Reason.NOT_FOUND ? 404 : 409;
        var body = new java.util.LinkedHashMap<String,Object>();
        body.put("type", "urn:narudzbine:problem:" + code.toLowerCase(Locale.ROOT));
        body.put("title", "Contact request could not be completed"); body.put("status",status); body.put("code",code);
        body.put("requestId",response.getHeader("X-Request-Id")); body.put("errors",List.of());
        if (failure.revision() != null) { body.put("currentRevision",revisions.encode("contact/v1",failure.resourceId(),failure.revision())); }
        if (failure.reason() == com.narudzbine.organizations.api.ContactFailure.Reason.REPLAY_EXPIRED) { body.put("resourceId",failure.resourceId()); }
        return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }

    @ExceptionHandler(com.narudzbine.catalogue.api.TaxonomyFailure.class)
    ResponseEntity<?> taxonomy(com.narudzbine.catalogue.api.TaxonomyFailure failure,HttpServletResponse response){
        String code=failure.reason().name();int status=failure.reason()==com.narudzbine.catalogue.api.TaxonomyFailure.Reason.NOT_FOUND?404:409;
        var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT));body.put("title","Catalogue request could not be completed");body.put("status",status);body.put("code",code);body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",List.of());
        if(failure.resourceId()!=null){body.put("resourceId",failure.resourceId());}return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }

    @ExceptionHandler(com.narudzbine.catalogue.api.ProductFailure.class)
    ResponseEntity<?> product(com.narudzbine.catalogue.api.ProductFailure failure,HttpServletResponse response){
        String code=failure.reason().name();int status=failure.reason()==com.narudzbine.catalogue.api.ProductFailure.Reason.NOT_FOUND?404:409;
        var fields=List.<FieldError>of();if(failure.reason()==com.narudzbine.catalogue.api.ProductFailure.Reason.INVALID_REFERENCE){status=422;code="VALIDATION_FAILED";fields=List.of(new FieldError(failure.field(),"INVALID_VALUE"));}
        var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT));body.put("title","Product request could not be completed");body.put("status",status);body.put("code",code);body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",fields);if(failure.resourceId()!=null){body.put("resourceId",failure.resourceId());}return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }

    @ExceptionHandler(com.narudzbine.pricing.api.PricingFailure.class)
    ResponseEntity<?> pricing(com.narudzbine.pricing.api.PricingFailure failure,HttpServletResponse response){
        String code=failure.reason().name();int status=409;var fields=List.<FieldError>of();
        if(failure.reason()==com.narudzbine.pricing.api.PricingFailure.Reason.INVALID_SCHEDULE||failure.reason()==com.narudzbine.pricing.api.PricingFailure.Reason.INVALID_QUANTITY){status=422;code="VALIDATION_FAILED";fields=failure.fields().stream().map(f->new FieldError(f,"INVALID_VALUE")).toList();}
        var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT));body.put("title","Pricing request could not be completed");body.put("status",status);body.put("code",code);body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",fields);
        if(failure.revision()!=null){body.put("currentRevision",revisions.encode("pricing/v1",failure.product(),failure.revision()));}return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }

    @ExceptionHandler(com.narudzbine.pricing.api.AgreedPriceFailure.class)
    ResponseEntity<?> agreedPrice(com.narudzbine.pricing.api.AgreedPriceFailure failure,HttpServletResponse response){String code=failure.reason().name();int status=switch(failure.reason()){case NOT_FOUND->404;case INVALID_SELECTION,INVALID_PRICE->422;default->409;};if(status==422){code="VALIDATION_FAILED";}return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(java.util.Map.of("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT),"title","Agreed price request could not be completed","status",status,"code",code,"requestId",response.getHeader("X-Request-Id"),"errors",status==422?List.of(new FieldError(failure.reason()==com.narudzbine.pricing.api.AgreedPriceFailure.Reason.INVALID_PRICE?"/unitPrice":"/productIds","INVALID_VALUE")):List.of()));}

    @ExceptionHandler(com.narudzbine.pricing.api.PromotionFailure.class)
    ResponseEntity<?> promotion(com.narudzbine.pricing.api.PromotionFailure failure,HttpServletResponse response){String code=failure.reason().name();int status=switch(failure.reason()){case NOT_FOUND->404;case INVALID_VALUE,INVALID_REFERENCE->422;default->409;};if(status==422){code="VALIDATION_FAILED";}var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT));body.put("title","Promotion request could not be completed");body.put("status",status);body.put("code",code);body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",status==422?List.of(new FieldError(failure.field(),"INVALID_VALUE")):List.of());if(failure.reason()==com.narudzbine.pricing.api.PromotionFailure.Reason.REPLAY_EXPIRED){body.put("resourceId",failure.resource());}return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);}

    @ExceptionHandler(com.narudzbine.inventory.api.InventoryFailure.class)
    ResponseEntity<?> inventory(com.narudzbine.inventory.api.InventoryFailure f,HttpServletResponse response){int status=f.reason()==com.narudzbine.inventory.api.InventoryFailure.Reason.NOT_FOUND?404:f.reason()==com.narudzbine.inventory.api.InventoryFailure.Reason.INVALID_COUNT?422:409;String code=status==422?"VALIDATION_FAILED":f.reason().name();return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(java.util.Map.of("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT),"title","Inventory request could not be completed","status",status,"code",code,"requestId",response.getHeader("X-Request-Id"),"errors",status==422?List.of(new FieldError(f.field(),"INVALID_VALUE")):List.of()));}

    @ExceptionHandler(com.narudzbine.buyerworkspace.api.DraftFailure.class)
    ResponseEntity<?> draft(com.narudzbine.buyerworkspace.api.DraftFailure failure,HttpServletResponse response){
        String code=failure.reason().name();int status=failure.reason()==com.narudzbine.buyerworkspace.api.DraftFailure.Reason.NOT_FOUND?404:409;var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+code.toLowerCase(java.util.Locale.ROOT));body.put("title","Draft operation could not be completed");body.put("status",status);body.put("code",code);body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",java.util.List.of());if(failure.resourceId()!=null){body.put("resourceId",failure.resourceId());}return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);
    }

    @ExceptionHandler(com.narudzbine.ordering.api.ReviewFailure.class)
    ResponseEntity<?> review(com.narudzbine.ordering.api.ReviewFailure failure,HttpServletResponse response){
        var reason=failure.reason();int status=switch(reason){case NOT_FOUND->404;case VALIDATION_FAILED->422;default->409;};var fields=failure.field()==null?java.util.List.<FieldError>of():java.util.List.of(new FieldError(failure.field(),reason==com.narudzbine.ordering.api.ReviewFailure.Reason.VALIDATION_FAILED?"INVALID_VALUE":reason.name()));return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(java.util.Map.of("type","urn:narudzbine:problem:"+reason.name().toLowerCase(java.util.Locale.ROOT),"title","Order review could not be completed","status",status,"code",reason.name(),"requestId",response.getHeader("X-Request-Id"),"errors",fields));
    }

    @ExceptionHandler(com.narudzbine.catalogue.api.ImportFailure.class)
    ResponseEntity<?> csv(com.narudzbine.catalogue.api.ImportFailure f){int status=f.code().equals("NOT_FOUND")?404:409;var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+f.code().toLowerCase(Locale.ROOT));body.put("title","Import could not be completed");body.put("status",status);body.put("code",f.code());body.put("requestId",org.slf4j.MDC.get("requestId"));body.put("errors",List.of());body.put("importErrors",f.errors());return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);}
    @ExceptionHandler(com.narudzbine.ordering.api.OrderFailure.class)
    ResponseEntity<?> order(com.narudzbine.ordering.api.OrderFailure f,HttpServletResponse response){boolean location=f.reason()==com.narudzbine.ordering.api.OrderFailure.Reason.INVALID_LOCATION;String code=location?"VALIDATION_FAILED":f.reason().name();int status=location?422:f.reason()==com.narudzbine.ordering.api.OrderFailure.Reason.NOT_FOUND?404:409;var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT));body.put("title","Order operation could not be completed");body.put("status",status);body.put("code",code);body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",location?List.of(new FieldError("BODY","/fulfillmentLocationId","INVALID_VALUE")):List.of());if(f.resource()!=null){body.put("resourceId",f.resource());}return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);}

    @ExceptionHandler(com.narudzbine.ordering.api.StageFailure.class)
    ResponseEntity<?> stage(com.narudzbine.ordering.api.StageFailure f,HttpServletResponse response){int status=f.reason()==com.narudzbine.ordering.api.StageFailure.Reason.NOT_FOUND?404:f.reason()==com.narudzbine.ordering.api.StageFailure.Reason.RESERVED_NAME?422:409;String code=status==422?"VALIDATION_FAILED":f.reason().name();var body=new java.util.LinkedHashMap<String,Object>();body.put("type","urn:narudzbine:problem:"+code.toLowerCase(Locale.ROOT));body.put("title","Stage request could not be completed");body.put("status",status);body.put("code",code);body.put("requestId",response.getHeader("X-Request-Id"));body.put("errors",status==422?List.of(new FieldError("/name","INVALID_VALUE")):List.of());if(f.reason()==com.narudzbine.ordering.api.StageFailure.Reason.REPLAY_EXPIRED){body.put("resourceId",f.resource());}if(f.reason()==com.narudzbine.ordering.api.StageFailure.Reason.REVISION_CONFLICT){body.put("currentRevision",revisions.encode(f.domain(),f.resource(),f.revision()));}return ResponseEntity.status(status).header("Content-Type","application/problem+json").body(body);}

    @ExceptionHandler(RevisionConflict.class)
    ResponseEntity<java.util.Map<String,Object>> revision(RevisionConflict failure,HttpServletResponse response) {
        return ResponseEntity.status(409).header("Content-Type","application/problem+json").body(java.util.Map.of(
                "type","urn:narudzbine:problem:revision_conflict","title","Resource revision is not current", "status",409,
                "code","REVISION_CONFLICT","requestId",response.getHeader("X-Request-Id"),"errors",List.of(),"currentRevision",failure.currentRevision()));
    }

    @ExceptionHandler(RecoveryFailure.class)
    ResponseEntity<?> recovery(RecoveryFailure failure,HttpServletResponse response) {
        if(failure.resourceId()==null) {return error(failure,response);}
        return ResponseEntity.status(409).header("Content-Type","application/problem+json").body(java.util.Map.of(
                "type","urn:narudzbine:problem:replay_expired","title","Creation replay expired","status",409,"code","REPLAY_EXPIRED",
                "requestId",response.getHeader("X-Request-Id"),"errors",List.of(),"resourceId",failure.resourceId()));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<Problem> error(Exception exception, HttpServletResponse response) {
        int status = 503;
        String code = "SERVICE_UNAVAILABLE";
        List<FieldError> fields = List.of();
        if (exception instanceof AuthHttpFailure failure) {
            status = failure.status; code = failure.code;
            fields = failure.fields;
        } else if (exception instanceof com.narudzbine.organizations.api.InvalidPartnerContact) {
            status=422;code="VALIDATION_FAILED";fields=List.of(new FieldError("/partnerContactId","INVALID_VALUE"));
        } else if (exception instanceof com.narudzbine.subscriptions.api.PlanFailure failure) {
            status=failure.reason()==com.narudzbine.subscriptions.api.PlanFailure.Reason.NOT_FOUND?404:409;code=failure.reason().name();
        } else if (exception instanceof com.narudzbine.trading.api.TradingFailure failure) {
            status=failure.reason()==com.narudzbine.trading.api.TradingFailure.Reason.NOT_FOUND?404:409;code=failure.reason().name();
        } else if (exception instanceof SetupFailure failure) {
            status=switch(failure.reason()){case NOT_FOUND->404;case FORBIDDEN->403;case PASSWORD_REJECTED->422;case DEPENDENCY_UNAVAILABLE->503;default->409;};code=failure.reason().name();
        } else if (exception instanceof RecoveryFailure failure) {
            status=switch(failure.reason()){case NOT_FOUND->404;case FORBIDDEN,REAUTHENTICATION_REQUIRED->403;case DEPENDENCY_UNAVAILABLE->503;default->409;};code=failure.reason().name();
        } else if (exception instanceof ExternalFailure failure) {
            status=switch(failure.reason()) { case NOT_FOUND -> 404;case REAUTHENTICATION_REQUIRED,RETAINED_METHOD_REQUIRED -> 403;case DEPENDENCY_UNAVAILABLE -> 503;case TOKEN_INVALID -> 401;default -> 409; };
            code=failure.reason().name();
        } else if (exception instanceof EmailChangeFailure failure) {
            status=switch(failure.reason()) { case NOT_FOUND -> 404; case REAUTHENTICATION_REQUIRED -> 403; case DEPENDENCY_UNAVAILABLE -> 503; default -> 409; };
            code=failure.reason().name();
        } else if (exception instanceof PasswordFailure failure) {
            status=switch(failure.reason()) {
                case TOKEN_INVALID -> 409;
                case REAUTHENTICATION_REQUIRED -> 403;
                case REQUEST_IN_PROGRESS -> 409;
                case PASSWORD_REJECTED -> 422;
                case DEPENDENCY_UNAVAILABLE -> 503;
            };
            code=failure.reason().name();
            if(failure.reason()==PasswordFailure.Reason.PASSWORD_REJECTED) { fields=List.of(new FieldError("/newPassword","PASSWORD_REJECTED")); }
        } else if (exception instanceof SessionTransportPolicy.AmbiguousTransport) {
            status = 400; code = "AMBIGUOUS_AUTH_TRANSPORT";
        } else if (exception instanceof TransferFailure failure) {
            status=switch(failure.reason()) { case NOT_FOUND -> 404; case FORBIDDEN, REAUTHENTICATION_REQUIRED -> 403; default -> 409; };
            code=failure.reason().name();
        } else if (exception instanceof MemberFailure failure) {
            status=switch(failure.reason()) { case NOT_FOUND -> 404; case FORBIDDEN -> 403; case INVALID_STATE, REQUEST_IN_PROGRESS -> 409; };
            code=failure.reason().name();
        } else if (exception instanceof InvalidCsrf) { status = 403; code = "CSRF_REJECTED";
        } else if (exception instanceof BusinessAccessDenied denied) {
            status = denied.reason() == BusinessAccessDenied.Reason.INACCESSIBLE_SCOPE ? 404 : 403;
            code = status == 404 ? "NOT_FOUND" : "FORBIDDEN";
        } else if (exception instanceof InvalidProfileLocation invalid) {
            status = invalid.reason() == InvalidProfileLocation.Reason.ARCHIVED ? 409 : 422;
            code = status == 409 ? "INVALID_STATE" : "VALIDATION_FAILED";
            fields = List.of(new FieldError("/homeLocationId",status == 409 ? "INVALID_STATE" : "INVALID_VALUE"));
        } else if (exception instanceof InvalidSession) { status = 401; code = "INVALID_SESSION";
        } else if (exception instanceof InvalidLogin) { status = 401; code = "INVALID_LOGIN";
        } else if (exception instanceof InaccessibleSession) { status = 404; code = "NOT_FOUND";
        } else if (exception instanceof LoginThrottled throttled) {
            status = 429; code = "RATE_LIMITED";
            response.setHeader("Retry-After", Long.toString(throttled.retryAfterSeconds()));
        } else if (exception instanceof IllegalArgumentException) {
            status = 422; code = "VALIDATION_FAILED"; fields = List.of(new FieldError("", "INVALID_VALUE"));
        }
        if(status==503){
            String state="UNKNOWN",kind=exception.getClass().getSimpleName();Throwable cause=exception;
            for(int depth=0;cause!=null&&depth<16;depth++,cause=cause.getCause()){
                kind=cause.getClass().getSimpleName();
                if(cause instanceof java.sql.SQLException sql){String candidate=sql.getSQLState();if(candidate!=null&&candidate.matches("[0-9A-Z]{5}")){state=candidate;}break;}
            }
            LOG.warn("Backend request unavailable; failureType={} sqlState={}",kind,state);
        }
        return ResponseEntity.status(status).header("Content-Type", "application/problem+json")
                .body(new Problem("urn:narudzbine:problem:" + code.toLowerCase(Locale.ROOT),
                        "Authentication request could not be completed", status, code, response.getHeader("X-Request-Id"), fields));
    }

    record FieldError(String location, String path, String code) {
        FieldError(String path, String code) { this("BODY", path, code); }
    }
    record Problem(String type, String title, int status, String code, String requestId, List<FieldError> errors) { }
}
