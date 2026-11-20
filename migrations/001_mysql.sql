CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  country CHAR(2) NOT NULL,
  role ENUM('user','admin','super_admin') NOT NULL DEFAULT 'user',
  balance BIGINT NOT NULL DEFAULT 0,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  auth_version INT NOT NULL DEFAULT 0,
  reset_hash CHAR(64) NULL,
  reset_expires DATETIME(3) NULL,
  mutation_revision INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  super_admin_guard VARCHAR(20) GENERATED ALWAYS AS (CASE WHEN role = 'super_admin' THEN 'super_admin' ELSE NULL END) STORED,
  UNIQUE KEY users_one_super_admin (super_admin_guard),
  INDEX users_role_idx (role), INDEX users_created_idx (created_at)
);

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id CHAR(36) NOT NULL,
  auth_version INT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX sessions_expiry_idx (expires_at)
);

CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(20) PRIMARY KEY,
  first_user_registered BOOLEAN NOT NULL DEFAULT FALSE,
  site_name VARCHAR(80) NOT NULL DEFAULT 'ADEZ SMM',
  tagline VARCHAR(160) NOT NULL DEFAULT 'Your next chapter of growth starts here.',
  icon_url VARCHAR(1000) NOT NULL DEFAULT '',
  support_email VARCHAR(254) NOT NULL DEFAULT '',
  wallet_currency CHAR(3) NOT NULL DEFAULT 'KES',
  paystack_currency CHAR(3) NOT NULL DEFAULT 'KES',
  provider_currency CHAR(3) NOT NULL DEFAULT '',
  provider_to_wallet_rate DECIMAL(18,6) NOT NULL DEFAULT 0,
  paystack_to_wallet_rate DECIMAL(18,6) NOT NULL DEFAULT 1,
  min_deposit BIGINT NOT NULL DEFAULT 10000,
  default_markup_percent DECIMAL(18,6) NOT NULL DEFAULT 30,
  email_from VARCHAR(254) NOT NULL DEFAULT '',
  announcement VARCHAR(1000) NOT NULL DEFAULT '',
  registration_open BOOLEAN NOT NULL DEFAULT TRUE,
  maintenance BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at DATETIME(3) NULL,
  jobs_lease_until DATETIME(3) NULL,
  shakergains_api_key TEXT NULL,
  resend_api_key TEXT NULL,
  giftedpay_api_key TEXT NULL,
  paystack_secret_key TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);
INSERT INTO settings (id) VALUES ('site') ON DUPLICATE KEY UPDATE id=id;

CREATE TABLE IF NOT EXISTS services (
  id CHAR(36) PRIMARY KEY,
  provider_id VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT '',
  type VARCHAR(100) NOT NULL DEFAULT '',
  min INT NULL, max INT NULL,
  provider_rate DECIMAL(18,6) NULL,
  provider_currency CHAR(3) NOT NULL DEFAULT '',
  selling_rate DECIMAL(18,6) NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  supported BOOLEAN NOT NULL DEFAULT TRUE,
  refill BOOLEAN NOT NULL DEFAULT FALSE,
  cancel BOOLEAN NOT NULL DEFAULT FALSE,
  requirements JSON NULL,
  pricing_unit VARCHAR(50) NULL,
  description TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX services_catalog_idx (category, provider_id), INDEX services_available_idx (enabled, available, supported)
);

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  service_id CHAR(36) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  service_type VARCHAR(100) NOT NULL DEFAULT '',
  provider_service_id VARCHAR(100) NOT NULL,
  provider_order_id VARCHAR(100) NULL UNIQUE,
  idempotency_key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NULL,
  link VARCHAR(2000) NULL,
  quantity INT NOT NULL,
  fields JSON NULL,
  charge BIGINT NOT NULL DEFAULT 0,
  provider_cost BIGINT NOT NULL DEFAULT 0,
  cost_rate_snapshot DECIMAL(18,6) NULL,
  provider_to_wallet_rate_snapshot DECIMAL(18,6) NULL,
  refund_amount BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'Submitting',
  start_count INT NOT NULL DEFAULT 0,
  remains INT NULL,
  refill BOOLEAN NOT NULL DEFAULT FALSE,
  cancel BOOLEAN NOT NULL DEFAULT FALSE,
  history JSON NULL,
  next_check_at DATETIME(3) NULL,
  checking_until DATETIME(3) NULL,
  last_refill_at DATETIME(3) NULL,
  last_cancel_at DATETIME(3) NULL,
  last_provider_charge DECIMAL(18,6) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (service_id) REFERENCES services(id),
  UNIQUE KEY orders_user_idempotency (user_id, idempotency_key), INDEX orders_user_created (user_id, created_at), INDEX orders_status_check (status, next_check_at)
);

CREATE TABLE IF NOT EXISTS transactions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  type VARCHAR(40) NOT NULL,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  description VARCHAR(500) NOT NULL,
  reference VARCHAR(255) NOT NULL UNIQUE,
  request_hash CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id), INDEX transactions_user_created (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  reference VARCHAR(255) NOT NULL UNIQUE,
  idempotency_key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NULL,
  gateway VARCHAR(30) NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  pay_amount BIGINT NOT NULL,
  pay_currency CHAR(3) NOT NULL,
  exchange_rate DECIMAL(18,6) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'initializing',
  checkout_request_id VARCHAR(255) NULL UNIQUE,
  phone VARCHAR(30) NULL,
  authorization_url VARCHAR(2000) NULL,
  failure_reason VARCHAR(500) NULL,
  next_check_at DATETIME(3) NULL,
  checking_until DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id), UNIQUE KEY payments_user_idempotency (user_id, idempotency_key), INDEX payments_status_check (status, next_check_at)
);

CREATE TABLE IF NOT EXISTS audits (
  id CHAR(36) PRIMARY KEY,
  actor VARCHAR(100) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target VARCHAR(100) NOT NULL,
  detail TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX audits_created_idx (created_at)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  id VARCHAR(255) PRIMARY KEY,
  count INT NOT NULL DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX rate_limits_expiry_idx (expires_at)
);
