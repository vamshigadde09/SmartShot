import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

const STORAGE_FILE = FileSystem.documentDirectory + 'screenshots.json';
const BACKUP_DIR_KEY = 'smartshot.backup.dirUri';
const BACKUP_FILENAME = 'screenshots.json';

// Android SAF helper
const SAF = FileSystem.StorageAccessFramework;

async function getPersistedBackupDirUri() {
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

export const initializeDatabase = async () => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (!fileInfo.exists) {
            await FileSystem.writeAsStringAsync(STORAGE_FILE, JSON.stringify([]));
        }
        return true;
    } catch (error) {
        console.error('Error initializing file storage:', error);
        return false;
    }
};

export const saveScreenshotData = async (data) => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        let screenshots = [];

        if (fileInfo.exists) {
            const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
            screenshots = JSON.parse(fileContent);
        }

        const now = new Date().toISOString();
        const existingIndex = screenshots.findIndex(s => s.id === data.id);

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
        await FileSystem.writeAsStringAsync(STORAGE_FILE, jsonString);
        // Best-effort external backup
        writeBackupJson(jsonString).catch(() => { });
        return true;
    } catch (error) {
        console.error('Error saving screenshot data:', error);
        return false;
    }
};

export const loadScreenshotData = async (id) => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (!fileInfo.exists) {
            return null;
        }

        const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
        const screenshots = JSON.parse(fileContent);
        return screenshots.find(s => s.id === id) || null;
    } catch (error) {
        console.error('Error loading screenshot data:', error);
        return null;
    }
};

export const deleteScreenshotData = async (id) => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (!fileInfo.exists) {
            return true;
        }

        const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
        const screenshots = JSON.parse(fileContent);
        const filteredScreenshots = screenshots.filter(s => s.id !== id);

        const jsonString = JSON.stringify(filteredScreenshots);
        await FileSystem.writeAsStringAsync(STORAGE_FILE, jsonString);
        // Mirror deletion to external backup if configured
        writeBackupJson(jsonString).catch(() => { });
        return true;
    } catch (error) {
        console.error('Error deleting screenshot data:', error);
        return false;
    }
};

export const getAllScreenshots = async () => {
    try {
        const fileInfo = await FileSystem.getInfoAsync(STORAGE_FILE);
        if (!fileInfo.exists) {
            return [];
        }

        const fileContent = await FileSystem.readAsStringAsync(STORAGE_FILE);
        const screenshots = JSON.parse(fileContent);
        return screenshots.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
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

// User-facing APIs for managing backup directory and restoring data
export const pickBackupDirectory = async () => {
    try {
        let res = null;
        // Try to open Downloads as the initial location (Android)
        try {
            // Common initial tree URI for Downloads (primary storage)
            const downloadsTree = 'content://com.android.externalstorage.documents/tree/primary%3ADownload';
            res = await SAF.requestDirectoryPermissionsAsync(downloadsTree);
        } catch (_initErr) {
            // Fallback: no initial directory
            res = await SAF.requestDirectoryPermissionsAsync();
        }
        if (res.granted && res.directoryUri) {
            await setPersistedBackupDirUri(res.directoryUri);
            // Ensure the backup file exists immediately
            await ensureBackupFile(res.directoryUri);
            return { granted: true };
        }
        return { granted: false };
    } catch (error) {
        console.error('Error picking backup directory:', error);
        return { granted: false, error };
    }
};

export const hasBackupDirectory = async () => {
    const uri = await getPersistedBackupDirUri();
    return !!uri;
};

export const restoreFromBackup = async () => {
    try {
        const jsonString = await readBackupJson();
        if (!jsonString) return false;
        // Validate JSON
        const data = JSON.parse(jsonString);
        if (!Array.isArray(data)) return false;
        await FileSystem.writeAsStringAsync(STORAGE_FILE, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Error restoring from backup:', e);
        return false;
    }
};
