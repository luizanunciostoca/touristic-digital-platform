export interface AssistantVNextFeatureFlags {
  readonly ASSISTANT_VNEXT_ENABLED: boolean;
  readonly ASSISTANT_VNEXT_SHADOW: boolean;
  readonly ASSISTANT_VNEXT_READ_TOOLS: boolean;
  readonly ASSISTANT_VNEXT_ACTIONS: boolean;
  readonly ASSISTANT_VNEXT_MEMORY: boolean;
  readonly ASSISTANT_VNEXT_PROACTIVE: boolean;
}

export const DEFAULT_VNEXT_FLAGS: AssistantVNextFeatureFlags = Object.freeze({
  ASSISTANT_VNEXT_ENABLED: false,
  ASSISTANT_VNEXT_SHADOW: false,
  ASSISTANT_VNEXT_READ_TOOLS: false,
  ASSISTANT_VNEXT_ACTIONS: false,
  ASSISTANT_VNEXT_MEMORY: false,
  ASSISTANT_VNEXT_PROACTIVE: false,
});

export interface KillSwitchState {
  readonly disableAll: boolean;
  readonly disableProvider: boolean;
  readonly disabledTools: ReadonlySet<string>;
  readonly disableWriteActions: boolean;
  readonly disableMemoryWrites: boolean;
  readonly disableProactive: boolean;
}

export class KillSwitches {
  constructor(private readonly state: KillSwitchState) {}

  providerAllowed(): boolean {
    return !this.state.disableAll && !this.state.disableProvider;
  }
  toolAllowed(name: string): boolean {
    return !this.state.disableAll && !this.state.disabledTools.has(name);
  }
  writesAllowed(): boolean {
    return !this.state.disableAll && !this.state.disableWriteActions;
  }
  memoryWritesAllowed(): boolean {
    return !this.state.disableAll && !this.state.disableMemoryWrites;
  }
  proactiveAllowed(): boolean {
    return !this.state.disableAll && !this.state.disableProactive;
  }
}
