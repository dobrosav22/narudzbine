"use client";

import { useState } from "react";
import { SendIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime, services, type OrderMessage } from "@repo/core";
import { ErrorState, RowsSkeleton } from "@/components/query-states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { initials } from "@/lib/session";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/i18n";

/**
 * 01 §5 order messaging — one thread, visible to both sides. Used by the buyer
 * and vendor order screens; `side` decides which messages are "ours" (right,
 * tinted) and who sends. Composed from shadcn's chat primitives per the skill.
 */
export function OrderThread({
  orderId,
  side,
  myUserId,
  counterpartName,
  senderName,
}: {
  orderId: string;
  side: "buyer" | "vendor";
  myUserId: string;
  /** Who the viewer is talking to — used in the description and placeholder. */
  counterpartName: string;
  /** Display name for a message's sender (already resolved per side). */
  senderName: (m: OrderMessage) => string;
}) {
  const t = useTranslations("orders.thread");
  const errorText = useErrorText();
  const qc = useQueryClient();
  const key = ["orderMessages", orderId];
  const messages = useQuery({ queryKey: key, queryFn: () => services.orders.listOrderMessages(orderId) });
  const send = useMutation({
    mutationFn: (text: string) => services.orders.addOrderMessage(orderId, { senderUserId: myUserId, senderOrgType: side, text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    send.mutate(text, { onSuccess: () => setText("") });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("visibleTo", { name: counterpartName })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {messages.isError ? (
          <ErrorState error={messages.error} onRetry={() => void messages.refetch()} />
        ) : messages.isPending ? (
          <RowsSkeleton rows={2} />
        ) : messages.data.length === 0 ? (
          <Marker variant="separator">
            <MarkerContent>{t("empty")}</MarkerContent>
          </Marker>
        ) : (
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="max-h-96">
              <MessageScrollerViewport>
                <MessageScrollerContent className="flex flex-col gap-4">
                  {messages.data.map((m) => {
                    const ours = m.senderOrgType === side;
                    const name = m.senderUserId === myUserId ? t("you") : senderName(m);
                    return (
                      <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.senderUserId === myUserId}>
                        <Message align={ours ? "end" : "start"}>
                          <MessageAvatar>
                            <Avatar className="size-8">
                              <AvatarFallback>{initials(senderName(m))}</AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                          <MessageContent>
                            <MessageHeader>{name}</MessageHeader>
                            {/* Own side: subtle tinted violet, not a solid primary flood (05 §4). */}
                            <Bubble variant={ours ? "tinted" : "muted"} align={ours ? "end" : "start"}>
                              <BubbleContent>{m.text}</BubbleContent>
                            </Bubble>
                            <MessageFooter>{formatDateTime(m.createdAt)}</MessageFooter>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    );
                  })}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field data-invalid={!!send.error || undefined}>
            <FieldLabel htmlFor="order-message" className="sr-only">
              {t("label", { name: counterpartName })}
            </FieldLabel>
            <InputGroup>
              <InputGroupTextarea
                id="order-message"
                rows={2}
                placeholder={t("placeholder", { name: counterpartName })}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <InputGroupAddon align="block-end">
                <span className="text-xs text-muted-foreground">{t("hint")}</span>
                <InputGroupButton type="submit" size="sm" className="ml-auto" disabled={!text.trim() || send.isPending}>
                  {send.isPending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
                  {t("send")}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {send.error && <p className="text-sm text-destructive">{errorText(send.error)}</p>}
          </Field>
        </form>
      </CardContent>
    </Card>
  );
}
