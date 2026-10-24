package com.narudzbine.identity.infrastructure.web;

import com.narudzbine.identity.application.SupportedLocales;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(name="identity.http.enabled",havingValue="true")
public final class LocaleController {
    private final SupportedLocales locales;
    LocaleController(SupportedLocales locales) { this.locales=locales; }
    @GetMapping("/api/v1/locales")
    List<String> list(HttpServletRequest request) {
        AuthController.noQuery(request);AuthController.noBody(request);
        return locales.roster();
    }
}
