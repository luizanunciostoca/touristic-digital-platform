export const crmCommerceSchemaSql = `
CREATE TABLE IF NOT EXISTS crm_commerce_customers (
  customer_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  holder_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,
  phone VARCHAR(40) NULL,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  first_purchase_at DATETIME(3) NOT NULL,
  last_purchase_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_crm_commerce_customer_email (email),
  INDEX idx_crm_commerce_customer_holder (holder_reference),
  INDEX idx_crm_commerce_customer_last_purchase (last_purchase_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_commerce_purchases (
  event_id VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  customer_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  reservation_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  inventory_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  order_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  payment_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  destination_id VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  product_kind VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  product_reference VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  amount_minor BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  purchased_at DATETIME(3) NOT NULL,
  source VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'morro_digital_ticketing',
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_crm_commerce_purchase_reservation (reservation_id),
  INDEX idx_crm_commerce_purchase_customer (customer_id, purchased_at),
  INDEX idx_crm_commerce_purchase_product (product_kind, product_reference, purchased_at),
  CONSTRAINT fk_crm_commerce_purchase_customer
    FOREIGN KEY (customer_id)
    REFERENCES crm_commerce_customers(customer_id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CHECK (quantity > 0 AND quantity <= 20),
  CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const crmCommerceRollbackSql = `
DROP TABLE IF EXISTS crm_commerce_purchases;
DROP TABLE IF EXISTS crm_commerce_customers;
`;
