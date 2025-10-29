import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    Modal,
    NativeModules,
    PermissionsAndroid,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// Use file storage for data persistence
const STORAGE_FILE = FileSystem.documentDirectory + 'screenshots.json';
const FALLBACK_STORAGE_FILE = FileSystem.cacheDirectory + 'screenshots.json';

// Predefined tags
const PREDEFINED_TAGS = [
    'Travel', 'Food', 'Work', 'Personal', 'Important', 'Shopping',
    'Health', 'Family', 'Friends', 'Entertainment', 'Education',
    'Finance', 'Home', 'Car', 'Technology', 'Sports', 'Hobby'
];

// Check if document directory is accessible
const checkDocumentDirectory = async () => {
    try {
        const dirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory);
        console.log('Document directory info:', dirInfo);
        return dirInfo.exists;
    } catch (error) {
        console.error('Error checking document directory:', error);
        return false;
    }
};

// Get the appropriate storage file path
const getStorageFile = async () => {
    try {
        const dirAccessible = await checkDocumentDirectory();
        if (dirAccessible) {
            console.log('Using document directory for storage');
            return STORAGE_FILE;
        } else {
            console.log('Using cache directory for storage');
            return FALLBACK_STORAGE_FILE;
        }
    } catch (error) {
        console.error('Error determining storage file:', error);
        return FALLBACK_STORAGE_FILE;
    }
};

