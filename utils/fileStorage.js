import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules, Platform } from 'react-native';

const STORAGE_FILE = FileSystem.documentDirectory + 'screenshots.json';
const BACKUP_DIR_KEY = 'smartshot.backup.dirUri';
const BACKUP_FILENAME = 'screenshots.json';
const EXTERNAL_STORAGE_KEY = 'smartshot.externalStoragePath';

// Android SAF helper
const SAF = FileSystem.StorageAccessFramework;

// Export for use in settings screen
export async function getPersistedBackupDirUri() {
    try {
        return await AsyncStorage.getItem(BACKUP_DIR_KEY);
    } catch (_e) {
        return null;
    }
}

async function setPersistedBackupDirUri(dirUri) {
    try {
        if (dirUri) {
            await AsyncStorage.setItem(BACKUP_DIR_KEY, dirUri);
        } else {
            await AsyncStorage.removeItem(BACKUP_DIR_KEY);
        }
    } catch (_e) { }
}

async function ensureBackupFile(dirUri) {
    try {
        const entries = await SAF.readDirectoryAsync(dirUri);
        const existing = entries.find(u => u.toLowerCase().includes('/' + BACKUP_FILENAME.toLowerCase()));
        if (existing) return existing;
        // Create file if not exists
        return await SAF.createFileAsync(dirUri, BACKUP_FILENAME, 'application/json');
    } catch (e) {
        console.error('Error ensuring backup file:', e);
        throw e;
    }
}

async function writeBackupJson(jsonString) {
    try {
        const dirUri = await getPersistedBackupDirUri();
        if (!dirUri) return false;
        const fileUri = await ensureBackupFile(dirUri);
        await SAF.writeAsStringAsync(fileUri, jsonString);
        return true;
    } catch (e) {
        console.warn('Backup write failed (continuing without external backup):', e?.message || e);
        return false;
    }
}

async function readBackupJson() {
    try {
        const dirUri = await getPersistedBackupDirUri();
        if (!dirUri) return null;
        const entries = await SAF.readDirectoryAsync(dirUri);
        const fileUri = entries.find(u => u.toLowerCase().includes('/' + BACKUP_FILENAME.toLowerCase()));
        if (!fileUri) return null;
        return await SAF.readAsStringAsync(fileUri);
    } catch (e) {
        console.warn('Backup read failed:', e?.message || e);
        return null;
    }
}

// Request storage permission for external storage
export async function requestStoragePermission() {
    if (Platform.OS !== 'android') return false;

    try {
        const { PermissionsAndroid } = require('react-native');

        // For Android 13+ (API 33+), we don't need WRITE_EXTERNAL_STORAGE
        // For Android 10-12 (API 29-32), we need WRITE_EXTERNAL_STORAGE
        // For Android 9 and below, we need WRITE_EXTERNAL_STORAGE
        if (Platform.Version >= 29 && Platform.Version < 33) {
            // First check if permission is already granted
            const hasPermission = await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
            );

            if (hasPermission) {
                return true; // Already granted
            }

            // Request permission
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                {
                    title: 'Storage Permission Required',
                    message: 'SmartShot needs storage permission to save your data to external storage so it persists even if you uninstall the app.',
                    buttonNeutral: 'Ask Me Later',
                    buttonNegative: 'Cancel',
                    buttonPositive: 'OK',
                }
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        }

        // For Android 13+, we can't write to /storage/emulated/0/ without user-selected folder
        // But we can still try - Android 13+ doesn't require WRITE_EXTERNAL_STORAGE for app-specific dirs
        // However, we need to use SAF for persistent storage
        // For now, return true and let the app try to create the folder
        // If it fails, user will need to select a folder
        return true;
    } catch (error) {
        console.warn('Error requesting storage permission:', error);
        return false;
    }
}

// Get external storage path - prioritize SAF folder, then fallback to hardcoded paths
export async function getExternalStoragePath() {
    try {
        // First, check if user has selected a folder via SAF (Storage Access Framework)
        const safDirUri = await getPersistedBackupDirUri();
        if (safDirUri) {
            try {
                // Use SAF to get the file path
                const fileUri = await ensureBackupFile(safDirUri);
                // Store it as the external storage path
                await AsyncStorage.setItem(EXTERNAL_STORAGE_KEY, fileUri);
                return fileUri;
            } catch (e) {
                console.warn('SAF folder access failed, trying fallback:', e);
            }
        }

        // Try to get persisted external storage path (from previous hardcoded path)
        const savedPath = await AsyncStorage.getItem(EXTERNAL_STORAGE_KEY);
        if (savedPath) {
            try {
                const info = await FileSystem.getInfoAsync(savedPath);
                if (info.exists) return savedPath;
            } catch (e) {
                // Path doesn't exist anymore, continue to create new one
                console.log('Saved path no longer exists, creating new one');
            }
        }

        // Try to automatically use Download/SmartShot (more accessible on Android 10+)
        if (Platform.OS === 'android') {
            // On Android 10+, app-specific directories are NOT suitable for persistent storage
            // because: 1) They're deleted on uninstall, 2) Expo FileSystem blocks writes to them
            // Users MUST select a folder via SAF for persistent storage on Android 10+
            if (Platform.Version >= 29) {
                // Don't try app-specific or Downloads - they won't work for persistence
                // Return null to indicate user needs to select folder via SAF
                console.warn('Android 10+: External storage requires SAF folder selection for persistence');
                return null;
            }

            // Request permission first (for Downloads folder on older Android)
            const hasPermission = await requestStoragePermission();
            if (!hasPermission && Platform.Version < 33) {
                console.warn('Storage permission denied, cannot access external storage');
                // Return null to trigger SAF folder picker
                return null;
            }

            const SmartShotPaths = [
                'file:///storage/emulated/0/Pictures/SmartShot',
                'file:///sdcard/Pictures/SmartShot',
                '/storage/emulated/0/Pictures/SmartShot',
                '/sdcard/Pictures/SmartShot',
                'file:///storage/emulated/0/Download/SmartShot',
                'file:///sdcard/Download/SmartShot',
                '/storage/emulated/0/Download/SmartShot',
                '/sdcard/Download/SmartShot',
                'file:///storage/emulated/0/SmartShot',
                'file:///sdcard/SmartShot',
                '/storage/emulated/0/SmartShot',
                '/sdcard/SmartShot',
            ];

            for (const path of SmartShotPaths) {
                try {
                    const fullPath = path.startsWith('file://') ? path : `file://${path}`;
                    const dirInfo = await FileSystem.getInfoAsync(fullPath);
                    if (dirInfo.exists && dirInfo.isDirectory) {
                        const filePath = fullPath + '/' + BACKUP_FILENAME;
                        await AsyncStorage.setItem(EXTERNAL_STORAGE_KEY, filePath);
                        return filePath;
                    }
                } catch (e) {
                    // Try next path
                }
            }
        }
        return null;
    } catch (error) {
        console.error('Error getting external storage path:', error);
        return null;
    }
}

