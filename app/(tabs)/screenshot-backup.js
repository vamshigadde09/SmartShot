import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity, NativeModules, Platform, Linking, PermissionsAndroid } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { ScreenshotDetector } from '../../components/ScreenshotDetector';
import { useFocusEffect } from '@react-navigation/native';

export default function ScreenshotPage() {
    const [screenshotCount, setScreenshotCount] = useState(0);
    const [lastScreenshotTime, setLastScreenshotTime] = useState(null);
    const [latestScreenshotUri, setLatestScreenshotUri] = useState(null);
    const [permissionsGranted, setPermissionsGranted] = useState(false);

    const handleScreenshotDetected = (event) => {
        console.log('ScreenshotPage: Screenshot detected!', event);
        setScreenshotCount(prev => prev + 1);
        setLastScreenshotTime(new Date().toLocaleString());

        // Store the latest screenshot URI if provided
        if (event?.uri) {
            setLatestScreenshotUri(event.uri);
        }

        // Show an alert when screenshot is detected
        Alert.alert(
            'Screenshot Detected! 📸',
            'A screenshot was just taken of this app.',
            [
                { text: 'OK' },
                {
                    text: 'Open Gallery',
                    onPress: () => {
                        if (event?.uri) {
                            Linking.openURL(event.uri);
                        }
                    }
                }
            ]
        );
    };

    const testDetection = () => {
        console.log('ScreenshotPage: Testing detection...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                ScreenshotModule.testDetection();
            } else {
                Alert.alert('Error', 'ScreenshotModule not available');
            }
        } else {
            Alert.alert('Error', 'Test only available on Android');
        }
    };

    const checkRecentImages = () => {
        console.log('ScreenshotPage: Checking recent images...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                ScreenshotModule.checkRecentImages();
                Alert.alert('Debug', 'Check Android logs for recent images. Look for "ScreenshotModule" in logcat.');
            } else {
                Alert.alert('Error', 'ScreenshotModule not available');
            }
        } else {
            Alert.alert('Error', 'Check only available on Android');
        }
    };

    const startBackgroundService = () => {
        console.log('ScreenshotPage: Starting background service...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                ScreenshotModule.startBackgroundService();
                Alert.alert('Success', 'Background service started! Screenshots will be detected even when app is closed.');
            } else {
                Alert.alert('Error', 'ScreenshotModule not available');
            }
        } else {
            Alert.alert('Error', 'Background service only available on Android');
        }
    };

    const requestPermissions = async () => {
        if (Platform.OS !== 'android') {
            Alert.alert('Error', 'Permissions only needed on Android');
            return;
        }

        try {
            // Request permissions one by one to avoid crashes
            const storagePermission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
                {
                    title: 'Storage Permission',
                    message: 'This app needs access to storage to detect screenshots.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );

            const mediaPermission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
                {
                    title: 'Media Permission',
                    message: 'This app needs access to media files to detect screenshots.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );

            const notificationPermission = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
                {
                    title: 'Notification Permission',
                    message: 'This app needs to show notifications when screenshots are detected.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );

            const allGranted =
                storagePermission === PermissionsAndroid.RESULTS.GRANTED &&
                mediaPermission === PermissionsAndroid.RESULTS.GRANTED &&
                notificationPermission === PermissionsAndroid.RESULTS.GRANTED;

            if (allGranted) {
                setPermissionsGranted(true);
                Alert.alert('Success', 'All permissions granted! Screenshot detection is now enabled.');
            } else {
                Alert.alert('Permission Denied', 'Some permissions were denied. Screenshot detection may not work properly.');
            }
        } catch (err) {
            console.warn('Permission request error:', err);
            Alert.alert('Error', 'Failed to request permissions');
        }
    };

    const checkPermissions = async () => {
        try {
            if (Platform.OS === 'android') {
                const ScreenshotModule = NativeModules.ScreenshotModule;
                if (ScreenshotModule) {
                    const hasPermissions = ScreenshotModule.checkPermissions();
                    setPermissionsGranted(hasPermissions);
                    return hasPermissions;
                }
            }
            return false;
        } catch (error) {
            console.warn('Error checking permissions:', error);
            return false;
        }
    };

  useEffect(() => {
    // Delay permission checking to avoid crashes on tab load
    const timer = setTimeout(() => {
      checkPermissions();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

    return (
        <ScrollView style={styles.container}>
            <ThemedView style={styles.content}>
                <ThemedText type="title" style={styles.title}>
                    Screenshot Detection
                </ThemedText>

                <ThemedText style={styles.description}>
                    This page detects when someone takes a screenshot of the app and shows a notification.
                </ThemedText>

                {!permissionsGranted && (
                    <View style={styles.permissionContainer}>
                        <ThemedText type="subtitle" style={styles.permissionTitle}>
                            ⚠️ Permissions Required
                        </ThemedText>
                        <ThemedText style={styles.permissionText}>
                            To detect screenshots, the app needs access to your media files and notifications.
                        </ThemedText>
                        <TouchableOpacity style={styles.permissionButton} onPress={requestPermissions}>
                            <ThemedText style={styles.permissionButtonText}>
                                Grant Permissions
                            </ThemedText>
                        </TouchableOpacity>
                    </View>
                )}

                {permissionsGranted && (
                    <View style={styles.statusContainer}>
                        <ThemedText type="subtitle" style={styles.statusTitle}>
                            ✅ Permissions Granted
                        </ThemedText>
                        <ThemedText style={styles.statusText}>
                            Screenshot detection is enabled and ready to work!
                        </ThemedText>
                    </View>
                )}

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
                        1. Take a screenshot using your device's screenshot function
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        2. You should see a notification and the counter will increase
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        3. The last screenshot time will be updated
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

                    <TouchableOpacity style={styles.serviceButton} onPress={startBackgroundService}>
                        <ThemedText style={styles.serviceButtonText}>
                            Start Background Service
                        </ThemedText>
                    </TouchableOpacity>
                </View>

                {latestScreenshotUri && (
                    <View style={styles.latestScreenshotContainer}>
                        <ThemedText type="subtitle" style={styles.latestScreenshotTitle}>
                            Latest Screenshot
                        </ThemedText>
                        <TouchableOpacity
                            style={styles.openGalleryButton}
                            onPress={() => Linking.openURL(latestScreenshotUri)}
                        >
                            <ThemedText style={styles.openGalleryButtonText}>
                                📸 Open Gallery
                            </ThemedText>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Screenshot Detector Component */}
                {permissionsGranted && (
                  <ScreenshotDetector onScreenshotDetected={handleScreenshotDetected} />
                )}
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
        color: '#8B5CF6', // Purple accent color as per user preference
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
    serviceButton: {
        backgroundColor: '#4CAF50',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    serviceButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    latestScreenshotContainer: {
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
    latestScreenshotTitle: {
        marginBottom: 15,
        color: '#8B5CF6',
    },
    openGalleryButton: {
        backgroundColor: '#8B5CF6',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
    },
    openGalleryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    permissionContainer: {
        backgroundColor: '#FFF3CD',
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: '#FFC107',
    },
    permissionTitle: {
        marginBottom: 10,
        color: '#856404',
    },
    permissionText: {
        marginBottom: 15,
        color: '#856404',
        lineHeight: 20,
    },
    permissionButton: {
        backgroundColor: '#FFC107',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    permissionButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: 'bold',
    },
    statusContainer: {
        backgroundColor: '#D4EDDA',
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: '#28A745',
    },
    statusTitle: {
        marginBottom: 10,
        color: '#155724',
    },
    statusText: {
        color: '#155724',
        lineHeight: 20,
    },
});
