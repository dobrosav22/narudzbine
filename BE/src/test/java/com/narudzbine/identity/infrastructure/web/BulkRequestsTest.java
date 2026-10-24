package com.narudzbine.identity.infrastructure.web;

import static org.assertj.core.api.Assertions.*;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class BulkRequestsTest {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private static final String ID="01a15013-b677-7d60-ae6f-3b7c6717a37f";
    private static final String TARGET="{\"productId\":\""+ID+"\",\"expectedRevision\":\"product\",\"expectedPricingRevision\":\"price\"}";
    private static BulkRequests.Command parse(String actions){return BulkRequests.parse(JSON.readTree("{\"targets\":["+TARGET+"],"+actions+"}"));}
    @Test void optionalFieldsPreserveOmissionAndExplicitCategoryClear(){var c=parse("\"categoryId\":null,\"price\":null,\"active\":null");assertThat(c.categorySupplied()).isTrue();assertThat(c.category()).isNull();assertThat(c.price()).isNull();assertThat(c.active()).isNull();assertThat(c.add()).isEmpty();}
    @Test void strictBoundsDuplicatesAndUnsupportedFields(){for(String body:java.util.List.of("{\"targets\":[],\"active\":true}","{\"targets\":["+TARGET+","+TARGET+"],\"active\":true}","{\"targets\":["+TARGET+"],\"sku\":\"new\"}","{\"targets\":["+TARGET+"],\"active\":\"true\"}","{\"targets\":["+TARGET+"],\"addTagIds\":null}","{\"targets\":["+TARGET+"]}")){assertThatThrownBy(()->BulkRequests.parse(JSON.readTree(body))).isInstanceOf(AuthHttpFailure.class);}}
    @Test void percentagesRejectUnsupportedPrecisionAndLimits(){for(String value:java.util.List.of("-100","1000.01","1.001","1e2","+1","01")){assertThatThrownBy(()->parse("\"price\":{\"kind\":\"PERCENT_CHANGE\",\"value\":\""+value+"\"}")).isInstanceOf(AuthHttpFailure.class);}assertThat(parse("\"price\":{\"kind\":\"PERCENT_CHANGE\",\"value\":\"1000\"}").price().value()).isEqualByComparingTo("1000");}
    @Test void exactPercentageMathRoundsHalfUpAndRejectsNonpositiveOverflowOrAbsentBase(){assertThat(BulkRequests.adjusted(new BulkRequests.Price("PERCENT_CHANGE",new BigDecimal("0.5")),new BigDecimal("1.00"))).isEqualByComparingTo("1.01");assertThat(BulkRequests.adjusted(new BulkRequests.Price("PERCENT_CHANGE",new BigDecimal("-99.99")),new BigDecimal("100.00"))).isEqualByComparingTo("0.01");assertThatThrownBy(()->BulkRequests.adjusted(new BulkRequests.Price("PERCENT_CHANGE",BigDecimal.ONE),null)).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->BulkRequests.adjusted(new BulkRequests.Price("PERCENT_CHANGE",new BigDecimal("-99.99")),new BigDecimal("0.01"))).isInstanceOf(AuthHttpFailure.class);assertThatThrownBy(()->BulkRequests.adjusted(new BulkRequests.Price("PERCENT_CHANGE",BigDecimal.ONE),new BigDecimal("999999999.99"))).isInstanceOf(AuthHttpFailure.class);}
    @Test void tagsMustBeUniqueAndDisjoint(){for(String actions:java.util.List.of("\"addTagIds\":[\""+ID+"\",\""+ID+"\"]","\"addTagIds\":[\""+ID+"\"],\"removeTagIds\":[\""+ID+"\"]")){assertThatThrownBy(()->parse(actions)).isInstanceOf(AuthHttpFailure.class);}}
    @Test void correctionsUseOrdinaryTierGrammarAndTargetMembership(){var c=parse("\"tierCorrections\":[{\"productId\":\""+ID+"\",\"tiers\":[]}]");assertThat(c.corrections()).containsKey(java.util.UUID.fromString(ID));for(String action:java.util.List.of("\"tierCorrections\":[{\"productId\":\"01a15013-b677-7aca-b445-961c6776aa93\",\"tiers\":[]}]","\"tierCorrections\":[{\"productId\":\""+ID+"\",\"tiers\":[{\"minimumQuantity\":2,\"unitPrice\":\"0\"}]}]")){assertThatThrownBy(()->parse(action)).isInstanceOf(AuthHttpFailure.class);}}
}