// Ensure external storage directory exists
async function ensureExternalStorage() {
    try {
        if (Platform.OS === 'android') {
            const externalPath = await getExternalStoragePath();
            if (!externalPath) {
                // Try to create Download/SmartShot (more accessible on Android 10+)
                const dirPaths = [
                    'file:///storage/emulated/0/Download/SmartShot',
                    '/storage/emulated/0/Download/SmartShot',
                    'file:///sdcard/Download/SmartShot',
                    '/sdcard/Download/SmartShot',
                    'file:///storage/emulated/0/SmartShot',
                    '/storage/emulated/0/SmartShot',
                    'file:///sdcard/SmartShot',
                    '/sdcard/SmartShot',
                ];

                for (const dirPath of dirPaths) {
                    try {
                        const fullPath = dirPath.startsWith('file://') ? dirPath : `file://${dirPath}`;
                        const dirInfo = await FileSystem.getInfoAsync(fullPath);

                        if (!dirInfo.exists) {
                            // Try to create directory using native module if available
                            if (NativeModules.ScreenshotModule?.createExternalStorageDirectory) {
                                try {
                                    const success = await NativeModules.ScreenshotModule.createExternalStorageDirectory();
                                    if (success) {
                                        // Use the path that native module created (Pictures/SmartShot)
                                        // Try Pictures path first, then Download, then fallback to root
                                        const picturesPath = 'file:///storage/emulated/0/Pictures/SmartShot';
                                        const downloadPath = 'file:///storage/emulated/0/Download/SmartShot';
                                        const rootPath = 'file:///storage/emulated/0/SmartShot';

                                        let nativePath = picturesPath;
                                        try {
                                            const picturesInfo = await FileSystem.getInfoAsync(picturesPath);
                                            if (!picturesInfo.exists) {
                                                // Check if Download path exists (fallback)
                                                try {
                                                    const downloadInfo = await FileSystem.getInfoAsync(downloadPath);
                                                    if (downloadInfo.exists) {
                                                        nativePath = downloadPath;
                                                    } else {
                                                        // Check if root path exists (final fallback)
                                                        const rootInfo = await FileSystem.getInfoAsync(rootPath);
                                                        if (rootInfo.exists) {
                                                            nativePath = rootPath;
                                                        }
                                                    }
                                                } catch (e) {
                                                    // Try root path as fallback
                                                    try {
                                                        const rootInfo = await FileSystem.getInfoAsync(rootPath);
                                                        if (rootInfo.exists) {
                                                            nativePath = rootPath;
                                                        }
                                                    } catch (e2) {
                                                        // Use Pictures path by default
                                                    }
                                                }
                                            }
                                        } catch (e) {
                                            // Try Download path as fallback
                                            try {
                                                const downloadInfo = await FileSystem.getInfoAsync(downloadPath);
                                                if (downloadInfo.exists) {
                                                    nativePath = downloadPath;
                                                } else {
                                                    // Try root path as final fallback
                                                    try {
                                                        const rootInfo = await FileSystem.getInfoAsync(rootPath);
                                                        if (rootInfo.exists) {
                                                            nativePath = rootPath;
                                                        }
                                                    } catch (e2) {
                                                        // Use Pictures path by default
                                                    }
                                                }
                                            } catch (e2) {
                                                // Use Pictures path by default
                                            }
                                        }

                                        const filePath = nativePath + '/' + BACKUP_FILENAME;
                                        await AsyncStorage.setItem(EXTERNAL_STORAGE_KEY, filePath);
                                        return filePath;
                                    }
                                } catch (e) {
                                    console.warn('Native directory creation failed:', e);
                                }
                            }

                            // Fallback: try with expo-file-system
                            try {
                                await FileSystem.makeDirectoryAsync(fullPath, { intermediates: true });
                            } catch (e) {
                                console.warn('Expo FileSystem directory creation failed:', e);
                                // Continue to next path
                                continue;
                            }
                        }

                        const filePath = fullPath + '/' + BACKUP_FILENAME;
                        await AsyncStorage.setItem(EXTERNAL_STORAGE_KEY, filePath);
                        return filePath;
                    } catch (e) {
                        console.warn(`Could not create directory at ${dirPath}:`, e);
                        // Try next path
                    }
                }
            }
            return externalPath;
        }
        return null;
    } catch (error) {
        console.error('Error ensuring external storage:', error);
        return null;
    }
}

