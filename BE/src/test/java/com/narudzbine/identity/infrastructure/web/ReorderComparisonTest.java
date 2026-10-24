package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import com.narudzbine.catalogue.api.VendorProducts;
import com.narudzbine.ordering.api.OrderReviews;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.Test;
class ReorderComparisonTest {
 private VendorProducts.Values current(int minimum,int step){return new VendorProducts.Values("SKU","Name",null,UUID.randomUUID(),null,null,List.of(),minimum,step);}
 private OrderReviews.Line original(int quantity){var price=new OrderReviews.Price(new BigDecimal("10.00"),new BigDecimal("10.00"),null,null,new BigDecimal("10.00"),new BigDecimal("10.00").multiply(BigDecimal.valueOf(quantity)),null,null,null);return new OrderReviews.Line(UUID.randomUUID(),"SKU","Name","bag",null,quantity,price);}
 @Test void unchangedAndEquivalentDecimalScaleNeedNoChanges(){var old=original(2);var r=ReorderComparison.compare(old,current(1,1),"bag",new BigDecimal("10.0"),true);assertThat(r.available()).isTrue();assertThat(r.changes()).isEmpty();assertThat(ReorderComparison.pricedQuantity(old,current(1,1))).isEqualTo(2);}
 @Test void changedFinalPriceIncludingZeroIsFlagged(){var old=original(2);for(String price:List.of("12.00","0.00")){var r=ReorderComparison.compare(old,current(1,1),"bag",new BigDecimal(price),true);assertThat(r.available()).isTrue();assertThat(r.changes()).containsExactly("PRICE");}}
 @Test void currentMinimumViolationPreservesOriginalAndDoesNotCompareDifferentQuantities(){var old=original(2);var v=current(5,5);assertThat(ReorderComparison.pricedQuantity(old,v)).isEqualTo(5);var r=ReorderComparison.compare(old,v,"bag",new BigDecimal("99.00"),true);assertThat(r.available()).isFalse();assertThat(r.changes()).containsExactly("UNAVAILABLE","MINIMUM");assertThat(old.quantity()).isEqualTo(2);}
 @Test void stepViolationIsSeparateAndValidRuleChangesAreNotInvented(){var old=original(2);var v=current(1,2);assertThat(ReorderComparison.pricedQuantity(old,v)).isEqualTo(1);assertThat(ReorderComparison.compare(old,v,"bag",new BigDecimal("10.00"),true).changes()).containsExactly("UNAVAILABLE","STEP");assertThat(ReorderComparison.compare(original(5),current(5,5),"bag",new BigDecimal("10.00"),true).changes()).isEmpty();}
 @Test void stockUnavailabilityIsIndependentOfPriceAndQuantity(){var r=ReorderComparison.compare(original(2),current(1,1),"bag",new BigDecimal("12.00"),false);assertThat(r.available()).isFalse();assertThat(r.changes()).containsExactly("UNAVAILABLE","PRICE");}
 @Test void defensiveTextComparisonKeepsStableFlagsAndNullablePack(){var old=original(2);var v=new VendorProducts.Values("sku","Renamed",null,UUID.randomUUID(),"6 x 500 ml",null,List.of(),1,1);var r=ReorderComparison.compare(old,v,"box",new BigDecimal("12.00"),false);assertThat(r.changes()).containsExactly("UNAVAILABLE","PRICE","SKU","NAME","UNIT","PACK");assertThat(old.unitName()).isEqualTo("bag");assertThat(old.packDescription()).isNull();}
}
