export type CoreUiStatus = "idle" | "loading" | "success" | "empty" | "error";

export type CoreUiSize = "sm" | "md" | "lg";

export interface BaseUiContract {
  readonly id?: string;
  readonly className?: string;
  readonly testId?: string;
  readonly hidden?: boolean;
  readonly ariaLabel?: string;
}

export interface ActionContract extends BaseUiContract {
  readonly label: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly size?: CoreUiSize;
  readonly variant?: "primary" | "secondary" | "ghost" | "danger";
}

export interface AppShellContract extends BaseUiContract {
  readonly destinationId: string;
  readonly status: CoreUiStatus;
  readonly header?: HeaderContract;
  readonly navigation?: NavigationContract;
  readonly overlayOpen?: boolean;
}

export interface HeaderContract extends BaseUiContract {
  readonly title: string;
  readonly subtitle?: string;
  readonly logoAlt?: string;
  readonly actions?: readonly ActionContract[];
}

export interface NavigationItemContract {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon?: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
}

export interface NavigationContract extends BaseUiContract {
  readonly items: readonly NavigationItemContract[];
  readonly expanded?: boolean;
  readonly orientation?: "horizontal" | "vertical";
}

export interface ModalContract extends BaseUiContract {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly closeLabel: string;
  readonly dismissible?: boolean;
}

export interface FeedbackContract extends BaseUiContract {
  readonly status: Exclude<CoreUiStatus, "idle">;
  readonly title?: string;
  readonly message?: string;
  readonly action?: ActionContract;
}
