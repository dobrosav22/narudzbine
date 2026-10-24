package com.narudzbine.notifications.infrastructure;
import static org.assertj.core.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class InboxTextTest {
 @Test void organizationNamesRemainLiteralTemplateArguments(){assertThat(InboxText.render("en","ORDER_SUBMITTED","Literal {1}","2026-1")).isEqualTo("New order 2026-1 for Literal {1}.");}
 @Test void allEventsHaveCanonicalLocalizedPlainResourcesAndEnglishFallback(){
  var events=List.of("ORDER_SUBMITTED","ORDER_STATUS_CHANGED","CANCELLATION_REQUESTED","CANCELLATION_RESOLVED","MESSAGE_CREATED","RELATIONSHIP_DISCONNECTED","PASSWORD_CHANGED","EMAIL_CHANGE_STARTED","EMAIL_CHANGED","RECOVERY_COMPLETED","OWNER_CHANGED");for(String locale:List.of("en","sr-Latn-RS","bs-Latn-BA")){for(String event:events){assertThat(InboxText.render(locale,event,"Synthetic","2026-1")).isNotBlank().doesNotContain("{0}","{1}");}}assertThat(InboxText.render("unknown","PASSWORD_CHANGED","Synthetic","")).isEqualTo(InboxText.render("en","PASSWORD_CHANGED","Synthetic",""));assertThatThrownBy(()->InboxText.render("en","UNKNOWN","Synthetic","")).isInstanceOf(IllegalStateException.class);
 }
}
