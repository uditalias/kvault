export interface ThemeColors {
  'bg-primary': string;
  'bg-secondary': string;
  'bg-tertiary': string;
  'bg-surface': string;
  'text-primary': string;
  'text-secondary': string;
  'text-tertiary': string;
  accent: string;
  'accent-hover': string;
  border: string;
  danger: string;
  success: string;
  warning: string;
  'scrollbar-track': string;
  'scrollbar-thumb': string;
  'scrollbar-thumb-hover': string;
}

export interface MonacoTokenRule {
  token: string;
  foreground: string;
  fontStyle?: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  type: 'dark' | 'light';
  colors: ThemeColors;
  tokenRules: MonacoTokenRule[];
  editorColors: Record<string, string>;
}
