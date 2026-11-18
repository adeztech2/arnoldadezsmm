CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  open_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL DEFAULT '',
  email VARCHAR(320) NOT NULL DEFAULT '',
  country CHAR(2) NOT NULL DEFAULT 'KE',
  balance BIGINT NOT NULL DEFAULT 0,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  country_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role VARCHAR(32) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY user_roles_user_role (user_id, role),
  CONSTRAINT user_roles_profile_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR(32) NOT NULL PRIMARY KEY,
  site_name VARCHAR(80) NOT NULL DEFAULT 'ADEZ SMM',
  tagline VARCHAR(200) NOT NULL DEFAULT 'Your next chapter of growth starts here.',
  support_email VARCHAR(200) NOT NULL DEFAULT '',
  announcement VARCHAR(500) NOT NULL DEFAULT '',
  wallet_currency CHAR(3) NOT NULL DEFAULT 'KES',
  paystack_currency CHAR(3) NOT NULL DEFAULT 'KES',
  provider_currency CHAR(3) NOT NULL DEFAULT '',
  provider_to_wallet_rate DECIMAL(18,6) NOT NULL DEFAULT 0,
  paystack_to_wallet_rate DECIMAL(18,6) NOT NULL DEFAULT 1,
  min_deposit BIGINT NOT NULL DEFAULT 10000,
  default_markup_percent DECIMAL(10,4) NOT NULL DEFAULT 30,
  registration_open BOOLEAN NOT NULL DEFAULT TRUE,
  maintenance BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync_at DATETIME(3) NULL,
  first_user_registered BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

INSERT INTO settings (id) VALUES ('site') ON DUPLICATE KEY UPDATE id = VALUES(id);

CREATE TABLE IF NOT EXISTS services (
  id CHAR(36) NOT NULL PRIMARY KEY,
  provider_id VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(1000) NOT NULL DEFAULT '',
  category VARCHAR(300) NOT NULL DEFAULT 'Other',
  type VARCHAR(120) NOT NULL DEFAULT 'Default',
  min INT NOT NULL DEFAULT 1,
  max INT NOT NULL DEFAULT 1,
  provider_rate DECIMAL(18,6) NOT NULL DEFAULT 0,
  provider_currency CHAR(3) NOT NULL DEFAULT '',
  selling_rate DECIMAL(18,6) NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  supported BOOLEAN NOT NULL DEFAULT TRUE,
  refill BOOLEAN NOT NULL DEFAULT FALSE,
  cancel BOOLEAN NOT NULL DEFAULT FALSE,
  requirements JSON NOT NULL,
  pricing_unit VARCHAR(32) NOT NULL DEFAULT '1000',
  description TEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX services_available_idx (enabled, available, supported)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  service_id CHAR(36) NOT NULL,
  service_name VARCHAR(1000) NOT NULL DEFAULT '',
  provider_service_id VARCHAR(255) NULL,
  provider_order_id VARCHAR(255) NULL UNIQUE,
  idempotency_key VARCHAR(100) NOT NULL,
  link VARCHAR(2000) NOT NULL DEFAULT '',
  quantity INT NOT NULL DEFAULT 0,
  fields JSON NOT NULL,
  charge BIGINT NOT NULL DEFAULT 0,
  provider_cost BIGINT NOT NULL DEFAULT 0,
  refund_amount BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(64) NOT NULL DEFAULT 'Submitting',
  start_count INT NOT NULL DEFAULT 0,
  remains INT NULL,
  refill BOOLEAN NOT NULL DEFAULT FALSE,
  cancel BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY orders_user_idempotency (user_id, idempotency_key),
  INDEX orders_user_created_idx (user_id, created_at),
  CONSTRAINT orders_profile_fk FOREIGN KEY (user_id) REFERENCES profiles(id),
  CONSTRAINT orders_service_fk FOREIGN KEY (service_id) REFERENCES services(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  type VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  reference VARCHAR(255) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX transactions_user_created_idx (user_id, created_at),
  CONSTRAINT transactions_profile_fk FOREIGN KEY (user_id) REFERENCES profiles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  reference VARCHAR(255) NOT NULL UNIQUE,
  gateway VARCHAR(32) NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'KES',
  pay_amount BIGINT NOT NULL,
  pay_currency CHAR(3) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'initializing',
  checkout_request_id VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  authorization_url VARCHAR(2000) NULL,
  failure_reason TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX payments_user_created_idx (user_id, created_at),
  CONSTRAINT payments_profile_fk FOREIGN KEY (user_id) REFERENCES profiles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  actor CHAR(36) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target VARCHAR(255) NOT NULL,
  detail TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX audit_actor_created_idx (actor, created_at)
) ENGINE=InnoDB;
