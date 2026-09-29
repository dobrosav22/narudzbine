"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ShoppingCartIcon } from "lucide-react";
import { toast } from "sonner";
import { checkoutProblems, defaultLocationId, formatMoney, formatNumber, isServiceError, orderNumber } from "@repo/core";
import { ProductImage } from "@/components/product-image";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/query-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCart } from "@/lib/cart";
import { useSignedIn } from "@/lib/session";
import { useCartPricing } from "@/features/buyer-catalogue/queries";
import { FormError } from "@/features/auth/form-error";
import { useBuyerLocations, usePlaceOrder } from "./queries";
import { useTranslations } from "next-intl";
import { useMsg } from "@/lib/i18n";

/** 03 → buyer "Checkout": pick the delivery location, review, confirm. No payment step (01 §5). */
export function CheckoutScreen() {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const tm = useMsg();
  const router = useRouter();
  const { membership, activeVendor } = useSignedIn();
  const cart = useCart();
  const pricing = useCartPricing(cart.scope, cart.lines);
  const locations = useBuyerLocations(membership.org.id);
  const place = usePlaceOrder(cart.scope, membership.user.id);
  const locationId = cart.state.locationId ?? defaultLocationId(locations.data ?? [], membership.user.homeLocationId);

  if (cart.lines.length === 0 && !place.isSuccess) {
    return (
      <EmptyState icon={ShoppingCartIcon} title={t("emptyTitle")} description={t("emptyDescription")}>
        <Button asChild variant="outline">
          <Link href="/buyer">{tc("browse")}</Link>
        </Button>
      </EmptyState>
    );
  }
  const failed = pricing.isError ? pricing : locations.isError ? locations : undefined;
  if (failed) return <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />;
  if (!pricing.data || !locations.data) return <RowsSkeleton rows={5} />;

  const problems = checkoutProblems({ rows: pricing.data.rows, locationId, locations: locations.data });
  const rows = pricing.data.rows.filter((r) => r.product && r.price);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToCart")}>
          <Link href="/buyer/cart">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold tracking-tight">{tc("checkout")}</h1>
          <p className="text-sm text-muted-foreground">{tc("orderFrom", { vendor: activeVendor?.name ?? "" })}</p>
        </div>
      </div>

      {problems.length > 0 && (
        <Alert>
          <AlertTitle>{t("fixFirst")}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {problems.map((p) => (
                <li key={p.key + JSON.stringify(p.values ?? {})}>{tm(p)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {/* A server-side rejection (e.g. a product deactivated since pricing) keeps the cart intact. */}
      {place.error && <FormError error={place.error} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("deliveryLocation")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldSet>
                <FieldLegend className="sr-only">{tc("deliverTo")}</FieldLegend>
                <RadioGroup value={locationId} onValueChange={cart.setLocation}>
                  {locations.data.map((l) => (
                    <FieldLabel key={l.id} htmlFor={`loc-${l.id}`}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle>
                            {l.name}
                            {l.id === membership.user.homeLocationId && ` · ${t("yourLocation")}`}
                          </FieldTitle>
                          <FieldDescription>{l.address || t("noAddress")}</FieldDescription>
                        </FieldContent>
                        <RadioGroupItem value={l.id} id={`loc-${l.id}`} />
                      </Field>
                    </FieldLabel>
                  ))}
                </RadioGroup>
              </FieldSet>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{tc("items")}</CardTitle>
              <CardDescription>{t("finalPrices")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead>{tc("product")}</TableHead>
                    <TableHead className="text-right">{t("qty")}</TableHead>
                    <TableHead className="text-right">{tc("price")}</TableHead>
                    <TableHead className="text-right">{tc("total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ line, product, price }) => (
                    <TableRow key={line.productId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductImage src={product!.imageUrl} className="size-10" />
                          <div className="flex flex-col">
                            <span className="font-medium">{product!.name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{product!.sku}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatNumber(line.quantity)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(price!.unitPrice)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatMoney(price!.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("orderTotal")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{tc("items")}</span>
              <span className="font-mono tabular-nums">{formatNumber(pricing.data.itemCount)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>{tc("total")}</span>
              <span className="font-mono tabular-nums">{formatMoney(pricing.data.total)}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t("noPayment", { vendor: activeVendor?.name ?? "" })}</p>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={problems.length > 0 || place.isPending || !locationId}
              onClick={() =>
                place.mutate(locationId!, {
                  onSuccess: (order) => {
                    toast.success(t("placedToast", { number: orderNumber(order) }));
                    router.replace(`/buyer/orders/${order.id}?placed=1`);
                  },
                  onError: (e) => {
                    if (!isServiceError(e)) toast.error(t("placeFailed"));
                  },
                })
              }
            >
              {place.isPending && <Spinner data-icon="inline-start" />}
              {t("placeOrder")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
