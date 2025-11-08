import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getAllScreenshots, saveScreenshotData as saveScreenshotDataToStorage } from '@/utils/fileStorage';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Image,
    NativeModules,
    PermissionsAndroid,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// Use file storage for data persistence
const STORAGE_FILE = FileSystem.documentDirectory + 'screenshots.json';
const FALLBACK_STORAGE_FILE = FileSystem.cacheDirectory + 'screenshots.json';

// Default predefined tags
const DEFAULT_PREDEFINED_TAGS = [
    'Travel', 'Food', 'Work', 'Personal', 'Important', 'Shopping',
    'Health', 'Family', 'Friends', 'Entertainment', 'Education',
    'Finance', 'Home', 'Car', 'Technology', 'Sports', 'Hobby'
];

const PREDEFINED_TAGS_STORAGE_KEY = 'smartshot.predefinedTags';

const { width: screenWidth } = Dimensions.get('window');

// Audio Wave Component
const AudioWave = ({ isRecording, recordingDuration }) => {
    const waveAnimations = useRef(
        Array.from({ length: 20 }, () => new Animated.Value(0.3))
    ).current;

    useEffect(() => {
        if (isRecording) {
            const animations = waveAnimations.map((anim, index) => {
                return Animated.loop(
                    Animated.sequence([
                        Animated.delay(index * 100),
                        Animated.timing(anim, {
                            toValue: Math.random() * 0.7 + 0.3,
                            duration: 300 + Math.random() * 200,
                            useNativeDriver: true,
                        }),
                        Animated.timing(anim, {
                            toValue: 0.3,
                            duration: 300 + Math.random() * 200,
                            useNativeDriver: true,
                        }),
                    ])
                );
            });

            animations.forEach(anim => anim.start());

            return () => {
                animations.forEach(anim => anim.stop());
            };
        } else {
            waveAnimations.forEach(anim => anim.setValue(0.3));
        }
    }, [isRecording]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <View style={styles.audioWaveContainer}>
            <View style={styles.waveBars}>
                {waveAnimations.map((anim, index) => (
                    <Animated.View
                        key={index}
                        style={[
                            styles.waveBar,
                            {
                                transform: [{
                                    scaleY: anim.interpolate({
                                        inputRange: [0.3, 1],
                                        outputRange: [0.3, 1],
                                    })
                                }],
                                backgroundColor: isRecording ? '#FF6B6B' : '#8B5CF6',
                            }
                        ]}
                    />
                ))}
            </View>
            <View style={styles.recordingInfo}>
                <View style={styles.recordingDot}>
                    <View style={[styles.recordingPulse, isRecording && styles.recordingPulseActive]} />
                </View>
                <ThemedText style={styles.recordingTime}>
                    {formatTime(recordingDuration)}
                </ThemedText>
                <ThemedText style={styles.recordingText}>
                    {isRecording ? 'Recording...' : 'Ready to record'}
                </ThemedText>
            </View>
        </View>
    );
};

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
    const [tags, setTags] = useState('');
    const [loading, setLoading] = useState(true);
    const [originalFileName, setOriginalFileName] = useState('');

    // Audio recording states
    const [recording, setRecording] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [audioUri, setAudioUri] = useState('');
    const [hasAudio, setHasAudio] = useState(false);
    const [lastError, setLastError] = useState('');
    const [recordingDuration, setRecordingDuration] = useState(0);
    const recordingTimerRef = useRef(null);
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
    const [customTag, setCustomTag] = useState('');
    const [predefinedTags, setPredefinedTags] = useState(DEFAULT_PREDEFINED_TAGS);

    useEffect(() => {
        initializeDatabase();
        loadScreenshotData();
        loadPredefinedTags();
        requestAudioPermission();
    }, []);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (recordingTimerRef.current) {
                clearInterval(recordingTimerRef.current);
            }
        };
    }, []);

    const startRecordingTimer = () => {
        setRecordingDuration(0);
        recordingTimerRef.current = setInterval(() => {
            setRecordingDuration(prev => prev + 1);
        }, 1000);
    };

    const stopRecordingTimer = () => {
        if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        setRecordingDuration(0);
    };

    const requestAudioPermission = async () => {
        try {
            console.log('Requesting audio permissions...');

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

                console.log('Android microphone permission denied or never ask again:', result);
            } else {
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

            const hasPermission = await requestAudioPermission();
            if (!hasPermission) {
                console.log('Audio permission not granted');
                return;
            }

            try {
                const { status } = await Audio.requestPermissionsAsync();
                console.log('expo-av permission after Android check:', status);
            } catch (permErr) {
                console.log('expo-av permission request skipped/failed:', permErr?.message);
            }

            const okApis = await sanityCheckRecordingAPIs();
            if (!okApis) return;

            if (Platform.OS === 'android') {
                try {
                    await NativeModules.ScreenshotModule?.stopBackgroundService?.();
                    setPausedDetection(true);
                    console.log('Paused background screenshot detection');
                    await new Promise(r => setTimeout(r, 200));
                } catch (e) {
                    await appendLog(`Pause background service failed: ${String(e?.message || e)}`);
                }
            }

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
                startRecordingTimer();
                console.log('Recording started successfully (manual)');
                return;
            } catch (manualErr) {
                await showDetailedError('Recording Start Failed (manual)', 'REC_START_MANUAL', manualErr);
            }

            console.log('Trying fallback: Recording.createAsync...');
            const { recording: fallbackRecording } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY
            );
            setRecording(fallbackRecording);
            setIsRecording(true);
            startRecordingTimer();
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
            stopRecordingTimer();

            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();

            console.log('Recording saved to:', uri);
            setAudioUri(uri);
            setHasAudio(true);
            setAudio(uri);
            setRecording(null);

            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });

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

    // Load predefined tags from storage
    const loadPredefinedTags = async () => {
        try {
            const savedTags = await AsyncStorage.getItem(PREDEFINED_TAGS_STORAGE_KEY);
            if (savedTags) {
                const parsedTags = JSON.parse(savedTags);
                if (Array.isArray(parsedTags) && parsedTags.length > 0) {
                    setPredefinedTags(parsedTags);
                }
            }
        } catch (error) {
            console.error('Error loading predefined tags:', error);
        }
    };

    // Save predefined tags to storage
    const savePredefinedTags = async (tags) => {
        try {
            await AsyncStorage.setItem(PREDEFINED_TAGS_STORAGE_KEY, JSON.stringify(tags));
            setPredefinedTags(tags);
        } catch (error) {
            console.error('Error saving predefined tags:', error);
        }
    };

    // Tag management functions - Only allow one tag at a time
    const toggleTag = (tag) => {
        // If clicking the same tag, remove it. Otherwise, replace current tag with new one
        const newSelectedTags = selectedTags.includes(tag) ? [] : [tag];
        setSelectedTags(newSelectedTags);
        // Save tags immediately
        setTags(newSelectedTags.length > 0 ? newSelectedTags[0] : '');
    };

    const addCustomTag = async () => {
        const trimmedTag = customTag.trim();
        if (trimmedTag) {
            // Replace any existing tag with the new one
            setSelectedTags([trimmedTag]);
            setCustomTag('');
            // Save tags immediately
            setTags(trimmedTag);

            // Add to predefined tags if it doesn't exist
            if (!predefinedTags.includes(trimmedTag)) {
                const updatedTags = [...predefinedTags, trimmedTag].sort();
                await savePredefinedTags(updatedTags);
            }
        }
    };

    const removeTag = () => {
        // Remove the only tag
        setSelectedTags([]);
        // Save tags immediately
        setTags('');
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
            const base = getFileNameFromUri(screenshotUri);
            setImageName(base);
            setOriginalFileName(base);
            return;
        }

        try {
            let data = null;

            if (screenshotId) {
                const allScreenshots = await getAllScreenshots();
                data = allScreenshots.find(s =>
                    String(s.id) === String(screenshotId) ||
                    s.id === screenshotId ||
                    String(s.id) === String(screenshotId) ||
                    s.id === String(screenshotId)
                );

                if (!data) {
                    const storageFile = await getStorageFile();
                    try {
                        const fileInfo = await FileSystem.getInfoAsync(storageFile);
                        if (fileInfo.exists) {
                            const fileContent = await FileSystem.readAsStringAsync(storageFile);
                            const screenshots = JSON.parse(fileContent);
                            data = screenshots.find(s =>
                                String(s.id) === String(screenshotId) ||
                                s.id === screenshotId
                            );
                        }
                    } catch (fileError) {
                        console.log('File not found or error reading file');
                    }
                }

                if (!data) {
                    console.log('External storage check failed (redundant)');
                }
            }

            if (data) {
                setScreenshotData(data);
                setText(data.text || '');
                setImageName(data.name || getFileNameFromUri(data.uri || screenshotUri));
                setOriginalFileName(getFileNameFromUri(data.uri || screenshotUri));
                setAudio(data.audio || '');
                setReminder(data.reminder || '');
                setTags(data.tags || '');

                if (data.audio) {
                    setAudioUri(data.audio);
                    setHasAudio(true);
                }

                if (data.tags) {
                    // Only take the first tag since we only allow one tag
                    const tagString = String(data.tags).split(',')[0].trim();
                    if (tagString) {
                        setSelectedTags([tagString]);
                    }
                }
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

            // Only save one tag (the first one if multiple exist)
            const tagsToSave = tags || (selectedTags.length > 0 ? selectedTags[0] : '');

            const screenshotToSave = {
                id,
                uri: screenshotUri,
                name: imageName || getFileNameFromUri(screenshotUri),
                text,
                audio,
                reminder,
                tags: tagsToSave,
                createdAt: screenshotData?.createdAt || now,
                updatedAt: now
            };

            try {
                const saved = await saveScreenshotDataToStorage(screenshotToSave);

                if (!saved) {
                    const errorDetails = [
                        'Failed to save screenshot data',
                        '',
                        'Data being saved:',
                        `ID: ${screenshotToSave.id}`,
                        `URI: ${screenshotToSave.uri || 'N/A'}`,
                        `Tags: ${screenshotToSave.tags || 'None'}`,
                        `Text: ${screenshotToSave.text ? 'Yes' : 'No'}`,
                        `Audio: ${screenshotToSave.audio ? 'Yes' : 'No'}`,
                        '',
                        'Possible causes:',
                        '- Storage permission denied',
                        '- File system error',
                        '- Corrupted data file',
                        '- Invalid data format',
                    ].join('\n');

                    Alert.alert('Save Error', errorDetails);
                    return;
                }
            } catch (saveError) {
                const errorDetails = [
                    'Failed to save screenshot data',
                    '',
                    'Error Type: ' + (saveError?.name || 'Unknown'),
                    'Error Message: ' + (saveError?.message || String(saveError) || 'Unknown error'),
                    '',
                    'Error Stack:',
                    (saveError?.stack || 'No stack trace available').substring(0, 500),
                    '',
                    'Data that failed to save:',
                    `ID: ${screenshotToSave.id}`,
                    `URI: ${screenshotToSave.uri || 'N/A'}`,
                    `Tags: ${screenshotToSave.tags || 'None'}`,
                    `Text: ${screenshotToSave.text ? 'Yes (' + screenshotToSave.text.length + ' chars)' : 'No'}`,
                    `Audio: ${screenshotToSave.audio ? 'Yes' : 'No'}`,
                    `Name: ${screenshotToSave.name || 'N/A'}`,
                ].join('\n');

                Alert.alert('Save Error', errorDetails);
                return;
            }

            router.back();

        } catch (error) {
            console.error('Error saving screenshot data:', error);
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
                    <Ionicons name="image" size={48} color="#8B5CF6" />
                    <ThemedText style={styles.loadingText}>Loading...</ThemedText>
                </View>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color="#8B5CF6" />
                    <ThemedText style={styles.backButtonText}>Back</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveScreenshotData} style={styles.saveButton}>
                    <Ionicons name="checkmark" size={20} color="#fff" />
                    <ThemedText style={styles.saveButtonText}>Save</ThemedText>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                {/* Image Preview */}
                <View style={styles.imagePreviewContainer}>
                    <ThemedText style={styles.sectionTitle}>Image Preview</ThemedText>
                    <View style={styles.imagePreview}>
                        <Image
                            source={{ uri: screenshotUri }}
                            style={styles.previewImage}
                            resizeMode="cover"
                        />
                        <View style={styles.imageOverlay}>
                            <Ionicons name="image" size={32} color="rgba(255,255,255,0.8)" />
                        </View>
                    </View>
                </View>

                {/* Image Name */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="pencil" size={18} color="#8B5CF6" />
                        <ThemedText style={styles.sectionTitle}>Image Name</ThemedText>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        value={imageName}
                        onChangeText={setImageName}
                        placeholder="Enter a name for this image..."
                        placeholderTextColor="#999"
                    />
                </View>

                {/* Text Notes */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="document-text" size={18} color="#8B5CF6" />
                        <ThemedText style={styles.sectionTitle}>Text Notes</ThemedText>
                    </View>
                    <TextInput
                        style={[styles.textInput, styles.textArea]}
                        value={text}
                        onChangeText={setText}
                        placeholder="Add text notes about this screenshot..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                </View>

                {/* Audio Recording */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="mic" size={18} color="#8B5CF6" />
                        <ThemedText style={styles.sectionTitle}>Audio Recording</ThemedText>
                    </View>

                    {!!lastError && (
                        <View style={styles.errorBox}>
                            <Ionicons name="warning" size={16} color="#DC2626" />
                            <ThemedText style={styles.errorText}>{lastError}</ThemedText>
                        </View>
                    )}

                    {!hasAudio ? (
                        <View style={styles.audioRecordingContainer}>
                            <AudioWave
                                isRecording={isRecording}
                                recordingDuration={recordingDuration}
                            />
                            <TouchableOpacity
                                style={[
                                    styles.recordButton,
                                    isRecording && styles.recordingButton
                                ]}
                                onPress={isRecording ? stopRecording : startRecording}
                            >
                                <Ionicons
                                    name={isRecording ? "stop" : "mic"}
                                    size={24}
                                    color="#fff"
                                />
                                <ThemedText style={styles.recordButtonText}>
                                    {isRecording ? 'Stop Recording' : 'Start Recording'}
                                </ThemedText>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.audioPlaybackContainer}>
                            <View style={styles.audioStatus}>
                                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                                <ThemedText style={styles.audioStatusText}>
                                    Audio recorded successfully!
                                </ThemedText>
                            </View>
                            <View style={styles.audioControls}>
                                <TouchableOpacity
                                    style={[styles.audioControlButton, styles.playButton]}
                                    onPress={playAudio}
                                >
                                    <Ionicons name="play" size={18} color="#fff" />
                                    <ThemedText style={styles.audioControlText}>Play</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.audioControlButton, styles.deleteButton]}
                                    onPress={deleteAudio}
                                >
                                    <Ionicons name="trash" size={18} color="#fff" />
                                    <ThemedText style={styles.audioControlText}>Delete</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>

                {/* Reminder */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="alarm" size={18} color="#8B5CF6" />
                        <ThemedText style={styles.sectionTitle}>Reminder</ThemedText>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        value={reminder}
                        onChangeText={setReminder}
                        placeholder="Set a reminder for this screenshot..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={2}
                        textAlignVertical="top"
                    />
                </View>

                {/* Tags */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Ionicons name="pricetags" size={18} color="#8B5CF6" />
                        <ThemedText style={styles.sectionTitle}>Tags</ThemedText>
                    </View>

                    {/* Add Tag Input */}
                    <View style={styles.inlineTagInputContainer}>
                        <TextInput
                            style={styles.inlineTagInput}
                            value={customTag}
                            onChangeText={setCustomTag}
                            placeholder="Add a tag..."
                            placeholderTextColor="#999"
                            onSubmitEditing={addCustomTag}
                            returnKeyType="done"
                        />
                        <TouchableOpacity
                            style={[styles.inlineAddTagButton, !customTag.trim() && styles.inlineAddTagButtonDisabled]}
                            onPress={addCustomTag}
                            disabled={!customTag.trim()}
                        >
                            <Ionicons name="add" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Selected Tag Display - Only one tag allowed */}
                    {selectedTags.length > 0 ? (
                        <View style={styles.selectedTagsContainer}>
                            <TouchableOpacity
                                style={styles.tagChip}
                                onPress={removeTag}
                                activeOpacity={0.7}
                            >
                                <ThemedText style={styles.tagChipText}>{selectedTags[0]}</ThemedText>
                                <Ionicons name="close-circle" size={16} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <ThemedText style={styles.noTagsText}>No tag added yet</ThemedText>
                    )}

                    {/* Quick Tags - Predefined Tags */}
                    <View style={styles.quickTagsSection}>
                        <ThemedText style={styles.quickTagsTitle}>Quick Select (click to replace current tag)</ThemedText>
                        <View style={styles.quickTagsContainer}>
                            {predefinedTags.map((tag) => (
                                <TouchableOpacity
                                    key={tag}
                                    style={[
                                        styles.quickTagChip,
                                        selectedTags.includes(tag) && styles.quickTagChipSelected
                                    ]}
                                    onPress={() => toggleTag(tag)}
                                    activeOpacity={0.7}
                                >
                                    <ThemedText style={[
                                        styles.quickTagChipText,
                                        selectedTags.includes(tag) && styles.quickTagChipTextSelected
                                    ]}>
                                        {tag}
                                    </ThemedText>
                                    {selectedTags.includes(tag) && (
                                        <Ionicons name="checkmark" size={14} color="#fff" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Metadata */}
                {screenshotData && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="information-circle" size={18} color="#8B5CF6" />
                            <ThemedText style={styles.sectionTitle}>Metadata</ThemedText>
                        </View>
                        <View style={styles.metadataContainer}>
                            <View style={styles.metadataItem}>
                                <Ionicons name="calendar" size={14} color="#666" />
                                <ThemedText style={styles.metadataText}>
                                    Created: {formatDate(screenshotData.createdAt)}
                                </ThemedText>
                            </View>
                            <View style={styles.metadataItem}>
                                <Ionicons name="refresh" size={14} color="#666" />
                                <ThemedText style={styles.metadataText}>
                                    Updated: {formatDate(screenshotData.updatedAt)}
                                </ThemedText>
                            </View>
                        </View>
                    </View>
                )}

                {/* Delete Button */}
                {screenshotId && (
                    <TouchableOpacity style={styles.deleteSection} onPress={deleteScreenshotData}>
                        <Ionicons name="trash" size={20} color="#DC2626" />
                        <ThemedText style={styles.deleteSectionText}>Delete Screenshot Data</ThemedText>
                    </TouchableOpacity>
                )}

                <View style={styles.bottomSpacing} />
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    scrollView: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        color: '#6B7280',
        fontWeight: '500',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        gap: 8,
    },
    backButtonText: {
        fontSize: 16,
        color: '#8B5CF6',
        fontWeight: '600',
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 8,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    imagePreviewContainer: {
        margin: 20,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
    },
    imagePreview: {
        height: 200,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        overflow: 'hidden',
        marginTop: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    imageOverlay: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    section: {
        marginHorizontal: 20,
        marginBottom: 16,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1f2937',
    },
    textInput: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#1f2937',
        backgroundColor: '#f9fafb',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    metadataContainer: {
        gap: 8,
    },
    metadataItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metadataText: {
        fontSize: 14,
        color: '#6B7280',
    },
    deleteSection: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginHorizontal: 20,
        marginBottom: 20,
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
        borderRadius: 16,
        padding: 20,
    },
    deleteSectionText: {
        color: '#DC2626',
        fontSize: 16,
        fontWeight: '600',
    },
    bottomSpacing: {
        height: 40,
    },
    // Audio Wave Styles
    audioWaveContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    waveBars: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 60,
        marginBottom: 16,
        gap: 3,
    },
    waveBar: {
        width: 4,
        borderRadius: 2,
        minHeight: 8,
    },
    recordingInfo: {
        alignItems: 'center',
        gap: 8,
    },
    recordingDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#FF6B6B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    recordingPulse: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#fff',
    },
    recordingPulseActive: {
        backgroundColor: '#FF6B6B',
    },
    recordingTime: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1f2937',
    },
    recordingText: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    // Audio Recording Styles
    audioRecordingContainer: {
        alignItems: 'center',
    },
    recordButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#8B5CF6',
        paddingVertical: 16,
        paddingHorizontal: 24,
        borderRadius: 25,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    recordingButton: {
        backgroundColor: '#FF6B6B',
        shadowColor: '#FF6B6B',
    },
    recordButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    // Audio Playback Styles
    audioPlaybackContainer: {
        gap: 16,
    },
    audioStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 16,
        backgroundColor: '#F0FDF4',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#10B981',
    },
    audioStatusText: {
        color: '#065F46',
        fontSize: 14,
        fontWeight: '600',
    },
    audioControls: {
        flexDirection: 'row',
        gap: 12,
    },
    audioControlButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    playButton: {
        backgroundColor: '#10B981',
    },
    deleteButton: {
        backgroundColor: '#EF4444',
    },
    audioControlText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    // Error Styles
    errorBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FEF2F2',
        borderColor: '#FECACA',
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
    },
    errorText: {
        color: '#DC2626',
        fontSize: 12,
        flex: 1,
    },
    // Tag Management Styles
    // Inline Tag Input
    inlineTagInputContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    inlineTagInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        backgroundColor: '#f9fafb',
        color: '#1f2937',
    },
    inlineAddTagButton: {
        backgroundColor: '#8B5CF6',
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    inlineAddTagButtonDisabled: {
        backgroundColor: '#d1d5db',
        shadowOpacity: 0,
        elevation: 0,
    },
    selectedTagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    tagChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#8B5CF6',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    tagChipText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
    noTagsText: {
        fontSize: 14,
        color: '#9CA3AF',
        fontStyle: 'italic',
        marginBottom: 16,
    },
    // Quick Tags Section
    quickTagsSection: {
        marginTop: 8,
    },
    quickTagsTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6B7280',
        marginBottom: 10,
    },
    quickTagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    quickTagChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#f3f4f6',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    quickTagChipSelected: {
        backgroundColor: '#8B5CF6',
        borderColor: '#7C3AED',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 2,
    },
    quickTagChipText: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '600',
    },
    quickTagChipTextSelected: {
        color: '#fff',
    },
});