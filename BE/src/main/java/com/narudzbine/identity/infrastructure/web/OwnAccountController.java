package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.api.SessionTransport;
import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.OwnAccountService;
import com.narudzbine.identity.application.SessionService;
import com.narudzbine.identity.application.SupportedLocales;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
@ConditionalOnProperty(name = "identity.http.enabled", havingValue = "true")
public final class OwnAccountController {
    private final SessionService sessions;
    private final OwnAccountService accounts;
    private final SessionTransportPolicy policy;
    private final AccountResponses responses;
    private final SupportedLocales locales;
    private final LoginThrottle throttle;
    private final TransactionTemplate transaction;

    OwnAccountController(SessionService sessions, OwnAccountService accounts, SessionTransportPolicy policy,
            AccountResponses responses, SupportedLocales locales, LoginThrottle throttle, PlatformTransactionManager manager) {
        this.sessions = sessions; this.accounts = accounts; this.policy = policy;
        this.responses = responses; this.locales = locales; this.throttle = throttle;
        transaction = new TransactionTemplate(manager); transaction.setTimeout(10);
    }

    @GetMapping
    AccountResponses.Account get(HttpServletRequest request) {
        AuthController.noQuery(request); AuthController.noBody(request);
        var selected = policy.select(request);
        admit(selected, false);
        return transaction.execute(status -> responses.account(
                sessions.authenticate(selected.secret(), selected.transport()).accountId()));
    }

    @PatchMapping("/language")
    AccountResponses.Account language(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);
        var selected = policy.select(request);
        String csrf = selected.transport() == SessionTransport.BROWSER ? AuthController.csrfHeader(request) : null;
        var input = AuthRequests.language(request, locales);
        admit(selected, true);
        return transaction.execute(status -> responses.account(accounts.updateLanguage(selected.secret(), selected.transport(),
                csrf, input.expectedRevision(), input.supplied(), input.languageOverride())));
    }

    @PutMapping
    AccountResponses.Account profile(HttpServletRequest request) throws IOException {
        AuthController.noQuery(request);
        var selected = policy.select(request);
        String csrf = selected.transport() == SessionTransport.BROWSER ? AuthController.csrfHeader(request) : null;
        var input = AuthRequests.profile(request);
        admit(selected,true);
        return transaction.execute(status -> responses.account(accounts.updateProfile(selected.secret(),selected.transport(),
                csrf,input.expectedRevision(),input.displayName(),input.homeLocationId())));
    }

    private void admit(SessionTransportPolicy.Selected selected, boolean write) {
        UUID account = transaction.execute(status -> sessions.authenticate(selected.secret(), selected.transport()).accountId());
        throttle.admitApi(account, write);
    }
}