// Write to external storage
export async function writeToExternalStorage(jsonString) {
    try {
        // First, try to use SAF folder if user has selected one
        const safDirUri = await getPersistedBackupDirUri();
        if (safDirUri) {
            try {
                // Ensure the file exists in the selected folder
                let fileUri;
                try {
                    fileUri = await ensureBackupFile(safDirUri);
                } catch (ensureError) {
                    // If ensureBackupFile fails, try to create the file directly
                    try {
                        fileUri = await SAF.createFileAsync(safDirUri, BACKUP_FILENAME, 'application/json');
                    } catch (createError) {
                        // If direct creation also fails, try to find existing file
                        try {
                            const entries = await SAF.readDirectoryAsync(safDirUri);
                            const existing = entries.find(u => {
                                const lower = u.toLowerCase();
                                return lower.includes(BACKUP_FILENAME.toLowerCase()) ||
                                    (lower.includes('screenshot') && lower.endsWith('.json'));
                            });
                            if (existing) {
                                fileUri = existing;
                            } else {
                                throw new Error(`Cannot access folder: ${ensureError?.message || String(ensureError)}`);
                            }
                        } catch (readError) {
                            throw new Error(`Cannot access folder: ${ensureError?.message || String(ensureError)}`);
                        }
                    }
                }

                // Write using SAF API
                try {
                    await SAF.writeAsStringAsync(fileUri, jsonString);
                    return true;
                } catch (writeError) {
                    throw new Error(`Failed to write to file: ${writeError?.message || String(writeError)}`);
                }
            } catch (safError) {
                // Don't fall back if SAF folder is selected - show the error
                const errorMsg = safError?.message || String(safError) || 'Unknown SAF error';
                throw new Error(`Failed to write to selected folder: ${errorMsg}`);
            }
        }

        // Fallback to hardcoded path (only if no SAF folder is selected)
        let externalPath = await getExternalStoragePath();
        if (!externalPath) {
            externalPath = await ensureExternalStorage();
        }

        if (externalPath) {
            // Check if it's a SAF URI (content://) or file path
            if (externalPath.startsWith('content://')) {
                // SAF URI - use SAF API
                try {
                    await SAF.writeAsStringAsync(externalPath, jsonString);
                    return true;
                } catch (safError) {
                    console.error('SAF write failed:', safError);
                    throw new Error(`SAF write failed: ${safError?.message || String(safError)}`);
                }
            } else {
                // File path - use FileSystem API
                const filePath = externalPath.startsWith('file://') ? externalPath : `file://${externalPath}`;

                // On Android 10+, direct file:// writes to /storage/emulated/0 are restricted
                // Try to write, but if it fails, suggest using SAF or app-specific directory
                try {
                    // Check if directory exists, create if not
                    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
                    try {
                        const dirInfo = await FileSystem.getInfoAsync(dirPath);
                        if (!dirInfo.exists) {
                            await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
                        }
                    } catch (dirError) {
                        // Try to create directory if it doesn't exist
                        try {
                            await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
                        } catch (createError) {
                            // If directory creation fails, try native module
                            if (NativeModules?.ScreenshotModule?.createExternalStorageDirectory) {
                                try {
                                    await NativeModules.ScreenshotModule.createExternalStorageDirectory();
                                } catch (nativeError) {
                                    console.warn('Native directory creation failed:', nativeError);
                                }
                            }
                        }
                    }

                    // Try to write the file
                    await FileSystem.writeAsStringAsync(filePath, jsonString);
                    return true;
                } catch (writeError) {
                    // On Android 10+, direct writes to /storage/emulated/0 may fail
                    // Check if this is a permission/access issue
                    const errorMsg = writeError?.message || String(writeError);
                    const errorCode = writeError?.code || '';
                    const errorStack = writeError?.stack || '';

                    // Build detailed error message
                    let detailedError = `Failed to write to external storage.\n\n`;
                    detailedError += `Path: ${filePath}\n`;
                    detailedError += `Platform: ${Platform.OS} ${Platform.Version}\n`;
                    detailedError += `Error Code: ${errorCode || 'N/A'}\n`;
                    detailedError += `Error Message: ${errorMsg}\n`;

                    if (Platform.OS === 'android' && Platform.Version >= 29) {
                        detailedError += `\nAndroid 10+ Scoped Storage Issue:\n`;
                        detailedError += `- Direct writes to /storage/emulated/0 are RESTRICTED\n`;
                        detailedError += `- Downloads folder and app-specific directories CANNOT be used for persistent storage\n`;
                        detailedError += `- App-specific directories are DELETED when app is uninstalled\n`;
                        detailedError += `- REQUIRED: Use "Select Folder" in Settings to choose a folder via Storage Access Framework (SAF)\n`;
                        detailedError += `- SAF is the ONLY way to persist data after uninstall on Android 10+\n`;
                    }

                    if (errorMsg.includes('IOException') ||
                        errorMsg.includes('rejected') ||
                        errorMsg.includes('permission') ||
                        errorMsg.includes('Location')) {
                        detailedError += `\nRoot Cause: ${errorMsg}`;
                        throw new Error(detailedError);
                    }

                    // For other errors, include full details
                    detailedError += `\nFull Error Details:\n${errorStack || errorMsg}`;
                    throw new Error(detailedError);
                }
            }
        }
        return false;
    } catch (error) {
        console.error('Error writing to external storage:', error);
        console.error('Error details:', error?.message, error?.stack);
        // Re-throw to provide better error messages
        throw error;
    }
}

