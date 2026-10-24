package com.narudzbine.audit.api;
import java.util.UUID;
public interface TaxonomyAudit {
 enum Kind { CATEGORY,TAG,UNIT }
 enum Action { TAXONOMY_CREATED,TAXONOMY_RENAMED,TAXONOMY_DELETED }
 void taxonomy(UUID actor,UUID resource,Kind kind,Action action);
}
