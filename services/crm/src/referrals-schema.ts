export const crmM99ReferralsSchemaSql = `
CREATE TABLE IF NOT EXISTS crm_referrals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  referrer_lead_id BIGINT UNSIGNED NOT NULL,
  referred_lead_id BIGINT UNSIGNED NULL,
  referred_name VARCHAR(255) NOT NULL,
  referred_phone VARCHAR(30) NULL,
  referred_email VARCHAR(320) NULL,
  status ENUM('pending','contacted','converted','lost') NOT NULL DEFAULT 'pending',
  benefit_description TEXT NULL,
  benefit_granted_at TIMESTAMP(3) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX crm_referrals_referrer_created_idx (referrer_lead_id, created_at),
  INDEX crm_referrals_referred_lead_idx (referred_lead_id),
  INDEX crm_referrals_status_created_idx (status, created_at),
  CONSTRAINT crm_referrals_referrer_lead_fk FOREIGN KEY (referrer_lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE,
  CONSTRAINT crm_referrals_referred_lead_fk FOREIGN KEY (referred_lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