// Read from external storage
export async function readFromExternalStorage() {
    try {
        // First, try to use SAF folder if user has selected one
        const safDirUri = await getPersistedBackupDirUri();
        if (safDirUri) {
            try {
                // Use SAF to read from the selected folder
                const entries = await SAF.readDirectoryAsync(safDirUri);

                // Look for the backup file - check for exact match first, then numbered backups (screenshots.json.1, .2, etc.)
                let fileUri = entries.find(u => {
                    if (!u) return false;
                    const lower = u.toLowerCase();
                    return lower.endsWith('/' + BACKUP_FILENAME.toLowerCase()) ||
                        lower.endsWith(BACKUP_FILENAME.toLowerCase());
                });

                // If no exact match, look for numbered backups and get the latest one
                if (!fileUri) {
                    const numberedFiles = entries
                        .filter(u => {
                            if (!u) return false;
                            const lower = u.toLowerCase();
                            return lower.includes(BACKUP_FILENAME.toLowerCase()) &&
                                lower.match(/\.\d+$/); // Ends with .1, .2, etc.
                        })
                        .sort((a, b) => {
                            // Sort by number (extract number from filename)
                            const numA = parseInt(a.match(/\.(\d+)$/)?.[1] || '0');
                            const numB = parseInt(b.match(/\.(\d+)$/)?.[1] || '0');
                            return numB - numA; // Descending order (latest first)
                        });

                    if (numberedFiles.length > 0) {
                        fileUri = numberedFiles[0]; // Use the latest numbered backup
                    } else {
                        // Fallback: any file with screenshots and .json
                        fileUri = entries.find(u => {
                            if (!u) return false;
                            const lower = u.toLowerCase();
                            return lower.includes('screenshot') && lower.endsWith('.json');
                        });
                    }
                }

                if (fileUri) {
                    const content = await SAF.readAsStringAsync(fileUri);
                    console.log('Successfully read from SAF folder:', safDirUri, 'File:', fileUri);
                    return content;
                }
            } catch (safError) {
                console.warn('SAF read failed, trying fallback:', safError);
            }
        }

        // Fallback to hardcoded path
        const externalPath = await getExternalStoragePath();
        if (!externalPath) return null;

        // Check if it's a SAF URI (content://) or file path
        if (externalPath.startsWith('content://')) {
            // SAF URI - use SAF API
            try {
                return await SAF.readAsStringAsync(externalPath);
            } catch (safError) {
                console.warn('SAF read failed:', safError);
                return null;
            }
        } else {
            // File path - use FileSystem API
            try {
                const fileInfo = await FileSystem.getInfoAsync(externalPath);
                if (!fileInfo.exists) {
                    // Check for numbered backups (screenshots.json.1, .2, etc.)
                    const dirPath = externalPath.substring(0, externalPath.lastIndexOf('/'));
                    try {
                        const dirInfo = await FileSystem.getInfoAsync(dirPath);
                        if (dirInfo.exists && dirInfo.isDirectory) {
                            // Try to find numbered backups
                            for (let i = 7; i >= 1; i--) {
                                const backupPath = `${dirPath}/${BACKUP_FILENAME}.${i}`;
                                try {
                                    const backupInfo = await FileSystem.getInfoAsync(backupPath);
                                    if (backupInfo.exists) {
                                        const content = await FileSystem.readAsStringAsync(backupPath);
                                        console.log('Found and restored from numbered backup:', backupPath);
                                        return content;
                                    }
                                } catch (e) {
                                    // Continue to next backup
                                }
                            }
                        }
                    } catch (dirError) {
                        // Directory doesn't exist
                    }
                    return null;
                }

                return await FileSystem.readAsStringAsync(externalPath);
            } catch (error) {
                console.warn('Error reading from external storage:', error);
                return null;
            }
        }
    } catch (error) {
        console.warn('Error reading from external storage:', error);
        return null;
    }
}

