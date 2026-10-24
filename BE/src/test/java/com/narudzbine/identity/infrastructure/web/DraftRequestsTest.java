package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import java.util.*;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
class DraftRequestsTest {
 private static final JsonMapper JSON=JsonMapper.builder().build();
 private static String id(int n){return "019a0000-0000-7000-8000-"+String.format("%012x",n);}
 private ObjectNode body(int lines){var b=JSON.createObjectNode();b.put("id",id(1));var i=b.putObject("intent");i.put("vendorId",id(2));var a=i.putArray("lines");for(int n=0;n<lines;n++){a.addObject().put("productId",id(n+3)).put("quantity",1000000000);}for(String f:List.of("deliveryLocationId","contactOverride","instructionsOverride","note","replacementForOrderId")){i.putNull(f);}i.put("instructionsMode","INHERIT");return b;}
 private DraftRequests.Command parse(String text)throws Exception{var r=new MockHttpServletRequest("POST","/api/v1/drafts");r.setContentType("application/json");r.setContent(text.getBytes(StandardCharsets.UTF_8));return DraftRequests.input(r,true);}
 @Test void acceptsFiveHundredLinesAndLongUnicodeWithoutUsingSmallAuthLimit()throws Exception{var b=body(500);b.path("intent").asObject().put("note","\uD83D\uDE00".repeat(2000));var result=parse(b.toString());assertThat(result.intent().lines()).hasSize(500);assertThat(result.intent().lines().getFirst().quantity()).isEqualTo(1000000000);assertThat(result.intent().note().codePointCount(0,result.intent().note().length())).isEqualTo(2000);}
 @Test void rejectsFiveHundredAndOneLinesAndBodiesOverBound(){assertThatThrownBy(()->parse(body(501).toString())).isInstanceOfSatisfying(AuthHttpFailure.class,e->assertThat(e.status).isEqualTo(422));assertThatThrownBy(()->parse("{}"+" ".repeat(131072))).isInstanceOfSatisfying(AuthHttpFailure.class,e->assertThat(e.status).isEqualTo(413));}
 @Test void normalizedCreateDigestPreservesLineOrderAndNullMeaning()throws Exception{byte[] key=new byte[32];var first=body(2);first.path("intent").asObject().put("note","  Cafe\u0301  ");var second=body(2);second.path("intent").asObject().put("note","Caf\u00e9");assertThat(DraftRequests.digest(parse(first.toString()).intent(),key)).isEqualTo(DraftRequests.digest(parse(second.toString()).intent(),key));var a=second.path("intent").path("lines").asArray();var old=a.get(0);a.set(0,a.get(1));a.set(1,old);assertThat(DraftRequests.digest(parse(first.toString()).intent(),key)).isNotEqualTo(DraftRequests.digest(parse(second.toString()).intent(),key));}
}
