import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { NativeModules, Platform } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    const BG_PREF_KEY = 'backgroundServiceEnabled';
    const ensureBackgroundService = async () => {
      try {
        if (Platform.OS !== 'android') return;
        const ScreenshotModule = NativeModules.ScreenshotModule;
        if (!ScreenshotModule) return;

        const pref = await AsyncStorage.getItem(BG_PREF_KEY);
        const preferredEnabled = pref === null ? true : pref === 'true';

        const isRunning = await ScreenshotModule.isBackgroundServiceRunning();
        if (preferredEnabled && !isRunning) {
          try {
            await ScreenshotModule.startScreenshotDetection();
          } catch (err) {
            // Log but do not block app startup
            console.error('Auto-start background service failed:', err);
          }
        }
      } catch (e) {
        console.error('Error ensuring background service:', e);
      }
    };

    ensureBackgroundService();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