// Automatically set up persistent storage folder
export const autoSetupStorageFolder = async (showAlert = false) => {
    try {
        // Check if we already have a folder selected
        const existingFolder = await getPersistedBackupDirUri();
        if (existingFolder) {
            // Already have a folder, verify it still works
            try {
                const entries = await SAF.readDirectoryAsync(existingFolder);
                return { success: true, alreadyExists: true }; // Folder is valid
            } catch (e) {
                // Folder might have been removed, continue to set up new one
            }
        }

        // Check if we already have an external storage path set
        const existingPath = await AsyncStorage.getItem(EXTERNAL_STORAGE_KEY);
        if (existingPath) {
            try {
                const pathInfo = await FileSystem.getInfoAsync(existingPath);
                if (pathInfo.exists) {
                    // Path exists and is valid
                    return { success: true, alreadyExists: true };
                }
            } catch (e) {
                // Path might be invalid, continue to create new one
            }
        }

        // Try to automatically create and use storage directory
        if (Platform.OS === 'android') {
            // On Android 10+, app-specific directories and Downloads won't work for persistent storage
            // Users MUST select a folder via SAF (Storage Access Framework)
            // Reasons:
            // 1. App-specific directories are deleted on uninstall (not persistent)
            // 2. Expo FileSystem blocks writes to app-specific directories via file:// URIs
            // 3. Downloads folder requires special permissions and may be blocked
            if (Platform.Version >= 29) {
                return {
                    success: false,
                    alreadyExists: false,
                    error: 'Android 10+ requires folder selection via Settings. App-specific directories are deleted on uninstall and Expo FileSystem blocks writes to them.',
                    errorDetails: 'Please use "Select Folder" in Settings to choose a folder via Storage Access Framework (SAF) for data that persists after uninstall. This is the ONLY way to save data persistently on Android 10+.',
                    requiresSAF: true
                };
            }

            // Request permission first (for Android 9 and below using Downloads)
            const hasPermission = await requestStoragePermission();

            // If permission was denied, we can't create the folder automatically
            if (!hasPermission) {
                return {
                    success: false,
                    alreadyExists: false,
                    error: 'Storage permission denied. Please grant storage permission or select a folder via Settings.',
                    requiresSAF: true
                };
            }

            const dirPaths = [
                'file:///storage/emulated/0/Pictures/SmartShot',
                '/storage/emulated/0/Pictures/SmartShot',
                'file:///sdcard/Pictures/SmartShot',
                '/sdcard/Pictures/SmartShot',
                'file:///storage/emulated/0/Download/SmartShot',
                '/storage/emulated/0/Download/SmartShot',
                'file:///sdcard/Download/SmartShot',
                '/sdcard/Download/SmartShot',
                'file:///storage/emulated/0/SmartShot',
                '/storage/emulated/0/SmartShot',
                'file:///sdcard/SmartShot',
                '/sdcard/SmartShot',
            ];

            for (const dirPath of dirPaths) {
                try {
                    const fullPath = dirPath.startsWith('file://') ? dirPath : `file://${dirPath}`;

                    // Check if directory exists
                    let dirInfo;
                    try {
                        dirInfo = await FileSystem.getInfoAsync(fullPath);
                    } catch (infoError) {
                        // If getInfoAsync fails, directory might not exist, try to create it
                        dirInfo = { exists: false };
                    }

                    // Create directory if it doesn't exist
                    if (!dirInfo || !dirInfo.exists) {
                        let creationError = null;

                        // Try native module first (more reliable)
                        if (NativeModules?.ScreenshotModule?.createExternalStorageDirectory) {
                            try {
                                const nativeSuccess = await NativeModules.ScreenshotModule.createExternalStorageDirectory();
                                if (nativeSuccess) {
                                    // Verify it was created
                                    try {
                                        dirInfo = await FileSystem.getInfoAsync(fullPath);
                                    } catch (verifyError) {
                                        creationError = `Native module reported success but directory verification failed: ${verifyError?.message || String(verifyError)}`;
                                    }
                                } else {
                                    creationError = 'Native module returned false - directory creation failed';
                                }
                            } catch (nativeError) {
                                // Native module rejected with detailed error
                                const errorCode = nativeError?.code || '';
                                const errorMessage = nativeError?.message || String(nativeError);

                                if (errorCode === 'PERMISSION_DENIED') {
                                    creationError = `Permission denied: ${errorMessage}. Please grant WRITE_EXTERNAL_STORAGE permission for Android 10-12.`;
                                } else if (errorCode === 'WRITE_DENIED') {
                                    creationError = `Cannot write to external storage: ${errorMessage}. Permission may be denied or storage may be full.`;
                                } else if (errorCode === 'CREATION_FAILED') {
                                    creationError = `Directory creation failed: ${errorMessage}. Check permissions and storage space.`;
                                } else if (errorCode === 'VERIFICATION_FAILED') {
                                    creationError = `Directory verification failed: ${errorMessage}. Directory may have been created but cannot be verified.`;
                                } else if (errorCode === 'NOT_A_DIRECTORY') {
                                    creationError = `Path exists but is not a directory: ${errorMessage}`;
                                } else {
                                    creationError = `Native module error (${errorCode || 'UNKNOWN'}): ${errorMessage}`;
                                }
                            }
                        }

                        // If native module didn't work or doesn't exist, try expo-file-system
                        if (!dirInfo || !dirInfo.exists) {
                            if (!creationError) {
                                try {
                                    await FileSystem.makeDirectoryAsync(fullPath, { intermediates: true });
                                    // Verify it was created
                                    try {
                                        dirInfo = await FileSystem.getInfoAsync(fullPath);
                                    } catch (verifyError) {
                                        creationError = `FileSystem.makeDirectoryAsync reported success but directory verification failed: ${verifyError?.message || String(verifyError)}`;
                                    }
                                } catch (createError) {
                                    creationError = `FileSystem.makeDirectoryAsync failed: ${createError?.message || String(createError)}`;
                                }
                            }

                            // If still failed, try next path
                            if (!dirInfo || !dirInfo.exists) {
                                if (dirPaths.indexOf(dirPath) === dirPaths.length - 1) {
                                    // Last path failed, return error
                                    return {
                                        success: false,
                                        alreadyExists: false,
                                        error: `Failed to create folder at all attempted paths. Last error: ${creationError || 'Unknown error'}`,
                                        errorDetails: creationError || 'Directory creation failed at all paths',
                                        attemptedPaths: dirPaths
                                    };
                                }
                                continue;
                            }
                        }
                    }

                    // Verify directory exists and is actually a directory
                    if (dirInfo && dirInfo.exists && dirInfo.isDirectory) {
                        // Store the file path for external storage
                        const filePath = fullPath + '/' + BACKUP_FILENAME;
                        await AsyncStorage.setItem(EXTERNAL_STORAGE_KEY, filePath);

                        // Success - folder created and stored
                        return { success: true, alreadyExists: false, path: fullPath };
                    }
                } catch (e) {
                    // Error with this path, try next one
                    if (dirPaths.indexOf(dirPath) === dirPaths.length - 1) {
                        // Last path failed, return error
                        return {
                            success: false,
                            alreadyExists: false,
                            error: `Failed to create folder: ${e?.message || String(e)}`,
                            errorDetails: `Error processing path ${dirPath}: ${e?.message || String(e)}`
                        };
                    }
                    continue;
                }
            }
        }

        return {
            success: false,
            alreadyExists: false,
            error: 'Folder creation failed: No valid paths could be accessed',
            errorDetails: 'All attempted folder paths failed. Please check storage permissions and available space.'
        };
    } catch (error) {
        // Auto-setup failed, but that's okay
        return {
            success: false,
            alreadyExists: false,
            error: `Unexpected error: ${error?.message || String(error)}`,
            errorDetails: error?.stack || String(error)
        };
    }
};

