import type { ThemeDefinition } from './types';
import catppuccinMocha from './catppuccin-mocha';
import catppuccinLatte from './catppuccin-latte';
import oneDarkPro from './one-dark-pro';
import cursorDark from './cursor-dark';
import dracula from './dracula';
import nord from './nord';
import githubLight from './github-light';
import solarizedLight from './solarized-light';
import oneLight from './one-light';
import quietLight from './quiet-light';

export type { ThemeDefinition } from './types';

export const themes: ThemeDefinition[] = [
  catppuccinMocha,
  oneDarkPro,
  cursorDark,
  dracula,
  nord,
  catppuccinLatte,
  githubLight,
  solarizedLight,
  oneLight,
  quietLight,
];

export const DEFAULT_THEME_ID = 'catppuccin-mocha';

export function getTheme(id: string): ThemeDefinition {
  return themes.find((t) => t.id === id) ?? catppuccinMocha;
}

export function getMonacoThemeName(themeId: string): string {
  return `kvault-${themeId}`;
}

/** Apply theme CSS variables to the document. */
export function applyTheme(theme: ThemeDefinition): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--${key}`, value);
  }
}

/** Register all themes with Monaco editor. Call once before using themes. */
let monacoRegistered = false;

export function registerAllMonacoThemes(monaco: typeof import('monaco-editor')): void {
  if (monacoRegistered) return;
  monacoRegistered = true;

  for (const theme of themes) {
    monaco.editor.defineTheme(getMonacoThemeName(theme.id), {
      base: theme.type === 'dark' ? 'vs-dark' : 'vs',
      inherit: true,
      rules: theme.tokenRules.map((r) => ({
        token: r.token,
        foreground: r.foreground,
        fontStyle: r.fontStyle,
      })),
      colors: theme.editorColors,
    });
  }
}
