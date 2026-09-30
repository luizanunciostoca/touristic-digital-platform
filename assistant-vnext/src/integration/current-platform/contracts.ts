import type { Result } from "../../core/contracts.js";

export interface CurrentPlatformReadPort<I, O> {
  readonly name: string;
  read(input: I, signal: AbortSignal): Promise<Result<O>>;
}

export type PlacesCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;
export type BusinessCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;
export type WeatherCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;
export type CommerceCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;
export type TicketingCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;
export type PaymentsCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;
export type NavigationCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;
export type ProfileCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;
export type NotificationsCurrentPlatformAdapter = CurrentPlatformReadPort<unknown, unknown>;

export class UnconnectedCurrentPlatformAdapter
  implements CurrentPlatformReadPort<unknown, unknown>
{
  constructor(readonly name: string) {}
  read(): Promise<Result<unknown>> {
    return Promise.resolve({
      ok: false,
      error: {
        code: "UNAVAILABLE",
        message: this.name + " adapter is not connected",
        retryable: false,
      },
    });
  }
}
