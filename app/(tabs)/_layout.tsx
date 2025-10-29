import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AppTheme as theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.accent,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.85)',
          borderTopColor: '#E5E7EB',
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="albums"
        options={{
          title: 'Albums',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="folder.fill" color={color} />,
        }}
      />

      <Tabs.Screen
        name="gallery"
        options={{
          title: 'Screenshots',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="photo.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="all-images"
        options={{
          title: 'All Images',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="photo.stack.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="todo-list"
        options={{
          title: 'Todos',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checkmark.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tags"
        options={{
          title: 'Tags',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="tag.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
      options={{
        title: 'Settings',
        tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={color} />,
      }}
    />
  </Tabs>
);
}
