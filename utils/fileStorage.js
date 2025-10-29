import * as FileSystem from 'expo-file-system';

const STORAGE_FILE = FileSystem.documentDirectory + 'screenshots.json';

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

        await FileSystem.writeAsStringAsync(STORAGE_FILE, JSON.stringify(screenshots));
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

        await FileSystem.writeAsStringAsync(STORAGE_FILE, JSON.stringify(filteredScreenshots));
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
