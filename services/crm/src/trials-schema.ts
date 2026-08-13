export const crmM90TrialsSchemaSql = `
CREATE TABLE IF NOT EXISTS crm_trials (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  start_date TIMESTAMP(3) NOT NULL,
  end_date TIMESTAMP(3) NOT NULL,
  duration_days INT UNSIGNED NOT NULL,
  status ENUM('active','expired','converted','cancelled') NOT NULL DEFAULT 'active',
  converted_at TIMESTAMP(3) NULL,
  notified_at TIMESTAMP(3) NULL,
  schedule_cron_task_uid VARCHAR(191) NULL,
  notification_task_uid VARCHAR(191) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX crm_trials_lead_created_idx (lead_id, created_at),
  INDEX crm_trials_status_end_idx (status, end_date),
  INDEX crm_trials_notification_pending_idx (status, notified_at, notification_task_uid, end_date),
  CONSTRAINT crm_trials_lead_fk FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const crmM94TrialsNotificationClaimSchemaSql = `
ALTER TABLE crm_trials
  ADD COLUMN notification_task_uid VARCHAR(191) NULL AFTER schedule_cron_task_uid,
  ADD INDEX crm_trials_notification_pending_idx (status, notified_at, notification_task_uid, end_date);
`;
