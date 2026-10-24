package com.narudzbine.inventory.api;
import java.time.Instant;
import java.util.*;
/** Successful order transaction only, with both organization guards already held. */
public interface OrderStock {
 record Line(UUID product,int quantity){}
 void lock(UUID vendor);
 void release(UUID order,UUID vendor,UUID actor,Instant at);
 void restore(UUID order,UUID vendor,UUID actor,Instant at);
 void deduct(UUID order,UUID vendor,UUID buyer,UUID actor,List<Line> lines,Instant at);
}
