import mysql, { type Pool } from "mysql2/promise";

import {
  MySqlNotificationOutboxRepository,
  type NotificationOutboxRepository,
} from "./mysql-notification-outbox.js";
import {
  NotificationOutboxScheduler,
  NotificationOutboxSchedulerHost,
  type NotificationOutboxSchedulerHostOptions,
  type NotificationOutboxSchedulerOptions,
} from "./outbox-scheduler.js";
import { notificationsSchemaSql } from "./schema.js";

export * from "./mysql-notification-outbox.js";
export * from "./outbox-scheduler.js";
export * from "./schema.js";

export function createNotificationsMySqlPool(
  databaseUrl = process.env.NOTIFICATIONS_DATABASE_URL,
): Pool {
  if (!databaseUrl) throw new Error("NOTIFICATIONS_DATABASE_URL_REQUIRED");
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: Number(process.env.NOTIFICATIONS_DATABASE_POOL_SIZE ?? 8),
    waitForConnections: true,
    timezone: "Z",
  });
}

export async function applyNotificationsSchema(pool: Pool): Promise<void> {
  await pool.query(notificationsSchemaSql);
}

export function createNotificationOutboxRuntime(input: {
  readonly repository: NotificationOutboxRepository;
  readonly dispatcher: ConstructorParameters<
    typeof NotificationOutboxScheduler
  >[1];
  readonly scheduler: NotificationOutboxSchedulerOptions;
  readonly host: NotificationOutboxSchedulerHostOptions;
}): NotificationOutboxSchedulerHost {
  const scheduler = new NotificationOutboxScheduler(
    input.repository,
    input.dispatcher,
    input.scheduler,
  );
  return new NotificationOutboxSchedulerHost(scheduler, input.host);
}

export function createMySqlNotificationOutboxRuntime(input: {
  readonly pool: Pool;
  readonly dispatcher: ConstructorParameters<
    typeof NotificationOutboxScheduler
  >[1];
  readonly scheduler: NotificationOutboxSchedulerOptions;
  readonly host: NotificationOutboxSchedulerHostOptions;
}): NotificationOutboxSchedulerHost {
  return createNotificationOutboxRuntime({
    repository: new MySqlNotificationOutboxRepository(input.pool),
    dispatcher: input.dispatcher,
    scheduler: input.scheduler,
    host: input.host,
  });
}
