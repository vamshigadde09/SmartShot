import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity, NativeModules, Platform, PermissionsAndroid, Linking } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { ScreenshotDetector } from '../../components/ScreenshotDetector';

export default function ScreenshotPageSimple() {
    const [screenshotCount, setScreenshotCount] = useState(0);
    const [lastScreenshotTime, setLastScreenshotTime] = useState(null);
    const [permissionsGranted, setPermissionsGranted] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState('Checking...');
    const [backgroundServiceRunning, setBackgroundServiceRunning] = useState(false);

    const handleScreenshotDetected = () => {
        console.log('ScreenshotPage: Screenshot detected!');
        setScreenshotCount(prev => prev + 1);
        setLastScreenshotTime(new Date().toLocaleString());

        // Show an alert when screenshot is detected
        Alert.alert(
            'Screenshot Detected! 📸',
            'A screenshot was just taken of this app.',
            [{ text: 'OK' }]
        );
    };

    // Check permissions on component mount
    useEffect(() => {
        checkPermissions();
        checkBackgroundServiceStatus();
        // Start background service when component mounts
        startBackgroundService();
    }, []);

    const checkPermissions = async () => {
        if (Platform.OS !== 'android') {
            setPermissionStatus('iOS - No permissions needed');
            setPermissionsGranted(true);
            return;
        }

        try {
            setPermissionStatus('Checking permissions...');
            const ScreenshotModule = NativeModules.ScreenshotModule;

            if (ScreenshotModule) {
                console.log('Checking permissions via native module...');

                // Check permissions individually for better error handling
                let hasStorage = false;
                let hasNotification = false;

                try {
                    hasStorage = await ScreenshotModule.checkStoragePermission();
                    console.log('Storage permission check result:', hasStorage);
                } catch (storageError) {
                    console.error('Error checking storage permission:', storageError);
                }

                try {
                    hasNotification = await ScreenshotModule.checkNotificationPermission();
                    console.log('Notification permission check result:', hasNotification);
                } catch (notificationError) {
                    console.error('Error checking notification permission:', notificationError);
                }

                const allGranted = hasStorage && hasNotification;
                setPermissionsGranted(allGranted);

                if (allGranted) {
                    setPermissionStatus('All permissions granted ✅');
                } else {
                    const missingPermissions = [];
                    if (!hasStorage) missingPermissions.push('Storage');
                    if (!hasNotification) missingPermissions.push('Notifications');
                    setPermissionStatus(`Missing: ${missingPermissions.join(', ')} ❌`);
                }

                console.log('Final permission status:', { hasStorage, hasNotification, allGranted });
            } else {
                setPermissionStatus('Module not available ❌');
                setPermissionsGranted(false);
            }
        } catch (error) {
            console.error('Error checking permissions:', error);
            setPermissionStatus(`Error: ${error.message} ❌`);
            setPermissionsGranted(false);
        }
    };

    const requestPermissions = async () => {
        if (Platform.OS !== 'android') {
            Alert.alert('Error', 'Permissions only needed on Android');
            return;
        }

        try {
            setPermissionStatus('Requesting permissions...');

            const permissions = [];
            const permissionResults = {};

            // Request storage permission based on Android version
            if (Platform.Version >= 33) { // Android 13+
                permissions.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES);
                permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
            } else {
                permissions.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
            }

            // Request all permissions
            const results = await PermissionsAndroid.requestMultiple(permissions);

            // Check if all permissions were granted
            const allGranted = Object.values(results).every(
                result => result === PermissionsAndroid.RESULTS.GRANTED
            );

            if (allGranted) {
                setPermissionsGranted(true);
                setPermissionStatus('All permissions granted ✅');

                // Restart detection with new permissions
                const ScreenshotModule = NativeModules.ScreenshotModule;
                if (ScreenshotModule) {
                    ScreenshotModule.restartDetection();
                }

                Alert.alert(
                    'Success!',
                    'All permissions have been granted. Screenshot detection is now active.',
                    [{ text: 'OK' }]
                );
            } else {
                setPermissionsGranted(false);
                setPermissionStatus('Some permissions denied ❌');
                Alert.alert(
                    'Permissions Required',
                    'Some permissions were denied. Screenshot detection may not work properly. You can grant permissions in Settings.',
                    [
                        { text: 'Cancel' },
                        {
                            text: 'Open Settings',
                            onPress: () => Linking.openSettings()
                        }
                    ]
                );
            }
        } catch (error) {
            console.error('Error requesting permissions:', error);
            setPermissionStatus('Error requesting permissions ❌');
            Alert.alert('Error', 'Failed to request permissions. Please try again.');
        }
    };

    const testDetection = () => {
        console.log('ScreenshotPage: Testing detection...');
        handleScreenshotDetected();
    };

    const checkRecentImages = async () => {
        console.log('ScreenshotPage: Checking recent images...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    // Check permissions first
                    const hasStorage = await ScreenshotModule.checkStoragePermission();
                    if (!hasStorage) {
                        Alert.alert(
                            'Permission Required',
                            'Storage permission is required to check recent images. Please grant storage permission first.',
                            [
                                { text: 'Cancel' },
                                { text: 'Grant Permission', onPress: requestPermissions }
                            ]
                        );
                        return;
                    }

                    ScreenshotModule.checkRecentImages();
                    Alert.alert(
                        'Debug',
                        'Recent images check completed. Check Android logs for details. Look for "ScreenshotModule" in logcat.',
                        [{ text: 'OK' }]
                    );
                } catch (error) {
                    console.error('Error checking recent images:', error);
                    Alert.alert('Error', `Failed to check recent images: ${error.message}`);
                }
            } else {
                Alert.alert('Error', 'ScreenshotModule not available');
            }
        } else {
            Alert.alert('Error', 'Check only available on Android');
        }
    };

    const testNotification = () => {
        console.log('ScreenshotPage: Testing notification...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                ScreenshotModule.testNotification();
                Alert.alert('Test', 'Notification test triggered. Check if you received a notification.');
            } else {
                Alert.alert('Error', 'ScreenshotModule not available');
            }
        } else {
            Alert.alert('Error', 'Test only available on Android');
        }
    };

    const checkNotificationPermission = async () => {
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    const hasPermission = await ScreenshotModule.checkNotificationPermission();
                    Alert.alert(
                        'Notification Permission',
                        `Notifications are ${hasPermission ? 'enabled' : 'disabled'}. ${hasPermission ? 'You should see notifications when screenshots are detected.' : 'Please enable notifications in device settings.'}`
                    );
                } catch (error) {
                    console.error('Error checking notification permission:', error);
                    Alert.alert('Error', `Failed to check notification permission: ${error.message}`);
                }
            } else {
                Alert.alert('Error', 'ScreenshotModule not available');
            }
        } else {
            Alert.alert('Error', 'Check only available on Android');
        }
    };

    const debugPermissions = async () => {
        console.log('=== DEBUG PERMISSIONS ===');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    console.log('Checking all permissions...');
                    const allPermissions = await ScreenshotModule.checkPermissions();
                    const storagePermission = await ScreenshotModule.checkStoragePermission();
                    const notificationPermission = await ScreenshotModule.checkNotificationPermission();

                    console.log('All permissions:', allPermissions);
                    console.log('Storage permission:', storagePermission);
                    console.log('Notification permission:', notificationPermission);

                    Alert.alert(
                        'Debug Permissions',
                        `All: ${allPermissions}\nStorage: ${storagePermission}\nNotifications: ${notificationPermission}`
                    );
                } catch (error) {
                    console.error('Debug permissions error:', error);
                    Alert.alert('Debug Error', `Error: ${error.message}`);
                }
            } else {
                Alert.alert('Error', 'ScreenshotModule not available');
            }
        } else {
            Alert.alert('Error', 'Debug only available on Android');
        }
    };

    const startBackgroundService = () => {
        console.log('Starting background service...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    ScreenshotModule.startBackgroundService();
                    setBackgroundServiceRunning(true);
                    console.log('Background service started');
                } catch (error) {
                    console.error('Error starting background service:', error);
                }
            }
        }
    };

    const stopBackgroundService = () => {
        console.log('Stopping background service...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    ScreenshotModule.stopBackgroundService();
                    setBackgroundServiceRunning(false);
                    Alert.alert('Service Stopped', 'Background screenshot detection has been stopped.');
                } catch (error) {
                    console.error('Error stopping background service:', error);
                    Alert.alert('Error', `Failed to stop service: ${error.message}`);
                }
            }
        }
    };

    const checkBackgroundServiceStatus = async () => {
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    const isRunning = await ScreenshotModule.isBackgroundServiceRunning();
                    setBackgroundServiceRunning(isRunning);
                    console.log('Background service running:', isRunning);
                } catch (error) {
                    console.error('Error checking background service status:', error);
                }
            }
        }
    };

    const restartBackgroundService = () => {
        console.log('Restarting background service...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    ScreenshotModule.restartBackgroundService();
                    setBackgroundServiceRunning(true);
                    Alert.alert('Service Restarted', 'Background service has been restarted.');
                } catch (error) {
                    console.error('Error restarting background service:', error);
                    Alert.alert('Error', `Failed to restart service: ${error.message}`);
                }
            }
        }
    };

    const fixNotificationChannel = () => {
        console.log('Fixing notification channel...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    ScreenshotModule.recreateNotificationChannel();
                    Alert.alert('Notification Fixed', 'Notification channel has been recreated with proper sound settings. Try taking a screenshot now!');
                } catch (error) {
                    console.error('Error fixing notification channel:', error);
                    Alert.alert('Error', `Failed to fix notifications: ${error.message}`);
                }
            }
        }
    };

    const openNotificationSettings = () => {
        console.log('Opening notification settings...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                try {
                    ScreenshotModule.openNotificationSettings();
                    Alert.alert(
                        'Notification Settings',
                        'Please ensure that:\n1. Notifications are enabled\n2. Sound is enabled\n3. Vibration is enabled\n4. Importance is set to High',
                        [{ text: 'OK' }]
                    );
                } catch (error) {
                    console.error('Error opening notification settings:', error);
                    Alert.alert('Error', `Failed to open settings: ${error.message}`);
                }
            }
        }
    };

    return (
        <ScrollView style={styles.container}>
            <ScreenshotDetector
                onScreenshotDetected={handleScreenshotDetected}
                permissionsGranted={permissionsGranted}
            />
            <ThemedView style={styles.content}>
                <ThemedText type="title" style={styles.title}>
                    Screenshot Detection
                </ThemedText>

                <ThemedText style={styles.description}>
                    This page detects when someone takes a screenshot of the app and shows a notification.
                </ThemedText>

                <View style={styles.permissionContainer}>
                    <ThemedText type="subtitle" style={styles.permissionTitle}>
                        Permission Status
                    </ThemedText>

                    <View style={styles.permissionStatus}>
                        <ThemedText style={styles.permissionText}>{permissionStatus}</ThemedText>
                    </View>

                    {!permissionsGranted && Platform.OS === 'android' && (
                        <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
                            <ThemedText style={styles.permissionButtonText}>
                                Grant Permissions
                            </ThemedText>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.refreshButton} onPress={checkPermissions}>
                        <ThemedText style={styles.refreshButtonText}>
                            Refresh Status
                        </ThemedText>
                    </TouchableOpacity>

                    <View style={styles.serviceStatus}>
                        <ThemedText style={styles.serviceStatusText}>
                            Background Service: {backgroundServiceRunning ? 'Running ✅' : 'Stopped ❌'}
                        </ThemedText>
                    </View>
                </View>

                <View style={styles.statsContainer}>
                    <ThemedText type="subtitle" style={styles.statsTitle}>
                        Screenshot Statistics
                    </ThemedText>

                    <View style={styles.statItem}>
                        <ThemedText style={styles.statLabel}>Total Screenshots:</ThemedText>
                        <ThemedText style={styles.statValue}>{screenshotCount}</ThemedText>
                    </View>

                    {lastScreenshotTime && (
                        <View style={styles.statItem}>
                            <ThemedText style={styles.statLabel}>Last Screenshot:</ThemedText>
                            <ThemedText style={styles.statValue}>{lastScreenshotTime}</ThemedText>
                        </View>
                    )}
                </View>

                <View style={styles.instructionsContainer}>
                    <ThemedText type="subtitle" style={styles.instructionsTitle}>
                        How to Test
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        1. Make sure all permissions are granted (see above)
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        2. Start the background service (blue button)
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        3. Take a screenshot using your device's screenshot function
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        4. You should see a notification and the counter will increase
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        5. Background detection works even when app is closed
                    </ThemedText>

                    <TouchableOpacity style={styles.testButton} onPress={testDetection}>
                        <ThemedText style={styles.testButtonText}>
                            Test Detection (Simulate Screenshot)
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.debugButton} onPress={checkRecentImages}>
                        <ThemedText style={styles.debugButtonText}>
                            Check Recent Images (Debug)
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.notificationButton} onPress={testNotification}>
                        <ThemedText style={styles.notificationButtonText}>
                            Test Notification
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.permissionCheckButton} onPress={checkNotificationPermission}>
                        <ThemedText style={styles.permissionCheckButtonText}>
                            Check Notification Permission
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.debugPermissionsButton} onPress={debugPermissions}>
                        <ThemedText style={styles.debugPermissionsButtonText}>
                            Debug All Permissions
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.backgroundServiceButton} onPress={startBackgroundService}>
                        <ThemedText style={styles.backgroundServiceButtonText}>
                            Start Background Service
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.stopServiceButton} onPress={stopBackgroundService}>
                        <ThemedText style={styles.stopServiceButtonText}>
                            Stop Background Service
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.restartButton} onPress={restartBackgroundService}>
                        <ThemedText style={styles.restartButtonText}>
                            Restart Background Service
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.fixNotificationButton} onPress={fixNotificationChannel}>
                        <ThemedText style={styles.fixNotificationButtonText}>
                            Fix Silent Notifications
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.settingsButton} onPress={openNotificationSettings}>
                        <ThemedText style={styles.settingsButtonText}>
                            Open Notification Settings
                        </ThemedText>
                    </TouchableOpacity>
                </View>
            </ThemedView>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        padding: 20,
    },
    title: {
        textAlign: 'center',
        marginBottom: 20,
        color: '#8B5CF6',
    },
    description: {
        textAlign: 'center',
        marginBottom: 30,
        fontSize: 16,
        lineHeight: 24,
    },
    statsContainer: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    statsTitle: {
        marginBottom: 15,
        color: '#8B5CF6',
    },
    statItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    statLabel: {
        fontSize: 16,
        fontWeight: '500',
    },
    statValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#8B5CF6',
    },
    instructionsContainer: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    instructionsTitle: {
        marginBottom: 15,
        color: '#8B5CF6',
    },
    instruction: {
        fontSize: 14,
        marginBottom: 8,
        lineHeight: 20,
    },
    testButton: {
        backgroundColor: '#8B5CF6',
        padding: 15,
        borderRadius: 8,
        marginTop: 15,
        alignItems: 'center',
    },
    testButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    debugButton: {
        backgroundColor: '#FF6B6B',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    debugButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    permissionContainer: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    permissionTitle: {
        marginBottom: 15,
        color: '#8B5CF6',
    },
    permissionStatus: {
        backgroundColor: '#f8f9fa',
        padding: 12,
        borderRadius: 8,
        marginBottom: 15,
    },
    permissionText: {
        fontSize: 16,
        fontWeight: '500',
        textAlign: 'center',
    },
    permissionButton: {
        backgroundColor: '#8B5CF6',
        padding: 15,
        borderRadius: 8,
        marginBottom: 10,
        alignItems: 'center',
    },
    permissionButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    refreshButton: {
        backgroundColor: '#6C757D',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    refreshButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    serviceStatus: {
        backgroundColor: '#e8f5e8',
        padding: 12,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    serviceStatusText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#2e7d32',
    },
    notificationButton: {
        backgroundColor: '#4CAF50',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    notificationButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    permissionCheckButton: {
        backgroundColor: '#FF9800',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    permissionCheckButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    debugPermissionsButton: {
        backgroundColor: '#9C27B0',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    debugPermissionsButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    backgroundServiceButton: {
        backgroundColor: '#2196F3',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    backgroundServiceButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    stopServiceButton: {
        backgroundColor: '#F44336',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    stopServiceButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    restartButton: {
        backgroundColor: '#FF9800',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    restartButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    fixNotificationButton: {
        backgroundColor: '#9C27B0',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    fixNotificationButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    settingsButton: {
        backgroundColor: '#607D8B',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    settingsButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
