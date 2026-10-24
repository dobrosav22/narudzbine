package com.narudzbine.ordering.application;
import java.util.UUID;
/** Preserve chronological keyset order when two real events share a millisecond. */
final class OrderEventIds {
 static UUID after(UUID previous,UUID candidate){
  if(candidate.toString().compareTo(previous.toString())>0){return candidate;}
  long high=previous.getMostSignificantBits(),low=previous.getLeastSignificantBits();
  if((low&0x3fffffffffffffffL)!=0x3fffffffffffffffL){return new UUID(high,low+1);}
  if((high&0xfffL)!=0xfffL){return new UUID(high+1,0x8000000000000000L);}
  throw new IllegalStateException("Order event UUID space exhausted for timestamp");
 }
}
