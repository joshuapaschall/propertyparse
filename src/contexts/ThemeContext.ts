import { createContext, useContext } from 'react';

export type ThemeMode = 'light' | 'dark';

export type ThemeContextValue = {
  theme: ThemeMode;
  toggleTheme: () => void;
};

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useThemeControls(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemeControls must be used within ThemeProvider.');
  }
  return ctx;
}
