package com.narudzbine.identity.infrastructure.web;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.narudzbine.identity.application.LoginThrottle;
import com.narudzbine.identity.application.PasswordLoginService;
import com.narudzbine.identity.application.PreAuthService;
import com.narudzbine.identity.application.SessionService;
import java.time.Clock;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;

class AuthHttpValidationTest {
    @Test
    void mediaTypeAndIndependentFieldErrorsFailBeforeCredentialOrNonceConsumption() throws Exception {
        var login = mock(PasswordLoginService.class);
        var nonce = mock(PreAuthService.class);
        var controller = new AuthController(login, mock(SessionService.class), nonce,
                new SessionTransportPolicy(Set.of("https://app.example")), mock(AccountResponses.class),
                mock(PlatformTransactionManager.class), Clock.systemUTC(), mock(LoginThrottle.class));
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new AuthErrors(new org.springframework.beans.factory.support.DefaultListableBeanFactory().getBeanProvider(com.narudzbine.shared.api.ResourceRevisions.class))).build();
        mvc.perform(post("/api/v1/auth/login").contentType("text/plain").content("sensitive input"))
                .andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
        mvc.perform(post("/api/v1/auth/login").contentType("application/json").content("{\"email\":null}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.errors.length()").value(4))
                .andExpect(jsonPath("$.errors[0].path").value("/deviceLabel"))
                .andExpect(jsonPath("$.errors[0].location").value("BODY"));
        mvc.perform(post("/api/v1/auth/login").contentType("application/json").content("{\"secretUnknownField\":1}"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.errors[0].path").value(""));
        verifyNoInteractions(login, nonce);
    }

    @Test
    void insecureOriginsAndMissingSigningKeyAreRejected() {
        assertThatThrownBy(() -> new SessionTransportPolicy(Set.of("http://app.example")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new com.narudzbine.identity.application.AccountRevisions(new byte[0]))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
