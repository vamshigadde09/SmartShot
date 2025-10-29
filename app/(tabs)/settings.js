import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    NativeModules,
    PermissionsAndroid,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    TouchableOpacity,
    View
} from 'react-native';

export default function SettingsScreen() {
    const [storagePermission, setStoragePermission] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState(false);
    const [microphonePermission, setMicrophonePermission] = useState(false);
    const [backgroundService, setBackgroundService] = useState(true);
    const BG_PREF_KEY = 'backgroundServiceEnabled';

    useEffect(() => {
        checkPermissions();
    }, []);

    const checkPermissions = async () => {
        try {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                // Check storage permission
                const hasStorage = await ScreenshotModule.checkStoragePermission();
                setStoragePermission(hasStorage);

                // Check notification permission
                const hasNotification = await ScreenshotModule.checkNotificationPermission();
                setNotificationPermission(hasNotification);

                // Check microphone permission
                if (Platform.OS === 'android') {
                    const hasMic = await PermissionsAndroid.check(
                        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
                    );
                    setMicrophonePermission(hasMic);
                }

                // Check background service status and enforce default ON behavior
                const isRunning = await ScreenshotModule.isBackgroundServiceRunning();
                const pref = await AsyncStorage.getItem(BG_PREF_KEY);
                const preferredEnabled = pref === null ? true : pref === 'true';

                if (!isRunning && preferredEnabled) {
                    try {
                        await ScreenshotModule.startScreenshotDetection();
                        setBackgroundService(true);
                    } catch (startErr) {
                        console.error('Failed to auto-start background service:', startErr);
                        setBackgroundService(false);
                    }
                } else if (isRunning && !preferredEnabled) {
                    try {
                        await ScreenshotModule.stopScreenshotDetection();
                        setBackgroundService(false);
                    } catch (stopErr) {
                        console.error('Failed to stop background service per preference:', stopErr);
                        setBackgroundService(true);
                    }
                } else {
                    setBackgroundService(isRunning);
                }
            }
        } catch (error) {
            console.error('Error checking permissions:', error);
        }
    };

    const requestStoragePermission = async () => {
        try {
            if (Platform.OS !== 'android') return;

            const permission = Platform.Version >= 33
                ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
                : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

            const result = await PermissionsAndroid.request(permission, {
                title: 'Storage Permission',
                message: 'SmartShot needs access to your media to show images.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny',
            });

            const granted = result === PermissionsAndroid.RESULTS.GRANTED;
            setStoragePermission(granted);

            if (granted) {
                Alert.alert('Success', 'Storage permission granted! You can now view your images.');
            } else {
                Alert.alert('Permission Denied', 'Storage permission is required to view images. Please enable it in Settings.');
            }
        } catch (error) {
            console.error('Error requesting storage permission:', error);
            Alert.alert('Error', 'Failed to request storage permission');
        }
    };

    const requestNotificationPermission = async () => {
        try {
            if (Platform.OS !== 'android') return;

            if (Platform.Version >= 33) {
                const result = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                    {
                        title: 'Notification Permission',
                        message: 'SmartShot needs notification permission to alert you when screenshots are detected.',
                        buttonPositive: 'Allow',
                        buttonNegative: 'Deny',
                    }
                );

                const granted = result === PermissionsAndroid.RESULTS.GRANTED;
                setNotificationPermission(granted);

                if (granted) {
                    Alert.alert('Success', 'Notification permission granted!');
                    const ScreenshotModule = NativeModules.ScreenshotModule;
                    ScreenshotModule?.recreateNotificationChannel?.();
                } else {
                    Alert.alert(
                        'Permission Denied',
                        'Notification permission is required for background detection.',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Open Settings', onPress: () => Linking.openSettings() }
                        ]
                    );
                }
            } else {
                const ScreenshotModule = NativeModules.ScreenshotModule;
                ScreenshotModule?.openNotificationSettings?.();
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            Alert.alert('Error', 'Failed to request notification permission');
        }
    };

    const requestMicrophonePermission = async () => {
        try {
            if (Platform.OS !== 'android') return;

            const result = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                {
                    title: 'Microphone Permission',
                    message: 'SmartShot needs microphone access to record audio notes.',
                    buttonPositive: 'Allow',
                    buttonNegative: 'Deny',
                }
            );

            const granted = result === PermissionsAndroid.RESULTS.GRANTED;
            setMicrophonePermission(granted);

            if (granted) {
                Alert.alert('Success', 'Microphone permission granted!');
            } else {
                Alert.alert(
                    'Permission Denied',
                    'Microphone permission is required to record audio notes. You can enable it in Settings.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => Linking.openSettings() }
                    ]
                );
            }
        } catch (error) {
            console.error('Error requesting microphone permission:', error);
            Alert.alert('Error', 'Failed to request microphone permission');
        }
    };

    const toggleBackgroundService = async () => {
        try {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                if (backgroundService) {
                    await ScreenshotModule.stopScreenshotDetection();
                    setBackgroundService(false);
                    await AsyncStorage.setItem(BG_PREF_KEY, 'false');
                    Alert.alert('Service Stopped', 'Background screenshot detection has been stopped.');
                } else {
                    await ScreenshotModule.startScreenshotDetection();
                    setBackgroundService(true);
                    await AsyncStorage.setItem(BG_PREF_KEY, 'true');
                    Alert.alert('Service Started', 'Background screenshot detection has been started.');
                }
            }
        } catch (error) {
            console.error('Error toggling background service:', error);
            Alert.alert('Error', 'Failed to toggle background service');
        }
    };

    const openAppSettings = () => {
        Alert.alert(
            'App Settings',
            'To manage all permissions, please go to your device Settings > Apps > SmartShot > Permissions',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Open Settings', onPress: () => {
                        // This would open device settings - you might need to implement this
                        console.log('Opening device settings...');
                    }
                }
            ]
        );
    };

    const PermissionItem = ({ title, description, value, onPress, buttonText }) => (
        <View style={styles.permissionItem}>
            <View style={styles.permissionInfo}>
                <ThemedText style={styles.permissionTitle}>{title}</ThemedText>
                <ThemedText style={styles.permissionDescription}>{description}</ThemedText>
            </View>
            <View style={styles.permissionAction}>
                <ThemedText style={[styles.permissionStatus, { color: value ? '#4CAF50' : '#F44336' }]}>
                    {value ? 'Granted' : 'Denied'}
                </ThemedText>
                <TouchableOpacity style={styles.permissionButton} onPress={onPress}>
                    <ThemedText style={styles.permissionButtonText}>{buttonText}</ThemedText>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <ThemedView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <ThemedText type="title" style={styles.title}>
                        Settings
                    </ThemedText>
                    <ThemedText style={styles.subtitle}>
                        Manage permissions and app preferences
                    </ThemedText>
                </View>

                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Permissions</ThemedText>

                    <PermissionItem
                        title="Storage Access"
                        description="Required to view and manage your images"
                        value={storagePermission}
                        onPress={requestStoragePermission}
                        buttonText="Grant"
                    />

                    <PermissionItem
                        title="Notifications"
                        description="Required for background screenshot detection"
                        value={notificationPermission}
                        onPress={requestNotificationPermission}
                        buttonText="Enable"
                    />

                    <PermissionItem
                        title="Microphone"
                        description="Required to record audio notes for screenshots"
                        value={microphonePermission}
                        onPress={requestMicrophonePermission}
                        buttonText={microphonePermission ? 'Manage' : 'Grant'}
                    />
                </View>

                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Background Service</ThemedText>

                    <View style={styles.serviceItem}>
                        <View style={styles.serviceInfo}>
                            <ThemedText style={styles.serviceTitle}>Screenshot Detection</ThemedText>
                            <ThemedText style={styles.serviceDescription}>
                                Automatically detect and organize screenshots in the background
                            </ThemedText>
                        </View>
                        <Switch
                            value={backgroundService}
                            onValueChange={toggleBackgroundService}
                            trackColor={{ false: '#767577', true: '#8B5CF6' }}
                            thumbColor={backgroundService ? '#fff' : '#f4f3f4'}
                        />
                    </View>
                </View>

                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>App Info</ThemedText>

                    <TouchableOpacity style={styles.infoItem} onPress={openAppSettings}>
                        <ThemedText style={styles.infoTitle}>Device Settings</ThemedText>
                        <ThemedText style={styles.infoDescription}>
                            Open device settings to manage all permissions
                        </ThemedText>
                        <ThemedText style={styles.infoArrow}>›</ThemedText>
                    </TouchableOpacity>

                    <View style={styles.infoItem}>
                        <ThemedText style={styles.infoTitle}>Version</ThemedText>
                        <ThemedText style={styles.infoDescription}>1.0.0</ThemedText>
                    </View>
                </View>

                <View style={styles.footer}>
                    <ThemedText style={styles.footerText}>
                        SmartShot - Your intelligent screenshot organizer
                    </ThemedText>
                </View>
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    scrollView: {
        flex: 1,
    },
    header: {
        padding: 20,
        paddingTop: 60,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        textAlign: 'center',
        marginBottom: 5,
        color: '#8B5CF6',
    },
    subtitle: {
        textAlign: 'center',
        color: '#666',
        fontSize: 14,
    },
    section: {
        marginTop: 20,
        backgroundColor: '#fff',
        marginHorizontal: 16,
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 16,
    },
    permissionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    permissionInfo: {
        flex: 1,
        marginRight: 12,
    },
    permissionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    permissionDescription: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    permissionAction: {
        alignItems: 'flex-end',
    },
    permissionStatus: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
    },
    permissionButton: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    permissionButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    serviceItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    serviceInfo: {
        flex: 1,
        marginRight: 12,
    },
    serviceTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    serviceDescription: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    infoItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    infoDescription: {
        fontSize: 14,
        color: '#666',
        marginRight: 8,
    },
    infoArrow: {
        fontSize: 18,
        color: '#ccc',
    },
    footer: {
        padding: 20,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12,
        color: '#999',
        textAlign: 'center',
    },
});
