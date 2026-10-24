-- Additive physical index; application compatibility marker remains 78.
CREATE INDEX ix_order_line_quantity ON purchase_order_line(order_id) INCLUDE(quantity);
