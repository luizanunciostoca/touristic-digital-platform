import type {
  Pool,
  PoolConnection,
  RowDataPacket,
  ResultSetHeader,
} from "mysql2/promise";

export interface CrmSetting {
  readonly id: number;
  readonly settingKey: string;
  readonly settingValue: unknown;
  readonly settingGroup: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly updatedBySubject: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CrmSettingsRepositoryPort {
  findByKey(key: string): Promise<CrmSetting | null>;
  findByGroup(group: string): Promise<readonly CrmSetting[]>;
  findAll(): Promise<readonly CrmSetting[]>;
  upsert(
    setting: Omit<CrmSetting, "id" | "createdAt" | "updatedAt">,
  ): Promise<CrmSetting>;
  deactivate(key: string, updatedBySubject: string): Promise<boolean>;
}

interface SettingRow extends RowDataPacket {
  id: number;
  setting_key: string;
  setting_value: string;
  setting_group: string;
  description: string | null;
  is_active: number;
  updated_by_subject: string;
  created_at: string;
  updated_at: string;
}

function rowToSetting(row: SettingRow): CrmSetting {
  const parsedValue: unknown = JSON.parse(row.setting_value);
  return Object.freeze({
    id: row.id,
    settingKey: row.setting_key,
    settingValue: parsedValue,
    settingGroup: row.setting_group,
    description: row.description,
    isActive: row.is_active === 1,
    updatedBySubject: row.updated_by_subject,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class MySqlCrmSettingsRepository implements CrmSettingsRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findByKey(key: string): Promise<CrmSetting | null> {
    const [rows] = await this.pool.execute<SettingRow[]>(
      "SELECT * FROM crm_settings WHERE setting_key = ? AND is_active = 1 LIMIT 1",
      [key],
    );
    return rows.length > 0 ? rowToSetting(rows[0]!) : null;
  }

  async findByGroup(group: string): Promise<readonly CrmSetting[]> {
    const [rows] = await this.pool.execute<SettingRow[]>(
      "SELECT * FROM crm_settings WHERE setting_group = ? AND is_active = 1 ORDER BY setting_key",
      [group],
    );
    return rows.map(rowToSetting);
  }

  async findAll(): Promise<readonly CrmSetting[]> {
    const [rows] = await this.pool.execute<SettingRow[]>(
      "SELECT * FROM crm_settings WHERE is_active = 1 ORDER BY setting_group, setting_key",
    );
    return rows.map(rowToSetting);
  }

  async upsert(
    setting: Omit<CrmSetting, "id" | "createdAt" | "updatedAt">,
  ): Promise<CrmSetting> {
    const conn: PoolConnection = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute<ResultSetHeader>(
        `INSERT INTO crm_settings (setting_key, setting_value, setting_group, description, is_active, updated_by_subject)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           setting_group = VALUES(setting_group),
           description = VALUES(description),
           is_active = VALUES(is_active),
           updated_by_subject = VALUES(updated_by_subject)`,
        [
          setting.settingKey,
          JSON.stringify(setting.settingValue),
          setting.settingGroup,
          setting.description,
          setting.isActive ? 1 : 0,
          setting.updatedBySubject,
        ],
      );
      await conn.commit();
      const result = await this.findByKey(setting.settingKey);
      if (!result) throw new Error("CRM_SETTING_UPSERT_FAILED");
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async deactivate(key: string, updatedBySubject: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE crm_settings SET is_active = 0, updated_by_subject = ? WHERE setting_key = ?",
      [updatedBySubject, key],
    );
    return result.affectedRows > 0;
  }
}
