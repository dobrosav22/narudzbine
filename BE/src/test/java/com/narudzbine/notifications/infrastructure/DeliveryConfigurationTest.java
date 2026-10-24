package com.narudzbine.notifications.infrastructure;

import static org.assertj.core.api.Assertions.*;
import java.time.Clock;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

class DeliveryConfigurationTest {
    private final ApplicationContextRunner runner=new ApplicationContextRunner().withUserConfiguration(DeliveryConfiguration.class).withBean(Clock.class,Clock::systemUTC);
    @Test void providerAndWorkerDefaultsAreOff(){runner.run(c->{assertThat(c).hasNotFailed();assertThat(c).doesNotHaveBean(ExternalDeliveryEngine.class).doesNotHaveBean(EmailCallbacks.class).doesNotHaveBean(com.narudzbine.notifications.api.ProviderDelivery.Push.class).doesNotHaveBean(com.narudzbine.notifications.api.ProviderDelivery.Email.class);});}
    @Test void resendCannotActivateWithoutRecordedConformance(){runner.withPropertyValues("notifications.providers.resend.enabled=true","notifications.providers.resend.api-key=synthetic_test_key").run(c->{assertThat(c).hasFailed();assertThat(c.getStartupFailure()).hasStackTraceContaining("Recorded Resend conformance required");});}
    @Test void fcmCannotActivateWithoutRecordedProjectAppConformance(){runner.withPropertyValues("notifications.providers.fcm.enabled=true","notifications.devices.environment=synthetic","notifications.devices.project-id=synthetic-project","notifications.providers.fcm.client-email=sender@synthetic.iam.gserviceaccount.com","notifications.providers.fcm.private-key-id=synthetic","notifications.providers.fcm.private-key-pem=synthetic").run(c->{assertThat(c).hasFailed();assertThat(c.getStartupFailure()).hasStackTraceContaining("Recorded FCM/app/environment conformance required");});}
}
