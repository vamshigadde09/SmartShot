import { Colors } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { router, useSegments } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';

const FloatingNavDock = () => {
    const segments = useSegments();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const navItems = [
        {
            name: 'gallery',
            icon: 'images',
            route: '/(tabs)/gallery',
        },
        {
            name: 'all-images',
            icon: 'image',
            route: '/(tabs)/all-images',
        },
        {
            name: 'albums',
            icon: 'folder',
            route: '/(tabs)/albums',
        },
    ];

    const isActive = (route) => {
        const currentRoute = segments.join('/');
        if (route === '/(tabs)/gallery' && (currentRoute.includes('gallery') || currentRoute === '(tabs)/gallery')) return true;
        if (route === '/(tabs)/albums' && (currentRoute.includes('albums') || currentRoute === '(tabs)/albums')) return true;
        if (route === '/(tabs)/all-images' && (currentRoute.includes('all-images') || currentRoute === '(tabs)/all-images')) return true;
        return false;
    };

    const dockBgColor = isDark ? Colors.dark.card : Colors.light.card;
    const dockBorderColor = isDark ? Colors.dark.border : Colors.light.border;
    const inactiveIconColor = isDark ? Colors.dark.icon : Colors.light.icon;

    return (
        <View style={styles.container}>
            <View style={[
                styles.dock,
                { backgroundColor: dockBgColor, borderColor: dockBorderColor }
            ]}>
                {navItems.map((item) => {
                    const active = isActive(item.route);
                    return (
                        <TouchableOpacity
                            key={item.name}
                            style={[
                                styles.navItem,
                                active && (isDark ? styles.navItemActiveDark : styles.navItemActiveLight)
                            ]}
                            onPress={() => router.push(item.route)}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={active ? item.icon : `${item.icon}-outline`}
                                size={22}
                                color={active ? '#8B5CF6' : inactiveIconColor}
                            />
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 24,
        pointerEvents: 'box-none',
        zIndex: 1000,
    },
    dock: {
        flexDirection: 'row',
        borderRadius: 28,
        paddingVertical: 12,
        paddingHorizontal: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 12,
        borderWidth: 1,
        width: '92%',
        maxWidth: 500,
        justifyContent: 'space-evenly',
        alignItems: 'center',
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 16,
    },
    navItemActiveLight: {
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
    },
    navItemActiveDark: {
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
    },
});

export default FloatingNavDock;

