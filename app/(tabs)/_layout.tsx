import { Tabs } from 'expo-router';
import React from 'react';

import FloatingNavDock from '@/components/floating-nav-dock';

export default function TabLayout() {
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // Hide default tab bar
        }}>
        <Tabs.Screen
          name="albums"
          options={{
            href: '/(tabs)/albums',
          }}
        />
        <Tabs.Screen
          name="gallery"
          options={{
            href: '/(tabs)/gallery',
          }}
        />
        <Tabs.Screen
          name="all-images"
          options={{
            href: '/(tabs)/all-images',
          }}
        />
        <Tabs.Screen
          name="tags"
          options={{
            href: '/(tabs)/tags',
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null, // Hide from tab bar but keep accessible via navigation
          }}
        />
      </Tabs>
      <FloatingNavDock />
    </>
  );
}
