package com.narudzbine.identity.infrastructure.web;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.narudzbine.buyerworkspace.api.SharedFavorites;
import com.narudzbine.catalogue.api.VendorProducts;
import com.narudzbine.trading.api.TradingConnections;
import com.narudzbine.identity.api.*;
import com.narudzbine.identity.application.*;
import com.narudzbine.organizations.api.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.*;
import org.springframework.transaction.support.SimpleTransactionStatus;
/** Exercises the page-discovery race deterministically; database guard races are in AuthHttpIT. */
class FavoritesPageTest {
 private final UUID buyer=UUID.randomUUID(),actor=UUID.randomUUID(),vendor=UUID.randomUUID(),other=UUID.randomUUID(),product=UUID.randomUUID();
 private final Instant now=Instant.parse("2026-10-19T12:00:00Z");
 private final SharedFavorites favorites=mock(SharedFavorites.class);private final SessionService sessions=mock(SessionService.class);private final MembershipAccess members=mock(MembershipAccess.class);private final BusinessAuthorization authorization=mock(BusinessAuthorization.class);private final TradingConnections trading=mock(TradingConnections.class);
 private FavoritesController controller(){
  var principal=new AuthenticatedSession(UUID.randomUUID(),actor,false,now);when(sessions.authenticate(anyString(),any())).thenReturn(principal);when(sessions.authenticateForWorkspace(anyString(),any(),eq(buyer),anySet())).thenReturn(principal);when(members.lockForAuthorization(actor)).thenReturn(Optional.of(new LockedMembership(buyer,Country.RS,OrganizationType.BUYER,BusinessRole.STAFF,true,true)));when(authorization.require(actor,buyer,Country.RS,BusinessCapability.PREPARE_BUYER_ORDER)).thenReturn(new BusinessScope(actor,buyer,Country.RS,OrganizationType.BUYER,BusinessRole.STAFF));
  var manager=mock(PlatformTransactionManager.class);when(manager.getTransaction(any())).thenAnswer(i->new SimpleTransactionStatus());
  return new FavoritesController(favorites,mock(VendorProducts.class),trading,mock(BuyerOfferProjection.class),sessions,members,authorization,new SessionTransportPolicy(Set.of()),mock(LoginThrottle.class),Clock.fixed(now,ZoneOffset.UTC),manager);
 }
 private MockHttpServletRequest request(){var r=new MockHttpServletRequest("GET","/api/v1/favorites");r.addHeader("Authorization","Bearer "+"a".repeat(43));return r;}
 private SharedFavorites.Page page(UUID v){return new SharedFavorites.Page(List.of(new SharedFavorites.Item(product,v,now)),null);}
 @Test void pageThatAcquiresNewVendorIsRediscoveredBeforeProjection(){
  var c=controller();when(favorites.list(buyer,0,25,false)).thenReturn(page(vendor),page(other),page(other),page(other));when(trading.find(other,buyer)).thenReturn(Optional.empty());var result=c.list(request());assertThat(result.items()).hasSize(1);assertThat(result.items().getFirst().available()).isFalse();verify(sessions).authenticateForWorkspace("a".repeat(43),SessionTransport.NATIVE,buyer,Set.of(vendor));verify(sessions).authenticateForWorkspace("a".repeat(43),SessionTransport.NATIVE,buyer,Set.of(other));verify(trading,never()).find(vendor,buyer);verify(sessions,times(1)).recordSuccessfulActivity(anyString(),any());
 }
 @Test void repeatedPageChurnIsBoundedAndDoesNotProjectUnlockedVendor(){
  var c=controller();when(favorites.list(buyer,0,25,false)).thenReturn(page(vendor),page(other),page(vendor),page(other),page(vendor),page(other));assertThatThrownBy(()->c.list(request())).isInstanceOfSatisfying(AuthHttpFailure.class,e->{assertThat(e.status).isEqualTo(503);assertThat(e.code).isEqualTo("SERVICE_UNAVAILABLE");});verifyNoInteractions(trading);verify(sessions,never()).recordSuccessfulActivity(anyString(),any());verify(favorites,times(6)).list(buyer,0,25,false);
 }
}
