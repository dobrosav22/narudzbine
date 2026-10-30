"use client";

import { useEffect, useState } from "react";
import { SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  codePointLength,
  formatDateTime,
  intentFor,
  isUncertainOutcome,
  MESSAGE_MAX,
  pageItems,
  uuidv4,
  type PendingIntent,
} from "@repo/core";
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
import { cn } from "@/lib/utils";
import { useErrorText } from "@/lib/i18n";
import { initials } from "@/lib/session";
import { useOrderMessages, useSendOrderMessage } from "./queries";

/**
 * The shared order thread (GET/POST /orders/{id}/messages), one per order, visible to both
 * organizations. Own messages show the teammate's name; the counterparty appears only as its
 * organization. A new message carries a UUIDv4 Idempotency-Key that is kept for an exact retry
 * after an uncertain outcome and replaced for any new text.
 */
export function OrderThread({
  orderId,
  ownOrganizationId,
  ownOrganizationName,
  ownAccountId,
  counterpartName,
  readOnly,
}: {
  orderId: string;
  ownOrganizationId: string;
  ownOrganizationName: string;
  ownAccountId: string;
  counterpartName: string;
  /** Disconnected terminal orders keep a read-only thread. */
  readOnly: boolean;
}) {
  const t = useTranslations("orders.thread");
  const errorText = useErrorText();
  const messages = useOrderMessages(orderId);
  const send = useSendOrderMessage();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingIntent<string> | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = messages;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const items = pageItems(messages.data?.pages);
  const body = text.trim();
  const tooLong = codePointLength(body) > MESSAGE_MAX;

  const submit = () => {
    if (!body || tooLong || send.isPending) return;
    const intent = intentFor(pending, body, uuidv4);
    setPending(intent);
    send.mutate(
      { orderId, text: intent.body, idempotencyKey: intent.key },
      {
        onSuccess: () => {
          setText("");
          setPending(null);
        },
        // Keep the key only when we cannot know whether the message was stored.
        onError: (e) => {
          if (!isUncertainOutcome(e)) setPending(null);
        },
      },
    );
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
        ) : items.length === 0 ? (
          <Marker variant="separator">
            <MarkerContent>{t("empty")}</MarkerContent>
          </Marker>
        ) : (
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="max-h-96">
              <MessageScrollerViewport>
                <MessageScrollerContent className="flex flex-col gap-4">
                  {items.map((m) => {
                    const ours = m.authorOrganizationId === ownOrganizationId;
                    const mine = m.ownAuthorAccountId === ownAccountId;
                    const author = ours ? m.ownAuthorDisplayName ?? ownOrganizationName : counterpartName;
                    return (
                      <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={mine}>
                        <Message align={ours ? "end" : "start"}>
                          <MessageAvatar>
                            <Avatar className="size-8">
                              <AvatarFallback>{initials(author)}</AvatarFallback>
                            </Avatar>
                          </MessageAvatar>
                          <MessageContent>
                            <MessageHeader>{mine ? t("you") : author}</MessageHeader>
                            {/* Own side: subtle tinted violet, not a solid primary flood (05 §4). */}
                            <Bubble variant={ours ? "tinted" : "muted"} align={ours ? "end" : "start"}>
                              <BubbleContent className="whitespace-pre-wrap">{m.text}</BubbleContent>
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

        {readOnly ? (
          <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Field data-invalid={!!send.error || tooLong || undefined}>
              <FieldLabel htmlFor="order-message" className="sr-only">
                {t("label", { name: counterpartName })}
              </FieldLabel>
              <InputGroup>
                <InputGroupTextarea
                  id="order-message"
                  rows={2}
                  placeholder={t("placeholder", { name: counterpartName })}
                  value={text}
                  aria-invalid={tooLong || undefined}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    // Touch keyboards have no Shift+Enter: there Enter adds a line and the button sends (QA-011).
                    if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(pointer: coarse)").matches) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                <InputGroupAddon align="block-end">
                  <span className={cn("text-xs text-muted-foreground", !tooLong && "pointer-coarse:hidden")}>
                    {tooLong ? t("tooLong", { max: MESSAGE_MAX }) : t("hint")}
                  </span>
                  <InputGroupButton type="submit" size="sm" className="ml-auto" disabled={!body || tooLong || send.isPending}>
                    {send.isPending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
                    {t("send")}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {send.error && (
                <p className="text-sm text-destructive" role="alert">
                  {errorText(send.error)} {pending && isUncertainOutcome(send.error) ? t("uncertain") : null}
                </p>
              )}
            </Field>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
