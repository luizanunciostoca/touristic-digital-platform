export const tokens = Object.freeze({
  color: {
    brand: "#0F766E",
    surface: "#FFFFFF",
    text: "#0F172A",
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12, lg: 20, pill: 999 },
});

export type DesignTokens = typeof tokens;

export { createAction, type ActionViewModel } from "./core-ui/action.js";
export { createAppShell, type AppShellViewModel } from "./core-ui/app-shell.js";
export { createFeedback, type FeedbackViewModel } from "./core-ui/feedback.js";
export { createHeader, type HeaderViewModel } from "./core-ui/header.js";
export { createModal, type ModalViewModel } from "./core-ui/modal.js";
export {
  createNavigation,
  type NavigationViewModel,
} from "./core-ui/navigation.js";
export {
  renderAction,
  renderAppShell,
  renderFeedback,
  renderHeader,
  renderModal,
  renderNavigation,
} from "./core-ui/render.js";

export type {
  ActionContract,
  AppShellContract,
  BaseUiContract,
  CoreUiSize,
  CoreUiStatus,
  FeedbackContract,
  HeaderContract,
  ModalContract,
  NavigationContract,
  NavigationItemContract,
} from "./core-ui/contracts.js";
