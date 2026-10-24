package com.narudzbine.catalogue.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Catalogue-owned port implemented by media; caller holds the vendor committing guard. */
public interface GalleryAssets {
    void lockAndValidate(UUID vendor,UUID product,List<UUID> previous,List<UUID> requested);
    void referencesChanged(List<UUID> previous,List<UUID> requested,Instant at);
}