export const initializeDatabase = async () => {
    try {
        // Automatically set up storage folder if not already set
        await autoSetupStorageFolder(false); // Don't show alert here, it's handled in _layout.tsx

        // First, try to restore from external storage if local file doesn't exist
        const localFileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (!localFileInfo.exists) {
            const externalData = await readFromExternalStorage();
            if (externalData) {
                // Restore from external storage
                await FileSystem.writeAsStringAsync(STORAGE_FILE, externalData);
                console.log('Restored data from external storage');
            } else {
                // Create new empty file
                const emptyData = JSON.stringify([]);
                await FileSystem.writeAsStringAsync(STORAGE_FILE, emptyData);
                // Also write to external storage
                await writeToExternalStorage(emptyData);
            }
        } else {
            // Sync local data to external storage
            const localData = await FileSystem.readAsStringAsync(STORAGE_FILE);
            await writeToExternalStorage(localData);
        }

        // Ensure external storage is set up
        await ensureExternalStorage();

        return true;
    } catch (error) {
        console.error('Error initializing file storage:', error);
        return false;
    }
};

export const saveScreenshotData = async (data) => {
    try {
        // Validate data
        if (!data || !data.id) {
            console.error('Invalid data provided to saveScreenshotData:', data);
            return false;
        }

        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        let screenshots = [];

        if (fileInfo.exists) {
            try {
                const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
                screenshots = JSON.parse(fileContent);
                if (!Array.isArray(screenshots)) {
                    screenshots = [];
                }
            } catch (parseError) {
                console.warn('Error parsing existing screenshots file, starting fresh:', parseError);
                screenshots = [];
            }
        }

        const now = new Date().toISOString();
        const existingIndex = screenshots.findIndex(s => String(s.id) === String(data.id));

        const screenshotData = {
            ...data,
            createdAt: data.createdAt || now,
            updatedAt: now
        };

        if (existingIndex >= 0) {
            screenshots[existingIndex] = screenshotData;
        } else {
            screenshots.push(screenshotData);
        }

        const jsonString = JSON.stringify(screenshots);

        // Write to both local and external storage
        try {
            await FileSystem.writeAsStringAsync(STORAGE_FILE, jsonString);
            console.log('Successfully wrote to local storage:', STORAGE_FILE);
        } catch (writeError) {
            const errorMsg = `Failed to write to local storage: ${writeError?.message || String(writeError)}`;
            console.error('Error writing to local storage:', writeError);
            console.error('Storage file path:', STORAGE_FILE);
            console.error('Data size:', jsonString.length, 'bytes');
            console.error('Screenshots count:', screenshots.length);
            throw new Error(`${errorMsg}\nPath: ${STORAGE_FILE}\nData size: ${jsonString.length} bytes`);
        }

        // Write to external storage (primary persistent storage)
        // Don't fail the entire save if external storage fails - just log the error
        try {
            const externalResult = await writeToExternalStorage(jsonString);
            if (externalResult) {
                console.log('Successfully wrote to external storage');
            } else {
                console.warn('External storage write returned false');
                // Try to get more details about why it failed
                const safDirUri = await getPersistedBackupDirUri();
                if (safDirUri) {
                    console.warn('SAF folder is selected but write failed:', safDirUri);
                }
            }
        } catch (externalError) {
            // Log the error but don't fail the entire save operation
            console.error('Error writing to external storage:', externalError);
            console.error('Error details:', externalError?.message, externalError?.stack);
            // Don't re-throw - allow the save to succeed even if external storage fails
            // The edit screen will check and show the error separately
        }

        // Also write to SAF backup if configured (fire and forget)
        writeBackupJson(jsonString).catch(() => { });

        return true;
    } catch (error) {
        const errorDetails = {
            message: error?.message || String(error) || 'Unknown error',
            name: error?.name || 'Error',
            stack: error?.stack || 'No stack trace',
            data: {
                id: data?.id,
                hasUri: !!data?.uri,
                hasTags: !!data?.tags,
                hasText: !!data?.text,
                hasAudio: !!data?.audio,
            }
        };
        console.error('Error saving screenshot data:', errorDetails);
        console.error('Full error object:', error);
        // Re-throw with more details
        throw new Error(`Save failed: ${errorDetails.message}\nError type: ${errorDetails.name}\nData ID: ${data?.id || 'N/A'}`);
    }
};

export const loadScreenshotData = async (id) => {
    try {
        // Normalize ID to string for comparison
        const searchId = String(id);

        // Try local storage first
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (fileInfo.exists) {
            const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
            const screenshots = JSON.parse(fileContent);
            // Try multiple comparison methods
            const found = screenshots.find(s =>
                String(s.id) === searchId ||
                s.id === id ||
                String(s.id) === String(id)
            );
            if (found) return found;
        }

        // If not found locally, try external storage
        const externalData = await readFromExternalStorage();
        if (externalData) {
            const screenshots = JSON.parse(externalData);
            // Try multiple comparison methods
            const found = screenshots.find(s =>
                String(s.id) === searchId ||
                s.id === id ||
                String(s.id) === String(id)
            );
            if (found) return found;
        }

        return null;
    } catch (error) {
        console.error('Error loading screenshot data:', error);
        return null;
    }
};

