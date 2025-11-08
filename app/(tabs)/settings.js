import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppTheme as theme } from '@/constants/theme';
import { autoSetupStorageFolder, checkFolderForData, getExternalStoragePath, getPersistedBackupDirUri, hasBackupDirectory, mergeAndSyncData, pickBackupDirectory, requestStoragePermission, restoreFromBackup } from '@/utils/fileStorage';
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
    const [backupConfigured, setBackupConfigured] = useState(false);
    const [storageFolderSelected, setStorageFolderSelected] = useState(false);
    const [storageFolderPath, setStorageFolderPath] = useState('');
    const [storageError, setStorageError] = useState(null);
    const BG_PREF_KEY = 'backgroundServiceEnabled';

    useEffect(() => {
        checkPermissions();
        checkBackup();
        checkStorageFolder(); // Check storage folder on mount
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

    const checkBackup = async () => {
        try {
            const ok = await hasBackupDirectory();
            setBackupConfigured(ok);
        } catch (_) {
            setBackupConfigured(false);
        }
    };

    const checkStorageFolder = async () => {
        try {
            // Check if user has selected a storage folder via SAF
            const safDirUri = await getPersistedBackupDirUri();
            if (safDirUri) {
                setStorageFolderSelected(true);
                setStorageFolderPath(safDirUri);
                setStorageError(null);
                return;
            }

            // Check if there's an auto-created folder path
            const externalPath = await getExternalStoragePath();
            if (externalPath) {
                setStorageFolderSelected(true);
                // Show a friendly path instead of the full file path
                const displayPath = externalPath.includes('/SmartShot/') || externalPath.includes('SmartShot')
                    ? externalPath.includes('/Pictures/SmartShot') || externalPath.includes('Pictures/SmartShot')
                        ? 'Pictures/SmartShot folder (auto-created)'
                        : externalPath.includes('/Download/SmartShot') || externalPath.includes('Download/SmartShot')
                            ? 'Download/SmartShot folder (auto-created)'
                            : 'SmartShot folder (auto-created)'
                    : externalPath;
                setStorageFolderPath(displayPath);
                setStorageError(null);
            } else {
                setStorageFolderSelected(false);
                setStorageFolderPath('');

                // Try to auto-create and get error details if it fails
                try {
                    const setupResult = await autoSetupStorageFolder(false);
                    if (!setupResult?.success && setupResult?.error) {
                        setStorageError(setupResult);
                    } else {
                        // If setup succeeded, check again
                        const newPath = await getExternalStoragePath();
                        if (newPath) {
                            setStorageFolderSelected(true);
                            const displayPath = newPath.includes('/SmartShot/') || newPath.includes('SmartShot')
                                ? newPath.includes('/Pictures/SmartShot') || newPath.includes('Pictures/SmartShot')
                                    ? 'Pictures/SmartShot folder (auto-created)'
                                    : newPath.includes('/Download/SmartShot') || newPath.includes('Download/SmartShot')
                                        ? 'Download/SmartShot folder (auto-created)'
                                        : 'SmartShot folder (auto-created)'
                                : newPath;
                            setStorageFolderPath(displayPath);
                            setStorageError(null);
                        } else {
                            setStorageError(setupResult);
                        }
                    }
                } catch (setupError) {
                    setStorageError({
                        error: `Failed to set up storage: ${setupError?.message || String(setupError)}`,
                        errorDetails: setupError?.stack || String(setupError)
                    });
                }
            }
        } catch (error) {
            console.error('Error checking storage folder:', error);
            setStorageFolderSelected(false);
            setStorageFolderPath('');
            setStorageError({
                error: `Error checking storage: ${error?.message || String(error)}`,
                errorDetails: error?.stack || String(error)
            });
        }
    };

    const onPickBackup = async () => {
        const res = await pickBackupDirectory();
        if (res?.granted) {
            setBackupConfigured(true);
            await checkStorageFolder(); // Update storage folder status
            Alert.alert('Backup Folder', 'Backup folder selected. Your edits will mirror there automatically.');
        } else {
            Alert.alert('Cancelled', 'No folder selected. You can set it later.');
        }
    };

    const onSelectStorageFolder = async () => {
        try {
            const res = await pickBackupDirectory();

            // Check if user cancelled
            if (res?.cancelled) {
                // User cancelled - don't show error, just return silently
                return;
            }

            // Check for errors
            if (res?.error && !res?.granted) {
                Alert.alert(
                    'Error Selecting Folder',
                    `Failed to select folder:\n\n${res.error}\n\nPlease try again.`,
                    [
                        { text: 'OK' },
                        {
                            text: 'Retry',
                            onPress: () => onSelectStorageFolder()
                        }
                    ]
                );
                return;
            }

            if (res?.granted && res?.directoryUri) {
                await checkStorageFolder(); // Update storage folder status

                // Check if there's existing data in the selected folder
                let folderData = null;
                try {
                    folderData = await checkFolderForData(res.directoryUri);
                } catch (checkError) {
                    Alert.alert(
                        'Error Reading Folder',
                        `Cannot read data from the selected folder:\n\n${checkError?.message || 'Unknown error'}\n\nPlease make sure the folder contains valid data and try again.`,
                        [{ text: 'OK' }]
                    );
                    return;
                }

                if (folderData && folderData.screenshots > 0) {
                    // Import the data
                    try {
                        // Show loading message
                        Alert.alert(
                            'Importing Data...',
                            `Found ${folderData.screenshots} screenshot${folderData.screenshots !== 1 ? 's' : ''} in the selected folder. Importing now...`,
                            [],
                            { cancelable: false }
                        );

                        const mergedScreenshots = await mergeAndSyncData(folderData.data);

                        // Verify the data was saved by reading it back
                        const verifyData = await getAllScreenshots();

                        // Show success message with data counts
                        const tagsText = folderData.tags > 0
                            ? `\n• ${folderData.tags} unique tag${folderData.tags !== 1 ? 's' : ''} found`
                            : '';

                        let verifyText = '';
                        if (verifyData.length > 0) {
                            verifyText = `\n\n✓ Verified: ${verifyData.length} screenshot${verifyData.length !== 1 ? 's' : ''} now available in the app.`;
                            if (verifyData.length !== folderData.screenshots) {
                                verifyText += `\n\nNote: ${folderData.screenshots - verifyData.length} duplicate${folderData.screenshots - verifyData.length !== 1 ? 's' : ''} were merged with existing data.`;
                            }
                        } else {
                            verifyText = '\n\n⚠ Warning: Data imported but may not be visible yet. Please navigate to Screenshots or Tags screen to see your data.';
                        }

                        Alert.alert(
                            'Data Imported Successfully!',
                            `Storage folder selected and data imported!\n\n• ${folderData.screenshots} screenshot${folderData.screenshots !== 1 ? 's' : ''} found${tagsText}${verifyText}\n\nYour data will now be saved to this location and will persist even if you uninstall the app.`,
                            [
                                {
                                    text: 'OK',
                                    onPress: () => {
                                        // The screens will auto-refresh when opened via useFocusEffect
                                    }
                                }
                            ]
                        );
                    } catch (importError) {
                        const errorMsg = importError?.message || String(importError) || 'Unknown error';
                        Alert.alert(
                            'Import Error',
                            `Storage folder selected! However, there was an issue importing existing data:\n\n${errorMsg}\n\nPlease try selecting the folder again, or check if the folder contains valid data.`,
                            [
                                { text: 'OK' },
                                {
                                    text: 'Retry',
                                    onPress: () => onSelectStorageFolder()
                                }
                            ]
                        );
                    }
                } else {
                    // No existing data, just show success
                    Alert.alert(
                        'Success',
                        'Storage folder selected! Your data will now be saved to this location and will persist even if you uninstall the app.',
                        [
                            { text: 'OK' }
                        ]
                    );
                }
            } else {
                // This shouldn't happen if we handle cancellation above, but just in case
                if (!res?.cancelled) {
                    Alert.alert(
                        'Error',
                        `No folder selected. ${res?.error ? '\n\n' + res.error : 'Your data will only be saved to internal storage.'}`
                    );
                }
            }
        } catch (error) {
            console.error('Error selecting storage folder:', error);
            Alert.alert('Error', `Failed to select folder: ${error?.message || String(error)}`);
        }
    };

    const onRestoreBackup = async () => {
        try {
            const ok = await restoreFromBackup();
            if (ok) {
                Alert.alert('Restored', 'Data restored from backup.');
            } else {
                Alert.alert('Restore', 'No backup file found in the selected folder.');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to restore from backup.');
        }
    };

    const requestStoragePermissionForMedia = async () => {
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

    const requestStoragePermissionForData = async () => {
        try {
            if (Platform.OS !== 'android') return;

            // Request WRITE_EXTERNAL_STORAGE for Android 10-12 to save data persistently
            const hasPermission = await requestStoragePermission();

            if (hasPermission) {
                // Try to set up storage folder automatically
                Alert.alert('Setting up folder...', 'Creating storage folder...', [], { cancelable: false });

                const folderResult = await autoSetupStorageFolder(true);
                await checkStorageFolder(); // Update UI

                if (folderResult?.success) {
                    if (folderResult.alreadyExists) {
                        Alert.alert('Success', 'Storage permission granted! Your data folder is already set up and ready to use.');
                    } else {
                        Alert.alert('Success', 'Storage permission granted and folder created! Your data will be saved to external storage.');
                    }
                    setStorageError(null);
                } else {
                    // Store error to show in UI
                    setStorageError(folderResult);
                    Alert.alert(
                        'Permission Granted',
                        `Storage permission granted, but folder creation failed.\n\n${folderResult?.error || 'Unknown error'}\n\nPlease check the error details below or select a folder manually.`,
                        [
                            { text: 'OK' },
                            {
                                text: 'Select Folder',
                                onPress: () => onSelectStorageFolder()
                            }
                        ]
                    );
                }
            } else {
                Alert.alert(
                    'Permission Denied',
                    'Storage permission is required to save your data persistently. You can still use the app, but data may not persist after uninstalling.',
                    [
                        { text: 'OK' },
                        {
                            text: 'Select Folder',
                            onPress: () => onSelectStorageFolder()
                        }
                    ]
                );
            }
        } catch (error) {
            console.error('Error requesting storage permission:', error);
            Alert.alert('Error', `Failed to request storage permission: ${error?.message || String(error)}`);
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
                    message: 'SmartShot needs microphone access to record audio  notes.',
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
                        onPress={requestStoragePermissionForMedia}
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

                {false && (<View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Data Storage</ThemedText>

                    <View style={styles.storageItem}>
                        <View style={styles.storageInfo}>
                            <ThemedText style={styles.storageTitle}>Persistent Storage Folder</ThemedText>
                            <ThemedText style={styles.storageDescription}>
                                Select a folder to save your data so it persists even if you uninstall the app
                            </ThemedText>
                            {storageFolderSelected && storageFolderPath && (
                                <ThemedText style={styles.storagePath}>
                                    Current: {storageFolderPath.length > 50 ? storageFolderPath.substring(0, 50) + '...' : storageFolderPath}
                                </ThemedText>
                            )}
                            {Platform.OS === 'android' && Platform.Version >= 29 && Platform.Version < 33 && !storageFolderSelected && (
                                <ThemedText style={[styles.storageDescription, { marginTop: 8, color: '#E65100' }]}>
                                    Note: Storage permission is required for Android 10-12. Please grant permission first.
                                </ThemedText>
                            )}
                        </View>
                        <View style={{ gap: 8 }}>
                            {Platform.OS === 'android' && Platform.Version >= 29 && Platform.Version < 33 && !storageFolderSelected && (
                                <TouchableOpacity
                                    style={[styles.storageButton, { backgroundColor: '#FF9800' }]}
                                    onPress={requestStoragePermissionForData}
                                >
                                    <ThemedText style={styles.storageButtonText}>
                                        Grant Storage Permission
                                    </ThemedText>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[styles.storageButton, storageFolderSelected && styles.storageButtonSelected]}
                                onPress={onSelectStorageFolder}
                            >
                                <ThemedText style={styles.storageButtonText}>
                                    {storageFolderSelected ? 'Change Folder' : 'Select Folder'}
                                </ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {storageFolderSelected && (
                        <View style={styles.storageStatus}>
                            <ThemedText style={styles.storageStatusText}>
                                ✓ Data will persist after app uninstall
                            </ThemedText>
                        </View>
                    )}

                    {!storageFolderSelected && (
                        <View style={styles.storageWarning}>
                            <ThemedText style={styles.storageWarningText}>
                                ⚠ No folder selected. Data will be lost if you uninstall the app.
                            </ThemedText>
                        </View>
                    )}

                    {storageError && (
                        <View style={styles.storageError}>
                            <ThemedText style={styles.storageErrorTitle}>
                                ⚠ Folder Creation Error
                            </ThemedText>
                            <ThemedText style={styles.storageErrorText}>
                                {storageError.error}
                            </ThemedText>
                            {storageError.errorDetails && (
                                <ThemedText style={styles.storageErrorDetails}>
                                    Details: {storageError.errorDetails}
                                </ThemedText>
                            )}
                            {Platform.OS === 'android' && Platform.Version >= 29 && Platform.Version < 33 && (
                                <ThemedText style={styles.storageErrorHint}>
                                    Hint: Grant storage permission and try again, or select a folder manually.
                                </ThemedText>
                            )}
                        </View>
                    )}
                </View>)}

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
        backgroundColor: theme.bg,
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
        backgroundColor: theme.card,
        marginVertical: 12,
        marginHorizontal: 16,
        borderRadius: theme.radius,
        padding: 16,
        ...theme.shadow,
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
        borderBottomWidth: 0.5,
        borderBottomColor: theme.border,
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
    storageItem: {
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.border,
    },
    storageInfo: {
        marginBottom: 12,
    },
    storageTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    storageDescription: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
        marginBottom: 8,
    },
    storagePath: {
        fontSize: 12,
        color: '#999',
        fontStyle: 'italic',
        marginTop: 4,
    },
    storageButton: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    storageButtonSelected: {
        backgroundColor: '#6B46C1',
    },
    storageButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    storageStatus: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#E8F5E9',
        borderRadius: 8,
    },
    storageStatusText: {
        fontSize: 14,
        color: '#2E7D32',
        fontWeight: '500',
    },
    storageWarning: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#FFF3E0',
        borderRadius: 8,
    },
    storageWarningText: {
        fontSize: 14,
        color: '#E65100',
        fontWeight: '500',
    },
    storageError: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#FFEBEE',
        borderRadius: 8,
        borderLeftWidth: 4,
        borderLeftColor: '#F44336',
    },
    storageErrorTitle: {
        fontSize: 14,
        color: '#C62828',
        fontWeight: '600',
        marginBottom: 6,
    },
    storageErrorText: {
        fontSize: 13,
        color: '#D32F2F',
        marginBottom: 4,
        lineHeight: 18,
    },
    storageErrorDetails: {
        fontSize: 11,
        color: '#B71C1C',
        marginTop: 4,
        fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
        lineHeight: 16,
    },
    storageErrorHint: {
        fontSize: 12,
        color: '#E65100',
        marginTop: 8,
        fontStyle: 'italic',
    },
});
