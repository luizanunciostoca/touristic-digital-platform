export const crmM71SchemaSql = `
CREATE TABLE IF NOT EXISTS crm_leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_name VARCHAR(160) NOT NULL,
  segment VARCHAR(120) NULL,
  contact_name VARCHAR(160) NULL,
  phone VARCHAR(80) NULL,
  whatsapp VARCHAR(80) NULL,
  email VARCHAR(160) NULL,
  address VARCHAR(240) NULL,
  website VARCHAR(240) NULL,
  notes TEXT NULL,
  stage ENUM('new_lead','first_contact','meeting_scheduled','proposal_sent','trial','contract_sent','contract_signed','payment_pending','payment_done','onboarding','photo_visit_scheduled','photo_visit_done','published','announced','feedback','active_client','churned','lost') NOT NULL DEFAULT 'new_lead',
  status ENUM('active','inactive','lost') NOT NULL DEFAULT 'active',
  source VARCHAR(160) NULL,
  referred_by_id BIGINT UNSIGNED NULL,
  assigned_to_subject VARCHAR(191) NOT NULL,
  monthly_value DECIMAL(10,2) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_contact_at TIMESTAMP(3) NULL,
  converted_at TIMESTAMP(3) NULL,
  PRIMARY KEY (id),
  INDEX crm_leads_stage_status_idx (stage, status),
  INDEX crm_leads_assigned_subject_idx (assigned_to_subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_checklist_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  step ENUM('first_contact','meeting_scheduled','meeting_done','proposal_sent','proposal_accepted','trial_started','contract_drafted','contract_sent','contract_signed','payment_received','data_collected','photo_visit_scheduled','photo_visit_done','site_updated','announced','feedback_collected') NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP(3) NULL,
  completed_by_subject VARCHAR(191) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crm_checklist_lead_step_uq (lead_id, step),
  CONSTRAINT crm_checklist_lead_fk FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_meetings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  scheduled_at TIMESTAMP(3) NOT NULL,
  modality ENUM('in_person','online') NOT NULL,
  meeting_link VARCHAR(500) NULL,
  location VARCHAR(300) NULL,
  status ENUM('scheduled','done','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
  notes TEXT NULL,
  created_by_subject VARCHAR(191) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX crm_meetings_lead_scheduled_idx (lead_id, scheduled_at),
  INDEX crm_meetings_status_scheduled_idx (status, scheduled_at),
  CONSTRAINT crm_meetings_lead_fk FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_proposals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  plan_name VARCHAR(100) NULL,
  monthly_value DECIMAL(10,2) NOT NULL,
  setup_fee DECIMAL(10,2) NULL,
  trial_days INT UNSIGNED NOT NULL DEFAULT 0,
  features JSON NULL,
  custom_message TEXT NULL,
  pdf_url VARCHAR(500) NULL,
  share_token VARCHAR(64) NOT NULL,
  status ENUM('draft','sent','viewed','accepted','rejected') NOT NULL DEFAULT 'draft',
  sent_at TIMESTAMP(3) NULL,
  viewed_at TIMESTAMP(3) NULL,
  responded_at TIMESTAMP(3) NULL,
  valid_until TIMESTAMP(3) NULL,
  created_by_subject VARCHAR(191) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY crm_proposals_share_token_uq (share_token),
  INDEX crm_proposals_lead_created_idx (lead_id, created_at),
  INDEX crm_proposals_status_created_idx (status, created_at),
  CONSTRAINT crm_proposals_lead_fk FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_interactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  type ENUM('note','whatsapp','call','email','meeting','stage_change','proposal','contract','payment','follow_up','system') NOT NULL,
  content TEXT NOT NULL,
  metadata JSON NULL,
  actor_subject VARCHAR(191) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX crm_interactions_lead_created_idx (lead_id, created_at),
  CONSTRAINT crm_interactions_lead_fk FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  operation VARCHAR(80) NOT NULL,
  allowed BOOLEAN NOT NULL,
  reason VARCHAR(80) NOT NULL,
  actor_subject VARCHAR(191) NULL,
  lead_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX crm_audit_operation_created_idx (operation, created_at),
  INDEX crm_audit_actor_created_idx (actor_subject, created_at),
  INDEX crm_audit_lead_created_idx (lead_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
