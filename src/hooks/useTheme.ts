import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { colors, darkColors } from '../constants/colors';

const THEME_KEY = 'cebspot_theme';

interface ThemeContextValue {
  isDarkMode: boolean;
  appColors: typeof colors;
  loading: boolean;
  toggleDarkMode: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const startupTimeout = setTimeout(() => {
      if (!mounted) return;
      console.warn('Theme restore timed out. Continuing with the default theme.');
      setLoading(false);
    }, 3000);

    async function loadTheme() {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (!mounted) return;
        setIsDarkMode(saved ? saved === 'dark' : systemScheme === 'dark');
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        clearTimeout(startupTimeout);
        if (mounted) setLoading(false);
      }
    }

    loadTheme();
    return () => {
      mounted = false;
      clearTimeout(startupTimeout);
    };
  }, [systemScheme]);

  const toggleDarkMode = useCallback(async () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    await AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  }, [isDarkMode]);

  const value = useMemo(
    () => ({
      isDarkMode,
      appColors: isDarkMode ? darkColors : colors,
      loading,
      toggleDarkMode,
    }),
    [isDarkMode, loading, toggleDarkMode]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