// Merge external data with local data and sync
export const mergeAndSyncData = async (externalScreenshots) => {
    try {
        if (!externalScreenshots || !Array.isArray(externalScreenshots) || externalScreenshots.length === 0) {
            throw new Error('No valid data to import');
        }

        let screenshots = [];

        // Try local storage first
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (fileInfo.exists) {
            try {
                const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
                const localScreenshots = JSON.parse(fileContent);
                if (localScreenshots && Array.isArray(localScreenshots) && localScreenshots.length > 0) {
                    screenshots = localScreenshots;
                }
            } catch (e) {
                // If local storage is corrupted, start fresh
                screenshots = [];
            }
        }

        // Merge with local, preferring external for duplicates
        const mergedMap = new Map();

        // Add local screenshots first
        for (const item of screenshots) {
            if (item && item.id) {
                mergedMap.set(String(item.id), item);
            }
        }

        // Add/update with external screenshots (external takes precedence)
        for (const item of externalScreenshots) {
            if (item && item.id) {
                mergedMap.set(String(item.id), item);
            }
        }

        screenshots = Array.from(mergedMap.values());

        // Sync merged data back to local storage
        if (screenshots.length > 0) {
            try {
                const jsonString = JSON.stringify(screenshots);
                await FileSystem.writeAsStringAsync(STORAGE_FILE, jsonString);

                // Also write to external storage to keep it in sync
                try {
                    await writeToExternalStorage(jsonString);
                } catch (externalWriteError) {
                    // Non-fatal - data is saved locally
                }
            } catch (e) {
                throw new Error(`Failed to save imported data: ${e?.message || 'Unknown error'}`);
            }
        } else {
            throw new Error('No valid screenshots found after merge');
        }

        return screenshots;
    } catch (error) {
        // Re-throw with better error message
        if (error.message) {
            throw error;
        }
        throw new Error(`Import failed: ${error?.message || String(error)}`);
    }
};

export const deleteScreenshotData = async (id) => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        let screenshots = [];

        if (fileInfo.exists) {
            const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
            screenshots = JSON.parse(fileContent);
        } else {
            // Try external storage
            const externalData = await readFromExternalStorage();
            if (externalData) {
                screenshots = JSON.parse(externalData);
            }
        }

        const filteredScreenshots = screenshots.filter(s => s.id !== id);
        const jsonString = JSON.stringify(filteredScreenshots);

        // Write to both local and external storage
        await FileSystem.writeAsStringAsync(STORAGE_FILE, jsonString);
        await writeToExternalStorage(jsonString);

        // Mirror deletion to SAF backup if configured
        writeBackupJson(jsonString).catch(() => { });

        return true;
    } catch (error) {
        console.error('Error deleting screenshot data:', error);
        return false;
    }
};

export const getAllScreenshots = async () => {
    try {
        let screenshots = [];

        // Try local storage first
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (fileInfo.exists) {
            try {
                const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
                const localScreenshots = JSON.parse(fileContent);
                if (localScreenshots && Array.isArray(localScreenshots) && localScreenshots.length > 0) {
                    screenshots = localScreenshots;
                }
            } catch (e) {
                console.log('Error reading local storage:', e);
            }
        }

        // Also try external storage and merge
        try {
            const externalData = await readFromExternalStorage();
            if (externalData) {
                const externalScreenshots = JSON.parse(externalData);
                if (externalScreenshots && Array.isArray(externalScreenshots) && externalScreenshots.length > 0) {
                    // Merge with local, preferring external for duplicates
                    const mergedMap = new Map();

                    // Add local screenshots first
                    for (const item of screenshots) {
                        if (item && item.id) {
                            mergedMap.set(String(item.id), item);
                        }
                    }

                    // Add/update with external screenshots (external takes precedence)
                    for (const item of externalScreenshots) {
                        if (item && item.id) {
                            mergedMap.set(String(item.id), item);
                        }
                    }

                    screenshots = Array.from(mergedMap.values());

                    // Sync merged data back to local storage
                    if (screenshots.length > 0) {
                        try {
                            await FileSystem.writeAsStringAsync(STORAGE_FILE, JSON.stringify(screenshots));
                        } catch (e) {
                            console.log('Error syncing to local storage:', e);
                        }
                    }
                }
            }
        } catch (e) {
            console.log('Error reading external storage:', e);
        }

        return screenshots.sort((a, b) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime;
        });
    } catch (error) {
        console.error('Error loading all screenshots:', error);
        return [];
    }
};

export const searchScreenshots = async (query) => {
    try {
        const allScreenshots = await getAllScreenshots();
        const lowercaseQuery = query.toLowerCase();

        return allScreenshots.filter(screenshot =>
            (screenshot.text && screenshot.text.toLowerCase().includes(lowercaseQuery)) ||
            (screenshot.audio && screenshot.audio.toLowerCase().includes(lowercaseQuery)) ||
            (screenshot.reminder && screenshot.reminder.toLowerCase().includes(lowercaseQuery)) ||
            (screenshot.tags && screenshot.tags.toLowerCase().includes(lowercaseQuery))
        );
    } catch (error) {
        console.error('Error searching screenshots:', error);
        return [];
    }
};

