import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { loadScreenshotData, readFromExternalStorage } from '@/utils/fileStorage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

const STORAGE_FILE = FileSystem.documentDirectory + 'screenshots.json';
const FALLBACK_STORAGE_FILE = FileSystem.cacheDirectory + 'screenshots.json';

const getStorageFile = async () => {
    try {
        const info = await FileSystem.getInfoAsync(FileSystem.documentDirectory);
        return info.exists ? STORAGE_FILE : FALLBACK_STORAGE_FILE;
    } catch {
        return FALLBACK_STORAGE_FILE;
    }
};

const { width } = Dimensions.get('window');
const imageWidth = width - 40;

export default function ViewScreenshotScreen() {
    const { screenshotUri, screenshotId } = useLocalSearchParams();
    const navigation = useNavigation();
    const [screenshotData, setScreenshotData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [text, setText] = useState('');
    const [audioUri, setAudioUri] = useState('');
    const [hasAudio, setHasAudio] = useState(false);
    const [sound, setSound] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        // Explicitly hide the header
        navigation.setOptions({ headerShown: false });
    }, [navigation]);

    useEffect(() => {
        loadData();
        return () => {
            // Cleanup audio on unmount
            if (sound) {
                sound.unloadAsync();
            }
        };
    }, [screenshotId]);

    const loadData = async () => {
        try {
            setLoading(true);

            // Try to load data by ID first
            if (screenshotId) {
                // Try using the utility function first
                let data = await loadScreenshotData(screenshotId);

                // If not found, try loading from storage file directly (same way edit screen does)
                if (!data) {
                    try {
                        const storageFile = await getStorageFile();
                        const fileInfo = await FileSystem.getInfoAsync(storageFile);
                        if (fileInfo.exists) {
                            const fileContent = await FileSystem.readAsStringAsync(storageFile);
                            const screenshots = JSON.parse(fileContent);
                            // Try both string and number comparison
                            data = screenshots.find(s =>
                                String(s.id) === String(screenshotId) ||
                                s.id === screenshotId ||
                                String(s.id) === screenshotId ||
                                s.id === String(screenshotId)
                            );

                            // If still not found, try by URI
                            if (!data && screenshotUri) {
                                data = screenshots.find(s =>
                                    s.uri === screenshotUri ||
                                    String(s.uri) === String(screenshotUri)
                                );
                            }
                        }

                        // Also try external storage if still not found
                        if (!data) {
                            const externalData = await readFromExternalStorage();
                            if (externalData) {
                                const externalScreenshots = JSON.parse(externalData);
                                data = externalScreenshots.find(s =>
                                    String(s.id) === String(screenshotId) ||
                                    s.id === screenshotId ||
                                    String(s.id) === screenshotId ||
                                    s.id === String(screenshotId)
                                );

                                // If still not found, try by URI
                                if (!data && screenshotUri) {
                                    data = externalScreenshots.find(s =>
                                        s.uri === screenshotUri ||
                                        String(s.uri) === String(screenshotUri)
                                    );
                                }
                            }
                        }
                    } catch (fileError) {
                        console.log('Error reading storage file:', fileError);
                    }
                }

                if (data) {
                    setScreenshotData(data);
                    setText(data.text || '');
                    if (data.audio) {
                        setAudioUri(data.audio);
                        setHasAudio(true);
                    }
                } else {
                    // If no data found but we have screenshotId, just show the image
                    console.log('No data found for screenshotId:', screenshotId);
                    setScreenshotData({ uri: screenshotUri });
                }
            } else {
                // If no screenshotId, try to find by URI
                if (screenshotUri) {
                    try {
                        const storageFile = await getStorageFile();
                        const fileInfo = await FileSystem.getInfoAsync(storageFile);
                        if (fileInfo.exists) {
                            const fileContent = await FileSystem.readAsStringAsync(storageFile);
                            const screenshots = JSON.parse(fileContent);
                            const data = screenshots.find(s =>
                                s.uri === screenshotUri ||
                                String(s.uri) === String(screenshotUri)
                            );
                            if (data) {
                                setScreenshotData(data);
                                setText(data.text || '');
                                if (data.audio) {
                                    setAudioUri(data.audio);
                                    setHasAudio(true);
                                }
                            } else {
                                setScreenshotData({ uri: screenshotUri });
                            }
                        } else {
                            setScreenshotData({ uri: screenshotUri });
                        }
                    } catch (fileError) {
                        console.log('Error reading storage file:', fileError);
                        setScreenshotData({ uri: screenshotUri });
                    }
                } else {
                    setScreenshotData({ uri: screenshotUri });
                }
            }
        } catch (error) {
            console.error('Error loading screenshot data:', error);
            console.error('Error details:', error.message);
            // Don't show alert, just show the image
            setScreenshotData({ uri: screenshotUri });
        } finally {
            setLoading(false);
        }
    };

    const playAudio = async () => {
        try {
            if (!audioUri) return;

            if (sound) {
                // If sound is already loaded, toggle play/pause
                const status = await sound.getStatusAsync();
                if (status.isPlaying) {
                    await sound.pauseAsync();
                    setIsPlaying(false);
                } else {
                    await sound.playAsync();
                    setIsPlaying(true);
                }
            } else {
                // Load and play audio
                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri: audioUri },
                    { shouldPlay: true }
                );
                setSound(newSound);
                setIsPlaying(true);

                // Handle audio completion
                newSound.setOnPlaybackStatusUpdate((status) => {
                    if (status.didJustFinish) {
                        setIsPlaying(false);
                    }
                });
            }
        } catch (error) {
            console.error('Error playing audio:', error);
            Alert.alert('Error', 'Failed to play audio');
        }
    };

    const stopAudio = async () => {
        try {
            if (sound) {
                await sound.stopAsync();
                setIsPlaying(false);
            }
        } catch (error) {
            console.error('Error stopping audio:', error);
        }
    };

    const handleEdit = () => {
        router.push({
            pathname: '/edit-screenshot',
            params: {
                screenshotUri: screenshotData?.uri || screenshotUri,
                screenshotId: screenshotId
            }
        });
    };

    if (loading) {
        return (
            <ThemedView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <ThemedText style={styles.loadingText}>Loading...</ThemedText>
                </View>
            </ThemedView>
        );
    }

    const imageUri = screenshotData?.uri || screenshotUri;

    return (
        <ThemedView style={styles.container}>
            {/* Single Header with Back and Edit */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ThemedText style={styles.backButtonText}>← Back</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
                    <ThemedText style={styles.editButtonText}>Edit</ThemedText>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

                {/* Image Preview */}
                <View style={styles.imageContainer}>
                    <Image
                        source={{ uri: imageUri }}
                        style={styles.image}
                        resizeMode="contain"
                    />
                </View>

                {/* Text Section */}
                {text && text.trim() && (
                    <View style={styles.section}>
                        <ThemedText style={styles.sectionTitle}>📝 Notes</ThemedText>
                        <View style={styles.textContainer}>
                            <ThemedText style={styles.text}>{text}</ThemedText>
                        </View>
                    </View>
                )}

                {/* Audio Section */}
                {hasAudio && audioUri && (
                    <View style={styles.section}>
                        <ThemedText style={styles.sectionTitle}>🎵 Audio</ThemedText>
                        <View style={styles.audioContainer}>
                            <TouchableOpacity
                                style={[styles.audioButton, isPlaying && styles.audioButtonPlaying]}
                                onPress={playAudio}
                            >
                                <ThemedText style={styles.audioButtonText}>
                                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                                </ThemedText>
                            </TouchableOpacity>
                            {isPlaying && (
                                <TouchableOpacity
                                    style={styles.stopButton}
                                    onPress={stopAudio}
                                >
                                    <ThemedText style={styles.stopButtonText}>⏹ Stop</ThemedText>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {/* Empty State */}
                {!text && !hasAudio && (
                    <View style={styles.emptyContainer}>
                        <ThemedText style={styles.emptyText}>No notes or audio added</ThemedText>
                        <ThemedText style={styles.emptySubtext}>Tap Edit to add notes or audio</ThemedText>
                    </View>
                )}
            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: '#666',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingTop: 20,
        paddingBottom: 40,
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
        borderBottomColor: '#e5e5e5',
    },
    backButton: {
        padding: 8,
    },
    backButtonText: {
        fontSize: 16,
        color: '#8B5CF6',
        fontWeight: '600',
    },
    editButton: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    editButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    imageContainer: {
        width: imageWidth,
        height: imageWidth * 1.2,
        backgroundColor: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#333',
        marginBottom: 12,
    },
    textContainer: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    text: {
        fontSize: 16,
        lineHeight: 24,
        color: '#333',
    },
    audioContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    audioButton: {
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        minWidth: 120,
    },
    audioButtonPlaying: {
        backgroundColor: '#6B46C1',
    },
    audioButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    stopButton: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
    },
    stopButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        color: '#666',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#999',
    },
});

