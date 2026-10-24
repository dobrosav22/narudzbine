package com.narudzbine.shared.infrastructure.database;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "backend_schema_version")
class SchemaVersionEntity {
    @Id
    private Integer id;

    @Column(nullable = false)
    private Integer version;

    protected SchemaVersionEntity() {
    }
}