// Check for existing data in a folder
export const checkFolderForData = async (dirUri) => {
    try {
        if (!dirUri) return null;

        // First, try to read directory and find existing file
        let fileUri = null;
        try {
            const entries = await SAF.readDirectoryAsync(dirUri);

            // Look for the backup file - check for exact match first
            let foundFile = entries.find(u => {
                if (!u) return false;
                const lower = u.toLowerCase();
                return lower.endsWith('/' + BACKUP_FILENAME.toLowerCase()) ||
                    lower.endsWith(BACKUP_FILENAME.toLowerCase());
            });

            // If no exact match, look for numbered backups and get the latest one
            if (!foundFile) {
                const numberedFiles = entries
                    .filter(u => {
                        if (!u) return false;
                        const lower = u.toLowerCase();
                        return lower.includes(BACKUP_FILENAME.toLowerCase()) &&
                            lower.match(/\.\d+$/); // Ends with .1, .2, etc.
                    })
                    .sort((a, b) => {
                        // Sort by number (extract number from filename)
                        const numA = parseInt(a.match(/\.(\d+)$/)?.[1] || '0');
                        const numB = parseInt(b.match(/\.(\d+)$/)?.[1] || '0');
                        return numB - numA; // Descending order (latest first)
                    });

                if (numberedFiles.length > 0) {
                    foundFile = numberedFiles[0]; // Use the latest numbered backup
                } else {
                    // Fallback: any file with screenshots and .json
                    foundFile = entries.find(u => {
                        if (!u) return false;
                        const lower = u.toLowerCase();
                        return lower.includes('screenshot') && lower.endsWith('.json');
                    });
                }
            }

            if (foundFile) {
                fileUri = foundFile;
            } else {
                // No existing backup file found
                return null;
            }
        } catch (dirError) {
            // Error reading directory - return null
            throw new Error(`Cannot read folder: ${dirError?.message || 'Access denied'}`);
        }

        if (fileUri) {
            try {
                const content = await SAF.readAsStringAsync(fileUri);

                if (content && content.trim()) {
                    const data = JSON.parse(content);

                    if (Array.isArray(data) && data.length > 0) {
                        // Count unique tags
                        const tagsSet = new Set();
                        data.forEach(screenshot => {
                            if (screenshot.tags && Array.isArray(screenshot.tags)) {
                                screenshot.tags.forEach(tag => tagsSet.add(tag.toLowerCase()));
                            } else if (screenshot.tags && typeof screenshot.tags === 'string') {
                                const tagList = screenshot.tags.split(',').map(t => t.trim()).filter(t => t);
                                tagList.forEach(tag => tagsSet.add(tag.toLowerCase()));
                            }
                        });

                        return {
                            screenshots: data.length,
                            tags: tagsSet.size,
                            data: data
                        };
                    }
                }
            } catch (parseError) {
                throw new Error(`Invalid data format: ${parseError?.message || 'Cannot parse JSON'}`);
            }
        }
        return null;
    } catch (error) {
        // Re-throw with better error message
        throw error;
    }
};

// User-facing APIs for managing backup directory and restoring data
export const pickBackupDirectory = async () => {
    try {
        let res = null;
        let errorMessage = null;

        // Try to open Downloads as the initial location (Android)
        try {
            // Common initial tree URI for Downloads (primary storage)
            const downloadsTree = 'content://com.android.externalstorage.documents/tree/primary%3ADownload';
            res = await SAF.requestDirectoryPermissionsAsync(downloadsTree);
        } catch (initErr) {
            // Fallback: no initial directory
            try {
                res = await SAF.requestDirectoryPermissionsAsync();
            } catch (fallbackErr) {
                errorMessage = `Failed to open folder picker: ${fallbackErr?.message || String(fallbackErr)}`;
                return { granted: false, error: errorMessage, cancelled: false };
            }
        }

        // Check if user cancelled
        if (!res || (!res.granted && res.granted !== false)) {
            // User might have cancelled or there was an issue
            return { granted: false, cancelled: true, error: 'Folder selection was cancelled' };
        }

        // Check if permission was denied
        if (res.granted === false) {
            return { granted: false, cancelled: false, error: 'Folder access was denied' };
        }

        // Check if we have a directory URI
        if (res.granted && res.directoryUri) {
            try {
                await setPersistedBackupDirUri(res.directoryUri);

                // Try to ensure the backup file exists, but don't fail if it doesn't work
                // The file will be created automatically when we write to it
                try {
                    await ensureBackupFile(res.directoryUri);
                } catch (fileError) {
                    // File creation failed, but that's okay - we'll create it when we write
                    // Just log it but continue
                    // The file will be created automatically when writeToExternalStorage is called
                }

                return { granted: true, directoryUri: res.directoryUri };
            } catch (setupError) {
                // Only fail if setting the URI itself fails
                return {
                    granted: false,
                    cancelled: false,
                    error: `Failed to set up folder: ${setupError?.message || String(setupError)}`
                };
            }
        }

        // If we get here, something unexpected happened
        return {
            granted: false,
            cancelled: false,
            error: 'Folder selection completed but no directory was provided'
        };
    } catch (error) {
        return {
            granted: false,
            cancelled: false,
            error: `Unexpected error: ${error?.message || String(error)}`
        };
    }
};

export const hasBackupDirectory = async () => {
    const uri = await getPersistedBackupDirUri();
    return !!uri;
};

export const restoreFromBackup = async () => {
    try {
        // Try external storage first
        const externalData = await readFromExternalStorage();
        if (externalData) {
            const data = JSON.parse(externalData);
            if (!Array.isArray(data)) return false;
            await FileSystem.writeAsStringAsync(STORAGE_FILE, externalData);
            return true;
        }

        // Fallback to SAF backup
        const jsonString = await readBackupJson();
        if (!jsonString) return false;
        // Validate JSON
        const data = JSON.parse(jsonString);
        if (!Array.isArray(data)) return false;
        const jsonData = JSON.stringify(data);
        await FileSystem.writeAsStringAsync(STORAGE_FILE, jsonData);
        // Also write to external storage
        await writeToExternalStorage(jsonData);
        return true;
    } catch (e) {
        console.error('Error restoring from backup:', e);
        return false;
    }
};

// New function to manually set external storage location
export const setExternalStorageLocation = async (directoryUri) => {
    try {
        if (directoryUri) {
            const filePath = directoryUri + '/' + BACKUP_FILENAME;
            await AsyncStorage.setItem(EXTERNAL_STORAGE_KEY, filePath);
            // Sync current data to new location
            const localData = await FileSystem.readAsStringAsync(STORAGE_FILE);
            await FileSystem.writeAsStringAsync(filePath, localData);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error setting external storage location:', error);
        return false;
    }
};

// Get current external storage location
export const getExternalStorageLocation = async () => {
    return await AsyncStorage.getItem(EXTERNAL_STORAGE_KEY);
};
