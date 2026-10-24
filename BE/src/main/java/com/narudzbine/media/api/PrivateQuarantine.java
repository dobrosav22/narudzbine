package com.narudzbine.media.api;
import java.nio.file.Path;
/** Provider calls are forbidden inside a database transaction. No raw download/public URL API. */
public interface PrivateQuarantine {
    void ensure(String key,Path file,long bytes,String sha256,String md5,String mediaType);
    /** Delete raw bytes and retain a zero-byte conditional-write fence against late PUTs. */
    void delete(String key);
    /** Abandoned/failed assets only: fence late processed PUTs before DELETED. */
    default void fenceProcessed(String key){throw new MediaFailure("SERVICE_UNAVAILABLE");}
}
