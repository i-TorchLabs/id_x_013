// Design tokens per UI.md specification.
// All components MUST import from here to prevent value drift.

export const SF_DISPLAY = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const SF_TEXT = '"SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const SF_MONO = '"SF Mono", Menlo, monospace';

export interface DesignTokens {
  bg: string;
  card: string;
  fg: string;
  fg2: string;
  fg3: string;
  fg4: string;
  accent: string;
  accentFg: string;
  error: string;
  navBg: string;
  inputBg: string;
  inputBorder: string;
  divider: string;
  shadow: string;
  badgeBg: string;
  iconContainerBg: string;
  completedStepBg: string;
  errorBg: string;
  errorBorder: string;
  isDark: boolean;
}

export function getTokens(isDark: boolean): DesignTokens {
  return isDark
    ? {
        bg: "#000000",
        card: "#1c1c1e",
        fg: "#ffffff",
        fg2: "rgba(255,255,255,0.7)",
        fg3: "rgba(255,255,255,0.45)",
        fg4: "rgba(255,255,255,0.25)",
        accent: "#ffffff",
        accentFg: "#000000",
        error: "#dc2626",
        navBg: "rgba(0,0,0,0.72)",
        inputBg: "rgba(255,255,255,0.05)",
        inputBorder: "rgba(255,255,255,0.12)",
        divider: "rgba(255,255,255,0.08)",
        shadow: "0 4px 48px rgba(0,0,0,0.5)",
        badgeBg: "rgba(255,255,255,0.10)",
        iconContainerBg: "transparent",
        completedStepBg: "rgba(255,255,255,0.12)",
        errorBg: "rgba(255,59,48,0.10)",
        errorBorder: "rgba(255,59,48,0.20)",
        isDark: true,
      }
    : {
        bg: "#f5f5f7",
        card: "#ffffff",
        fg: "#1d1d1f",
        fg2: "rgba(0,0,0,0.7)",
        fg3: "rgba(0,0,0,0.45)",
        fg4: "rgba(0,0,0,0.25)",
        accent: "#000000",
        accentFg: "#ffffff",
        error: "#dc2626",
        navBg: "rgba(255,255,255,0.72)",
        inputBg: "rgba(0,0,0,0.03)",
        inputBorder: "rgba(0,0,0,0.1)",
        divider: "rgba(0,0,0,0.06)",
        shadow: "0 4px 48px rgba(0,0,0,0.08)",
        badgeBg: "rgba(0,0,0,0.06)",
        iconContainerBg: "transparent",
        completedStepBg: "rgba(0,0,0,0.08)",
        errorBg: "rgba(255,59,48,0.05)",
        errorBorder: "rgba(255,59,48,0.15)",
        isDark: false,
      };
}
