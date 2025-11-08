import { Alert } from 'react-native';
import { autoSetupStorageFolder, initializeDatabase } from '@/utils/fileStorage';
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

    const setupStorage = async () => {
      try {
        // Automatically set up storage folder on app startup
        const folderSetup = await autoSetupStorageFolder(true);
        
        // Initialize database
        await initializeDatabase();
        
        // Show alert if folder was created (not if it already existed)
        if (folderSetup?.success && !folderSetup?.alreadyExists) {
          // Use setTimeout to delay alert so app can finish loading
          setTimeout(() => {
            Alert.alert(
              'Storage Folder Created',
              'SmartShot has automatically created a storage folder for your data. Your data will now persist even if you uninstall the app.',
              [{ text: 'OK' }]
            );
          }, 1000);
        }
        
        // If folder setup failed, user can manually select a folder from settings
      } catch (e) {
        // Don't block app startup if storage setup fails
        console.error('Error setting up storage:', e);
      }
    };

    ensureBackgroundService();
    setupStorage();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="view-screenshot" options={{ headerShown: false }} />
        <Stack.Screen name="edit-screenshot" options={{ headerShown: false }} />
        <Stack.Screen name="tag-images" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
