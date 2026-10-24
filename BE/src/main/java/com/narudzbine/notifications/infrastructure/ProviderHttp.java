package com.narudzbine.notifications.infrastructure;

import java.io.ByteArrayOutputStream;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.*;

/** Fixed deadline and bounded bodies, including streaming/error responses. No redirects/retries/logged bodies. */
public final class ProviderHttp {
    public record Reply(int status,byte[] body,String retryAfter) {
        @Override public String toString() { return "ProviderReply[redacted]"; }
    }
    public interface Exchange { Reply send(HttpRequest request)throws Exception; }
    public static final class Bounded implements Exchange,AutoCloseable {
        private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).followRedirects(HttpClient.Redirect.NEVER).build();
        public void close(){client.close();}
        public Reply send(HttpRequest request)throws Exception {
            var future=client.sendAsync(request,info->new Body());
            try {var r=future.get(Math.min(10000,request.timeout().orElse(Duration.ofSeconds(10)).toMillis()),TimeUnit.MILLISECONDS);return new Reply(r.statusCode(),r.body(),r.headers().firstValue("Retry-After").orElse(null));}
            finally {if(!future.isDone())future.cancel(true);}
        }
    }
    private static final class Body implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> done=new CompletableFuture<>();private final ByteArrayOutputStream bytes=new ByteArrayOutputStream();private Flow.Subscription subscription;
        public CompletionStage<byte[]> getBody(){return done;}
        public void onSubscribe(Flow.Subscription s){if(subscription!=null){s.cancel();return;}subscription=s;s.request(1);}
        public void onNext(List<ByteBuffer> buffers){for(var b:buffers){if(b.remaining()>65536-bytes.size()){subscription.cancel();done.completeExceptionally(new IllegalStateException("Provider body limit"));return;}byte[] chunk=new byte[b.remaining()];b.get(chunk);bytes.writeBytes(chunk);}subscription.request(1);}
        public void onError(Throwable e){done.completeExceptionally(new IllegalStateException("Provider exchange unavailable"));}
        public void onComplete(){done.complete(bytes.toByteArray());}
    }
}
