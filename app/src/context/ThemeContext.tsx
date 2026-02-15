import { createContext, useContext } from 'react';

export type ThemeMode = 'dark' | 'light' | 'system';

export const darkColors = {
  bg: '#0a0a12', card: '#12121a', border: '#1f1f2e',
  text: '#ffffff', textSecondary: '#888888', accent: '#4CAF50',
};
export const lightColors = {
  bg: '#f5f5f5', card: '#ffffff', border: '#e0e0e0',
  text: '#1a1a1a', textSecondary: '#666666', accent: '#2E7D32',
};

export interface ThemeContextType {
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  colors: typeof darkColors;
}

export const ThemeContext = createContext<ThemeContextType>({
  isDark: true, themeMode: 'dark', setThemeMode: () => {}, colors: darkColors,
});

export const useTheme = () => useContext(ThemeContext);
