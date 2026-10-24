package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
class ReviewRequestsTest {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private static String id(int n){return "019a0000-0000-7000-8000-"+String.format("%012x",n);}
 private ObjectNode body(int count){var b=JSON.createObjectNode();b.putNull("draftId");b.putNull("draftRevision");var i=b.putObject("intent");i.put("vendorId",id(1));i.put("deliveryLocationId",id(2));var lines=i.putArray("lines");for(int n=0;n<count;n++){lines.addObject().put("productId",id(n+3)).put("quantity",1);}for(String f:java.util.List.of("contactOverride","instructionsOverride","note","replacementForOrderId")){i.putNull(f);}i.put("instructionsMode","INHERIT");return b;}
 private ReviewRequests.Input parse(ObjectNode body)throws Exception{var r=new MockHttpServletRequest("POST","/api/v1/order-reviews");r.setContentType("application/json");r.setContent(body.toString().getBytes(StandardCharsets.UTF_8));return ReviewRequests.input(r);}
 @Test void completeIntentAcceptsFiveHundredLinesAndUnicodeWithinBound()throws Exception{var b=body(500);b.path("intent").asObject().put("note","\uD83D\uDE00".repeat(2000));assertThat(parse(b).intent().lines()).hasSize(500);assertThat(parse(b).draftId()).isNull();}
 @Test void rejectsIncompleteAndUnpairedDraftInputs(){var empty=body(0);assertThatThrownBy(()->parse(empty)).isInstanceOf(AuthHttpFailure.class);var missing=body(1);missing.path("intent").asObject().putNull("deliveryLocationId");assertThatThrownBy(()->parse(missing)).isInstanceOf(AuthHttpFailure.class);var paired=body(1);paired.put("draftId",id(99));assertThatThrownBy(()->parse(paired)).isInstanceOf(AuthHttpFailure.class);paired.put("draftRevision","x".repeat(257));assertThatThrownBy(()->parse(paired)).isInstanceOf(AuthHttpFailure.class);}
 @Test void preservesNormalizedIntentAndDraftBinding()throws Exception{var b=body(1);b.put("draftId",id(99));b.put("draftRevision","current-token");b.path("intent").asObject().put("note","  Cafe\u0301  ");var input=parse(b);assertThat(input.intent().note()).isEqualTo("Caf\u00e9");assertThat(input.draftId().toString()).isEqualTo(id(99));assertThat(input.draftRevision()).isEqualTo("current-token");}
}
