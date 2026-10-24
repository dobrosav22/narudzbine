package com.narudzbine.identity.infrastructure.web;
import com.narudzbine.catalogue.api.VendorProducts;
import com.narudzbine.ordering.api.OrderReviews;
import java.math.BigDecimal;
import java.util.*;
/** Compares frozen text and current original-quantity eligibility, never guessed historical rules. */
final class ReorderComparison {
 record Result(boolean available,List<String> changes){public Result{changes=List.copyOf(changes);}}
 static int pricedQuantity(OrderReviews.Line original,VendorProducts.Values current){return valid(original.quantity(),current)?original.quantity():current.minimumQuantity();}
 static Result compare(OrderReviews.Line original,VendorProducts.Values current,String unit,BigDecimal price,boolean stockReady){
  boolean quantityValid=valid(original.quantity(),current),available=quantityValid&&stockReady;var changes=new ArrayList<String>();
  if(!available){changes.add("UNAVAILABLE");}
  if(quantityValid&&original.price().finalUnitPrice().compareTo(price)!=0){changes.add("PRICE");}
  if(original.quantity()<current.minimumQuantity()){changes.add("MINIMUM");}
  else if(!quantityValid){changes.add("STEP");}
  if(!original.sku().equals(current.sku())){changes.add("SKU");}if(!original.name().equals(current.name())){changes.add("NAME");}
  if(!original.unitName().equals(unit)){changes.add("UNIT");}if(!Objects.equals(original.packDescription(),current.packDescription())){changes.add("PACK");}
  return new Result(available,changes);
 }
 private static boolean valid(int quantity,VendorProducts.Values current){return quantity>=current.minimumQuantity()&&(quantity-current.minimumQuantity())%current.quantityStep()==0;}
}