export default function EditScreenshotScreen() {
    const { screenshotUri, screenshotId } = useLocalSearchParams();
    const [screenshotData, setScreenshotData] = useState(null);
    const [imageName, setImageName] = useState('');
    const [text, setText] = useState('');
    const [audio, setAudio] = useState('');
    const [reminder, setReminder] = useState('');
    const [isTodo, setIsTodo] = useState(false);
    const [tags, setTags] = useState('');
    const [loading, setLoading] = useState(true);
    const [originalFileName, setOriginalFileName] = useState('');

    // Audio recording states
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [audioUri, setAudioUri] = useState('');
    const [hasAudio, setHasAudio] = useState(false);
    const [lastError, setLastError] = useState('');
    const LOG_FILE = FileSystem.cacheDirectory + 'smartshot-log.txt';

    const appendLog = async (message) => {
        try {
            const timestamp = new Date().toISOString();
            const line = `[${timestamp}] ${message}\n`;
            let prev = '';
            try { prev = await FileSystem.readAsStringAsync(LOG_FILE); } catch { }
            const truncated = prev.length > 100000 ? prev.slice(prev.length - 100000) : prev;
            await FileSystem.writeAsStringAsync(LOG_FILE, truncated + line);
        } catch { }
    };

    const showDetailedError = async (title, code, errorObj, extra = {}) => {
        try {
            const msg = String(errorObj?.message || errorObj || 'Unknown error');
            const stack = String(errorObj?.stack || '');
            const detail = `Code: ${code}\nMessage: ${msg}\n${stack ? `Stack: ${stack}` : ''}\nExtra: ${JSON.stringify(extra)}`;
            setLastError(detail);
            await appendLog(`${title} | ${detail}`);
            Alert.alert(title, detail);
        } catch {
            Alert.alert(title, `${code}: ${String(errorObj)}`);
        }
    };

    const sanityCheckRecordingAPIs = async () => {
        const findings = [];
        try { if (typeof Audio?.setAudioModeAsync !== 'function') findings.push('Audio.setAudioModeAsync missing'); } catch { }
        try { if (typeof Audio?.requestPermissionsAsync !== 'function') findings.push('Audio.requestPermissionsAsync missing'); } catch { }
        try { if (typeof PermissionsAndroid?.request !== 'function') findings.push('PermissionsAndroid.request missing'); } catch { }
        try {
            const recCtor = Audio?.Recording;
            if (typeof recCtor !== 'function') findings.push('Audio.Recording constructor missing');
            else {
                const tmp = new recCtor();
                if (typeof tmp.prepareToRecordAsync !== 'function') findings.push('Recording.prepareToRecordAsync missing');
                if (typeof tmp.startAsync !== 'function') findings.push('Recording.startAsync missing');
            }
        } catch (e) {
            findings.push('Audio.Recording instantiation threw: ' + String(e?.message || e));
        }
        try { if (typeof Audio?.Recording?.createAsync !== 'function') findings.push('Audio.Recording.createAsync missing'); } catch { }
        if (findings.length) {
            await showDetailedError('Recording API Check Failed', 'REC_API_MISSING', new Error(findings.join(' | ')));
            return false;
        }
        return true;
    };
    const [pausedDetection, setPausedDetection] = useState(false);

    // Tag management states
    const [selectedTags, setSelectedTags] = useState([]);
    const [showTagModal, setShowTagModal] = useState(false);
    const [customTag, setCustomTag] = useState('');

    // Todo management states
    const [showTodoModal, setShowTodoModal] = useState(false);
    const [todoText, setTodoText] = useState('');

    useEffect(() => {
        initializeDatabase();
        loadScreenshotData();
        requestAudioPermission();
    }, []);

    const requestAudioPermission = async () => {
        try {
            console.log('Requesting audio permissions...');

            // Android: prefer native PermissionsAndroid for reliability
            if (Platform.OS === 'android') {
                const alreadyGranted = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
                );
                if (alreadyGranted) {
                    console.log('Android microphone permission already granted (PermissionsAndroid)');
                    return true;
                }

                const result = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    {
                        title: 'Microphone Permission',
                        message: 'SmartShot needs microphone access to record audio notes.',
                        buttonPositive: 'Allow',
                        buttonNegative: 'Deny',
                    }
                );

                if (result === PermissionsAndroid.RESULTS.GRANTED) {
                    console.log('Android microphone permission granted');
                    return true;
                }

                // Fall through to show settings prompt
                console.log('Android microphone permission denied or never ask again:', result);
            } else {
                // iOS or other platforms via expo-av
                const { status: currentStatus } = await Audio.getPermissionsAsync();
                if (currentStatus === 'granted') return true;
                const { status } = await Audio.requestPermissionsAsync();
                if (status === 'granted') return true;
            }

            Alert.alert(
                'Microphone Permission Required',
                'SmartShot needs microphone access to record audio notes. Please enable microphone permission in your device settings.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Open Settings',
                        onPress: async () => {
                            try {
                                await Linking.openSettings();
                            } catch (settingsErr) {
                                console.error('Failed to open settings:', settingsErr);
                            }
                        }
                    }
                ]
            );
            return false;
        } catch (error) {
            await showDetailedError('Permission Error', 'PERM_REQUEST_FAILED', error);
            // As a last resort, check one more time whether permission is already granted
            try {
                if (Platform.OS === 'android') {
                    const granted = await PermissionsAndroid.check(
                        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
                    );
                    if (granted) return true;
                } else {
                    const { status } = await Audio.getPermissionsAsync();
                    if (status === 'granted') return true;
                }
            } catch { }

            Alert.alert('Permission Error', 'Failed to request microphone permission. Please enable it in Settings.');
            return false;
        }
    };

    const startRecording = async () => {
        try {
            console.log('Starting recording process...');

            if (isRecording) {
                console.log('A recording is already in progress');
                return;
            }

            // First check and request permission
            const hasPermission = await requestAudioPermission();
            if (!hasPermission) {
                console.log('Audio permission not granted');
                return;
            }

            // Also request via expo-av to satisfy internal checks
            try {
                const { status } = await Audio.requestPermissionsAsync();
                console.log('expo-av permission after Android check:', status);
            } catch (permErr) {
                console.log('expo-av permission request skipped/failed:', permErr?.message);
            }

            const okApis = await sanityCheckRecordingAPIs();
            if (!okApis) return;

            // Pause background screenshot detection to avoid any audio focus/wake conflicts
            if (Platform.OS === 'android') {
                try {
                    await NativeModules.ScreenshotModule?.stopBackgroundService?.();
                    setPausedDetection(true);
                    console.log('Paused background screenshot detection');
                    // Give the system a moment after stopping the service
                    await new Promise(r => setTimeout(r, 200));
                } catch (e) {
                    await appendLog(`Pause background service failed: ${String(e?.message || e)}`);
                }
            }

            // Configure audio mode for recording with retry to avoid audio focus conflicts
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    staysActiveInBackground: false,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
                });
            } catch (modeErr1) {
                await appendLog(`Audio mode setup failed (DO_NOT_MIX): ${String(modeErr1?.message || modeErr1)}`);
                try {
                    await Audio.setAudioModeAsync({
                        allowsRecordingIOS: true,
                        playsInSilentModeIOS: true,
                        staysActiveInBackground: false,
                        shouldDuckAndroid: false,
                        playThroughEarpieceAndroid: false,
                        interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
                    });
                } catch (modeErr2) {
                    await appendLog(`Audio mode retry failed (DUCK_OTHERS): ${String(modeErr2?.message || modeErr2)}`);
                    await Audio.setAudioModeAsync({
                        allowsRecordingIOS: true,
                        playsInSilentModeIOS: true,
                        staysActiveInBackground: false,
                        shouldDuckAndroid: false,
                        playThroughEarpieceAndroid: false,
                    });
                }
            }

            // Small delay to let audio focus settle
            await new Promise(resolve => setTimeout(resolve, 150));

            console.log('Audio mode configured, preparing recording (manual)...');

            try {
                const newRecording = new Audio.Recording();
                const androidOptions = {
                    extension: '.m4a',
                    outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
                    audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
                    sampleRate: 44100,
                    numberOfChannels: 1,
                    bitRate: 128000,
                };
                const recordingOptions = Platform.select({
                    android: { ...Audio.RecordingOptionsPresets.HIGH_QUALITY, android: androidOptions },
                    ios: Audio.RecordingOptionsPresets.HIGH_QUALITY,
                    default: Audio.RecordingOptionsPresets.HIGH_QUALITY,
                });
                await newRecording.prepareToRecordAsync(recordingOptions);
                await newRecording.startAsync();
                setRecording(newRecording);
                setIsRecording(true);
                console.log('Recording started successfully (manual)');
                return;
            } catch (manualErr) {
                await showDetailedError('Recording Start Failed (manual)', 'REC_START_MANUAL', manualErr);
            }

            // Fallback to createAsync
            console.log('Trying fallback: Recording.createAsync...');
            const { recording: fallbackRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(fallbackRecording);
            setIsRecording(true);
            console.log('Recording started successfully (fallback)');

        } catch (error) {
            await showDetailedError('Recording Error', 'REC_START', error);
        }
    };

    const stopRecording = async () => {
        if (!recording) {
            console.log('No recording to stop');
            return;
        }

        try {
            console.log('Stopping recording...');
            setIsRecording(false);

            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();

            console.log('Recording saved to:', uri);
            setAudioUri(uri);
            setHasAudio(true);
            setAudio(uri);
            setRecording(null);

            // Reset audio mode after recording
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });

            // Resume background screenshot detection if we paused it
            if (Platform.OS === 'android' && pausedDetection) {
                try {
                    await NativeModules.ScreenshotModule?.startBackgroundService?.();
                    setPausedDetection(false);
                    console.log('Resumed background screenshot detection');
                } catch (e) {
                    console.log('Could not resume background service (user can re-enable from settings):', e?.message);
                }
            }

        } catch (error) {
            await showDetailedError('Stop Recording Error', 'REC_STOP', error);
        }
    };

    const playAudio = async () => {
        if (!audioUri) {
            console.log('No audio to play');
            return;
        }

        try {
            console.log('Playing audio:', audioUri);

            // Configure audio mode for playback
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });

            const { sound } = await Audio.Sound.createAsync(
                { uri: audioUri },
                { shouldPlay: true }
            );

            // Set up playback status update
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.didJustFinish) {
                    sound.unloadAsync();
                }
            });

            await sound.playAsync();

        } catch (error) {
            console.error('Failed to play audio:', error);
            Alert.alert('Error', 'Failed to play audio. The file may be corrupted.');
        }
    };

    const deleteAudio = () => {
        setAudioUri('');
        setHasAudio(false);
        setAudio('');
        console.log('Audio deleted');
    };

    // Tag management functions
    const toggleTag = (tag) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    const addCustomTag = () => {
        if (customTag.trim() && !selectedTags.includes(customTag.trim())) {
            setSelectedTags([...selectedTags, customTag.trim()]);
            setCustomTag('');
        }
    };

    const removeTag = (tag) => {
        setSelectedTags(selectedTags.filter(t => t !== tag));
    };

    const saveTags = () => {
        setTags(selectedTags.join(', '));
        setShowTagModal(false);
    };

    // Todo management functions
    const addTodo = () => {
        if (todoText.trim()) {
            setText(prevText => prevText ? `${prevText}\n• ${todoText.trim()}` : `• ${todoText.trim()}`);
            setTodoText('');
            setShowTodoModal(false);
        }
    };

    const initializeDatabase = async () => {
        try {
            console.log('Initializing database...');
            const storageFile = await getStorageFile();
            console.log('Using storage file:', storageFile);

            try {
                const fileInfo = await FileSystem.getInfoAsync(storageFile);
                if (!fileInfo.exists) {
                    console.log('Creating new storage file...');
                    await FileSystem.writeAsStringAsync(storageFile, JSON.stringify([]));
                    console.log('Storage file created successfully');
                } else {
                    console.log('Storage file already exists');
                }
            } catch (fileError) {
                // If getInfoAsync fails, try to create the file
                console.log('File check failed, creating new storage file...');
                await FileSystem.writeAsStringAsync(storageFile, JSON.stringify([]));
                console.log('Storage file created successfully');
            }
        } catch (error) {
            console.error('Error initializing file storage:', error);
        }
    };

    const getFileNameFromUri = (uri) => {
        try {
            if (!uri) return '';
            const clean = String(uri).split('?')[0].split('#')[0];
            const parts = clean.split('/');
            return parts[parts.length - 1] || '';
        } catch {
            return '';
        }
    };

    const loadScreenshotData = async () => {
        if (!screenshotId) {
            setLoading(false);
            // New entry: prefill name from URI
            const base = getFileNameFromUri(screenshotUri);
            setImageName(base);
            setOriginalFileName(base);
            return;
        }

        try {
            const storageFile = await getStorageFile();
            try {
                const fileInfo = await FileSystem.getInfoAsync(storageFile);
                if (fileInfo.exists) {
                    const fileContent = await FileSystem.readAsStringAsync(storageFile);
                    const screenshots = JSON.parse(fileContent);
                    const data = screenshots.find(s => s.id === screenshotId);
                    if (data) {
                        setScreenshotData(data);
                        setText(data.text || '');
                        setImageName(data.name || getFileNameFromUri(data.uri || screenshotUri));
                        setOriginalFileName(getFileNameFromUri(data.uri || screenshotUri));
                        setAudio(data.audio || '');
                        setReminder(data.reminder || '');
                        setIsTodo(!!data.isTodo);
                        setTags(data.tags || '');

                        // Handle audio
                        if (data.audio) {
                            setAudioUri(data.audio);
                            setHasAudio(true);
                        }

                        // Handle tags
                        if (data.tags) {
                            const tagArray = data.tags.split(',').map(t => t.trim()).filter(t => t);
                            setSelectedTags(tagArray);
                        }
                    }
                }
            } catch (fileError) {
                console.log('File not found or error reading file, starting fresh');
            }
            setLoading(false);
        } catch (error) {
            console.error('Error loading screenshot data:', error);
            setLoading(false);
        }
    };

    const saveScreenshotData = async () => {
        const now = new Date().toISOString();
        const id = screenshotId || `screenshot_${Date.now()}`;

        try {
            console.log('Starting save process...');
            const storageFile = await getStorageFile();
            console.log('Storage file path:', storageFile);
            console.log('Screenshot URI:', screenshotUri);
            console.log('Screenshot ID:', id);

            let screenshots = [];

            try {
                const fileInfo = await FileSystem.getInfoAsync(storageFile);
                if (fileInfo.exists) {
                    console.log('File exists, reading content...');
                    const fileContent = await FileSystem.readAsStringAsync(storageFile);
                    screenshots = JSON.parse(fileContent);
                    console.log('Loaded screenshots:', screenshots.length);
                } else {
                    console.log('File does not exist, creating new...');
                }
            } catch (fileError) {
                console.log('File check failed, starting with empty array');
            }

            // If user changed the name, attempt to rename the underlying media file (Android only)
            try {
                if (Platform.OS === 'android' && screenshotUri && imageName && imageName.trim()) {
                    const desired = imageName.trim();
                    if (desired !== originalFileName) {
                        await NativeModules.ScreenshotModule?.renameImage?.(screenshotUri, desired);
                        setOriginalFileName(desired);
                    }
                }
            } catch (renameErr) {
                console.warn('Rename failed (keeping metadata only):', renameErr?.message || renameErr);
            }

            const screenshotToSave = {
                id,
                uri: screenshotUri,
                name: imageName || getFileNameFromUri(screenshotUri),
                text,
                audio,
                reminder,
                isTodo,
                tags,
                createdAt: screenshotData?.createdAt || now,
                updatedAt: now
            };

            console.log('Screenshot to save:', screenshotToSave);

            const existingIndex = screenshots.findIndex(s => s.id === id);
            if (existingIndex >= 0) {
                console.log('Updating existing screenshot at index:', existingIndex);
                screenshots[existingIndex] = screenshotToSave;
            } else {
                console.log('Adding new screenshot');
                screenshots.push(screenshotToSave);
            }

            console.log('Saving to file...');
            await FileSystem.writeAsStringAsync(storageFile, JSON.stringify(screenshots));
            console.log('Save successful!');
            Alert.alert('Success', 'Screenshot data saved successfully!');
            router.back();
        } catch (error) {
            console.error('Error saving screenshot data:', error);
            console.error('Error details:', error.message);
            console.error('Error stack:', error.stack);
            Alert.alert('Error', `Failed to save screenshot data: ${error.message}`);
        }
    };

    const deleteScreenshotData = () => {
        if (!screenshotId) return;

        Alert.alert(
            'Delete Screenshot',
            'Are you sure you want to delete this screenshot data?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const storageFile = await getStorageFile();
                            try {
                                const fileInfo = await FileSystem.getInfoAsync(storageFile);
                                if (fileInfo.exists) {
                                    const fileContent = await FileSystem.readAsStringAsync(storageFile);
                                    const screenshots = JSON.parse(fileContent);
                                    const filteredScreenshots = screenshots.filter(s => s.id !== screenshotId);
                                    await FileSystem.writeAsStringAsync(storageFile, JSON.stringify(filteredScreenshots));
                                }
                            } catch (fileError) {
                                console.log('File not found or error reading file during delete');
                            }
                            Alert.alert('Success', 'Screenshot data deleted successfully!');
                            router.back();
                        } catch (error) {
                            console.error('Error deleting screenshot data:', error);
                            Alert.alert('Error', 'Failed to delete screenshot data');
                        }
                    }
                }
            ]
        );
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    if (loading) {
        return (
            <ThemedView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ThemedText>Loading...</ThemedText>
                </View>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <ThemedText style={styles.backButtonText}>← Back</ThemedText>
                    </TouchableOpacity>
                    <ThemedText style={styles.title}>Edit Screenshot</ThemedText>
                    <TouchableOpacity style={styles.saveButton} onPress={saveScreenshotData}>
                        <ThemedText style={styles.saveButtonText}>Save</ThemedText>
                    </TouchableOpacity>
                </View>

                {/* Image Preview */}
                <View style={styles.imagePreviewContainer}>
                    <ThemedText style={styles.sectionTitle}>Image Preview</ThemedText>
                    <View style={styles.imagePreview}>
                        <Image
                            source={{ uri: screenshotUri }}
                            style={styles.previewImage}
                            resizeMode="cover"
                        />
                    </View>
                </View>

                {/* Text Section */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Image Name</ThemedText>
                    <TextInput
                        style={styles.textInput}
                        value={imageName}
                        onChangeText={setImageName}
                        placeholder="Enter a name for this image..."
                    />
                </View>

                {/* Text Section */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Text</ThemedText>
                    <TextInput
                        style={styles.textInput}
                        value={text}
                        onChangeText={setText}
                        placeholder="Add text notes about this screenshot..."
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                {/* Audio Section */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Audio Recording</ThemedText>
                    {!!lastError && (
                        <View style={styles.errorBox}>
                            <ThemedText style={styles.errorTitle}>Last Error</ThemedText>
                            <ThemedText style={styles.errorText}>{lastError}</ThemedText>
                        </View>
                    )}

                    {!hasAudio ? (
                        <View style={styles.audioControls}>
                            <TouchableOpacity
                                style={[styles.audioButton, isRecording ? styles.recordingButton : styles.recordButton]}
                                onPress={isRecording ? stopRecording : startRecording}
                            >
                                <ThemedText style={styles.audioButtonText}>
                                    {isRecording ? '⏹️ Stop Recording' : '🎤 Start Recording'}
                                </ThemedText>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.audioPlayer}>
                            <ThemedText style={styles.audioStatus}>Audio recorded successfully!</ThemedText>
                            <View style={styles.audioPlayerControls}>
                                <TouchableOpacity style={styles.playButton} onPress={playAudio}>
                                    <ThemedText style={styles.playButtonText}>▶️ Play</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.deleteAudioButton} onPress={deleteAudio}>
                                    <ThemedText style={styles.deleteAudioButtonText}>🗑️ Delete</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* Reminder Section */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>Reminder</ThemedText>
                    <TextInput
                        style={styles.textInput}
                        value={reminder}
                        onChangeText={setReminder}
                        placeholder="Set a reminder for this screenshot..."
                        multiline
                        numberOfLines={2}
                        textAlignVertical="top"
                    />
                </View>

                {/* Todo Section */}
                <View style={styles.section}>
                    <View style={styles.todoHeader}>
                        <ThemedText style={styles.sectionTitle}>Todo Management</ThemedText>
                        <Switch
                            value={isTodo}
                            onValueChange={setIsTodo}
                            trackColor={{ false: '#767577', true: '#8B5CF6' }}
                            thumbColor={isTodo ? '#f4f3f4' : '#f4f3f4'}
                        />
                    </View>
                    {isTodo && (
                        <View style={styles.todoControls}>
                            <ThemedText style={styles.todoDescription}>
                                This screenshot will be added to your todo list
                            </ThemedText>
                            <TouchableOpacity
                                style={styles.addTodoButton}
                                onPress={() => setShowTodoModal(true)}
                            >
                                <ThemedText style={styles.addTodoButtonText}>+ Add Todo Item</ThemedText>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Tags Section */}
                <View style={styles.section}>
                    <View style={styles.tagsHeader}>
                        <ThemedText style={styles.sectionTitle}>Tags</ThemedText>
                        <TouchableOpacity
                            style={styles.manageTagsButton}
                            onPress={() => setShowTagModal(true)}
                        >
                            <ThemedText style={styles.manageTagsButtonText}>Manage Tags</ThemedText>
                        </TouchableOpacity>
                    </View>

                    {selectedTags.length > 0 && (
                        <View style={styles.selectedTagsContainer}>
                            {selectedTags.map((tag, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={styles.selectedTag}
                                    onPress={() => removeTag(tag)}
                                >
                                    <ThemedText style={styles.selectedTagText}>{tag} ×</ThemedText>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Metadata */}
                {screenshotData && (
                    <View style={styles.section}>
                        <ThemedText style={styles.sectionTitle}>Metadata</ThemedText>
                        <View style={styles.metadataContainer}>
                            <ThemedText style={styles.metadataText}>
                                Created: {formatDate(screenshotData.createdAt)}
                            </ThemedText>
                            <ThemedText style={styles.metadataText}>
                                Updated: {formatDate(screenshotData.updatedAt)}
                            </ThemedText>
                        </View>
                    </View>
                )}

                {/* Delete Button */}
                {screenshotId && (
                    <TouchableOpacity style={styles.deleteButton} onPress={deleteScreenshotData}>
                        <ThemedText style={styles.deleteButtonText}>Delete Screenshot Data</ThemedText>
                    </TouchableOpacity>
                )}

                {/* Bottom Spacing */}
                <View style={styles.bottomSpacing} />
            </ScrollView>

            {/* Tag Management Modal */}
            <Modal
                visible={showTagModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowTagModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <ThemedText style={styles.modalTitle}>Select Tags</ThemedText>
                            <TouchableOpacity
                                style={styles.closeModalButton}
                                onPress={() => setShowTagModal(false)}
                            >
                                <ThemedText style={styles.closeModalButtonText}>×</ThemedText>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.customTagContainer}>
                            <TextInput
                                style={styles.customTagInput}
                                value={customTag}
                                onChangeText={setCustomTag}
                                placeholder="Add custom tag..."
                            />
                            <TouchableOpacity style={styles.addCustomTagButton} onPress={addCustomTag}>
                                <ThemedText style={styles.addCustomTagButtonText}>Add</ThemedText>
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={PREDEFINED_TAGS}
                            keyExtractor={(item) => item}
                            numColumns={2}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.tagOption,
                                        selectedTags.includes(item) && styles.selectedTagOption
                                    ]}
                                    onPress={() => toggleTag(item)}
                                >
                                    <ThemedText style={[
                                        styles.tagOptionText,
                                        selectedTags.includes(item) && styles.selectedTagOptionText
                                    ]}>
                                        {item}
                                    </ThemedText>
                                </TouchableOpacity>
                            )}
                            style={styles.tagsList}
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowTagModal(false)}>
                                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={saveTags}>
                                <ThemedText style={styles.saveButtonText}>Save Tags</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Todo Management Modal */}
            <Modal
                visible={showTodoModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowTodoModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <ThemedText style={styles.modalTitle}>Add Todo Item</ThemedText>
                            <TouchableOpacity
                                style={styles.closeModalButton}
                                onPress={() => setShowTodoModal(false)}
                            >
                                <ThemedText style={styles.closeModalButtonText}>×</ThemedText>
                            </TouchableOpacity>
                        </View>

                        <TextInput
                            style={styles.todoInput}
                            value={todoText}
                            onChangeText={setTodoText}
                            placeholder="Enter todo item..."
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowTodoModal(false)}>
                                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={addTodo}>
                                <ThemedText style={styles.saveButtonText}>Add Todo</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    backButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
    },
    backButtonText: {
        color: '#8B5CF6',
        fontWeight: '600',
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    saveButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: '#8B5CF6',
        borderRadius: 8,
    },
    saveButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
    imagePreviewContainer: {
        margin: 20,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    imagePreview: {
        height: 200,
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 8,
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    section: {
        marginHorizontal: 20,
        marginBottom: 20,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#333',
        backgroundColor: '#f9f9f9',
        minHeight: 80,
    },
    todoHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    todoDescription: {
        fontSize: 14,
        color: '#666',
        marginTop: 8,
        fontStyle: 'italic',
    },
    metadataContainer: {
        marginTop: 8,
    },
    metadataText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    deleteButton: {
        marginHorizontal: 20,
        marginBottom: 20,
        backgroundColor: '#ff4444',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    deleteButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    bottomSpacing: {
        height: 40,
    },
    // Audio recording styles
    audioControls: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    audioButton: {
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 25,
        alignItems: 'center',
    },
    recordButton: {
        backgroundColor: '#8B5CF6',
    },
    recordingButton: {
        backgroundColor: '#ff4444',
    },
    audioButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    audioPlayer: {
        paddingVertical: 10,
    },
    audioStatus: {
        fontSize: 14,
        color: '#4CAF50',
        textAlign: 'center',
        marginBottom: 15,
    },
    audioPlayerControls: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    // Error box styles
    errorBox: {
        backgroundColor: '#fdecea',
        borderColor: '#f5c6cb',
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
    },
    errorTitle: {
        color: '#b71c1c',
        fontWeight: '700',
        marginBottom: 4,
    },
    errorText: {
        color: '#b71c1c',
        fontSize: 12,
    },
    playButton: {
        backgroundColor: '#4CAF50',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    playButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    deleteAudioButton: {
        backgroundColor: '#ff4444',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    deleteAudioButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    // Tag management styles
    tagsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    manageTagsButton: {
        backgroundColor: '#8B5CF6',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
    },
    manageTagsButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    selectedTagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 10,
    },
    selectedTag: {
        backgroundColor: '#8B5CF6',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 15,
        marginRight: 8,
        marginBottom: 8,
    },
    selectedTagText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '500',
    },
    // Todo management styles
    todoControls: {
        marginTop: 10,
    },
    addTodoButton: {
        backgroundColor: '#8B5CF6',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
        alignSelf: 'flex-start',
        marginTop: 10,
    },
    addTodoButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        width: '90%',
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    closeModalButton: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeModalButtonText: {
        fontSize: 20,
        color: '#666',
    },
    customTagContainer: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    customTagInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        padding: 12,
        marginRight: 10,
        fontSize: 16,
    },
    addCustomTagButton: {
        backgroundColor: '#8B5CF6',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 8,
        justifyContent: 'center',
    },
    addCustomTagButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    tagsList: {
        maxHeight: 200,
        marginBottom: 20,
    },
    tagOption: {
        backgroundColor: '#f0f0f0',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 20,
        margin: 5,
        alignItems: 'center',
        flex: 1,
    },
    selectedTagOption: {
        backgroundColor: '#8B5CF6',
    },
    tagOptionText: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    selectedTagOptionText: {
        color: '#fff',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    cancelButton: {
        backgroundColor: '#f0f0f0',
        paddingVertical: 12,
        paddingHorizontal: 30,
        borderRadius: 8,
    },
    cancelButtonText: {
        color: '#666',
        fontSize: 16,
        fontWeight: '600',
    },
    todoInput: {
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 20,
        minHeight: 80,
    },
});
