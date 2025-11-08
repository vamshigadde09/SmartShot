import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getAllScreenshots, readFromExternalStorage } from '@/utils/fileStorage';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    Modal,
    NativeModules,
    PermissionsAndroid,
    Platform,
    Share,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');
const imageSize = width / 2; // tight 2-column grid, no gaps

// Prefer expo-image (no peer conflict), then FastImage; fallback to RN Image
let ExpoImageLib = null;
let FastImageLib = null;
try { ExpoImageLib = require('expo-image').Image; } catch (e) { ExpoImageLib = null; }
try { FastImageLib = require('react-native-fast-image'); } catch (e) { FastImageLib = null; }

const SmartImage = ({ uri, style, mode }) => {
    if (ExpoImageLib) {
        return (
            <ExpoImageLib
                source={{ uri }}
                style={style}
                contentFit={mode === 'cover' ? 'cover' : 'contain'}
                cachePolicy="memory-disk"
                transition={200}
            />
        );
    }
    if (FastImageLib) {
        const FastImg = FastImageLib.default || FastImageLib;
        return (
            <FastImg
                source={{ uri, priority: FastImageLib.priority.normal, cache: FastImageLib.cacheControl.immutable }}
                style={style}
                resizeMode={mode === 'cover' ? FastImageLib.resizeMode.cover : FastImageLib.resizeMode.contain}
            />
        );
    }
    return (
        <Image
            source={{ uri }}
            style={style}
            resizeMode={mode === 'cover' ? 'cover' : 'contain'}
        />
    );
};

export default function GalleryScreen() {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const themeColors = isDark ? Colors.dark : Colors.light;

    // View toggle state ('screenshots' or 'tags')
    const [activeView, setActiveView] = useState('screenshots');

    // Screenshots state
    const [screenshots, setScreenshots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const contentOpacity = React.useRef(new Animated.Value(0)).current;
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);
    const viewerListRef = React.useRef(null);

    // Tags state
    const [tags, setTags] = useState([]);
    const [tagsLoading, setTagsLoading] = useState(false);
    const [tagsRefreshing, setTagsRefreshing] = useState(false);

    const getCurrentItem = () => {
        if (!screenshots || screenshots.length === 0) return null;
        const safeIndex = Math.min(Math.max(viewerIndex, 0), screenshots.length - 1);
        return screenshots[safeIndex];
    };

    const handleShare = async () => {
        try {
            const item = getCurrentItem();
            if (!item) return;
            await Share.share({
                message: item.name || 'Screenshot',
                url: item.uri,
            });
        } catch (e) {
            console.error('Share error:', e);
            Alert.alert('Error', 'Could not share this image');
        }
    };

    const handleEdit = () => {
        const item = getCurrentItem();
        if (!item) return;

        // Close the viewer first
        setViewerVisible(false);

        // Navigate to edit screen with screenshot data
        router.push({
            pathname: '/edit-screenshot',
            params: {
                screenshotUri: item.uri,
                screenshotId: item.id
            }
        });
    };

    const handleDelete = async () => {
        try {
            const item = getCurrentItem();
            if (!item) return;

            const confirm = await new Promise((resolve) => {
                Alert.alert(
                    'Delete screenshot',
                    'Are you sure you want to delete this image? This action cannot be undone.',
                    [
                        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                    ]
                );
            });
            if (!confirm) return;

            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule && typeof ScreenshotModule.deleteScreenshot === 'function') {
                const ok = await ScreenshotModule.deleteScreenshot(item.uri);
                if (!ok) throw new Error('Native delete reported failure');
            } else {
                Alert.alert('Not Available', 'Delete is not supported on this device.');
                return;
            }

            // Update local state after delete
            setScreenshots((prev) => {
                const next = prev.filter((s) => s.uri !== item.uri);
                if (next.length === 0) {
                    setViewerVisible(false);
                    setViewerIndex(0);
                } else {
                    setViewerIndex((idx) => Math.min(idx, next.length - 1));
                }
                return next;
            });
        } catch (e) {
            console.error('Delete error:', e);
            Alert.alert('Error', 'Could not delete this image');
        }
    };

    useEffect(() => {
        if (activeView === 'screenshots') {
            loadScreenshots(true);
        } else {
            loadTags();
        }
    }, [activeView]);

    // Auto-refresh when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            if (activeView === 'screenshots') {
                loadScreenshots(true);
            } else {
                loadTags();
            }
        }, [activeView])
    );

    // Preload next batch of images for smoother scrolling
    useEffect(() => {
        if (screenshots.length > 0 && FastImageLib) {
            const nextBatch = screenshots.slice(0, 20).map(asset => ({ uri: asset.uri }));
            FastImageLib.preload(nextBatch);
        }
    }, [screenshots]);

    const requestStoragePermission = async () => {
        try {
            if (Platform.OS !== 'android') return false;

            const permission = Platform.Version >= 33
                ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
                : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

            const result = await PermissionsAndroid.request(permission, {
                title: 'Storage Permission',
                message: 'SmartShot needs access to your media to show screenshots.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny',
            });

            return result === PermissionsAndroid.RESULTS.GRANTED;
        } catch (e) {
            console.error('Error requesting storage permission:', e);
            return false;
        }
    };

    const getStorageFile = async () => {
        try {
            const docInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory);
            const storagePath = (docInfo?.exists ? FileSystem.documentDirectory : FileSystem.cacheDirectory) + 'screenshots.json';
            return storagePath;
        } catch {
            return FileSystem.cacheDirectory + 'screenshots.json';
        }
    };

    const loadEditedIndex = async () => {
        try {
            // Use getAllScreenshots which checks internal storage and already sorts by updatedAt
            let items = await getAllScreenshots();

            // If still no items, try local storage as final fallback
            if (!items || items.length === 0) {
                try {
                    const path = await getStorageFile();
                    const info = await FileSystem.getInfoAsync(path);
                    if (info.exists) {
                        const json = await FileSystem.readAsStringAsync(path);
                        const localItems = JSON.parse(json);
                        if (localItems && Array.isArray(localItems)) {
                            items = localItems;
                            // Sort by updatedAt if available
                            items.sort((a, b) => {
                                const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                                const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                                return bTime - aTime; // Latest first
                            });
                        }
                    }
                } catch (e) {
                    console.log('Local storage check failed:', e);
                }
            }

            const ids = new Set();
            const uris = new Set();
            const editedMap = new Map(); // Map to store edited items with their updatedAt for sorting
            for (const it of items || []) {
                // Filter logic:
                // - Show screenshots that have text, audio, or reminder (even if they also have tags)
                // - DON'T show screenshots that ONLY have tags (no text, no audio, no reminder)
                // - Screenshots with only tags should be shown in the tags view, not in screenshots view
                const hasText = it.text && it.text.trim();
                const hasAudio = Boolean(it.audio);
                const hasReminder = Boolean(it.reminder);
                const hasOtherContent = hasText || hasAudio || hasReminder;

                // Only include if it has content other than just tags
                if (!hasOtherContent) continue;
                if (it.id) {
                    ids.add(String(it.id));
                    editedMap.set(String(it.id), it);
                }
                if (it.uri) {
                    uris.add(String(it.uri));
                    editedMap.set(String(it.uri), it);
                }
            }
            return { ids, uris, editedMap };
        } catch (error) {
            console.error('Error loading edited index:', error);
            return { ids: new Set(), uris: new Set(), editedMap: new Map() };
        }
    };

    const loadScreenshots = async (reset = false) => {
        contentOpacity.setValue(0);
        setLoading(true);
        try {
            if (Platform.OS === 'android') {
                const ScreenshotModule = NativeModules.ScreenshotModule;
                if (ScreenshotModule) {
                    // Check permissions first
                    const hasPermission = await ScreenshotModule.checkStoragePermission();
                    if (!hasPermission) {
                        const granted = await requestStoragePermission();
                        if (!granted) {
                            Alert.alert(
                                'Permission Required',
                                'Storage permission is required to view screenshots.',
                                [{ text: 'OK' }]
                            );
                            setScreenshots([]);
                            return;
                        }
                    }

                    // Get screenshots using native module
                    const screenshots = await ScreenshotModule.getScreenshots();
                    // Filter to only those that have been edited in our storage
                    const { ids, uris, editedMap } = await loadEditedIndex();
                    const filtered = (screenshots || []).filter((s) => ids.has(String(s.id)) || uris.has(String(s.uri)));

                    // Sort by updatedAt (latest edited first)
                    const sorted = filtered.sort((a, b) => {
                        const aEdited = editedMap.get(String(a.id)) || editedMap.get(String(a.uri));
                        const bEdited = editedMap.get(String(b.id)) || editedMap.get(String(b.uri));

                        const aTime = aEdited?.updatedAt ? new Date(aEdited.updatedAt).getTime() : 0;
                        const bTime = bEdited?.updatedAt ? new Date(bEdited.updatedAt).getTime() : 0;

                        // If both have updatedAt, sort by it (latest first)
                        if (aTime > 0 && bTime > 0) {
                            return bTime - aTime;
                        }
                        // If only one has updatedAt, prioritize it
                        if (aTime > 0) return -1;
                        if (bTime > 0) return 1;
                        // Otherwise, keep original order (or sort by dateAdded if available)
                        const aDate = a.dateAdded || 0;
                        const bDate = b.dateAdded || 0;
                        return bDate - aDate;
                    });

                    setScreenshots(sorted);
                }
            } else {
                // For iOS, show empty state
                setScreenshots([]);
            }
        } catch (error) {
            console.error('Error loading screenshots:', error);
            Alert.alert('Error', 'Failed to load screenshots');
            setScreenshots([]);
        } finally {
            setLoading(false);
            Animated.timing(contentOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    };



    const onRefresh = useCallback(async () => {
        if (activeView === 'screenshots') {
            setRefreshing(true);
            await loadScreenshots(true);
            setRefreshing(false);
        } else {
            setTagsRefreshing(true);
            await loadTags();
            setTagsRefreshing(false);
        }
    }, [activeView]);

    const formatDate = (timestamp) => {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString();
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const openViewer = (index) => {
        setViewerIndex(index);
        setViewerVisible(true);
        // scroll after modal shows handled by onShow
    };

    const openViewScreen = (screenshot) => {
        router.push({
            pathname: '/view-screenshot',
            params: {
                screenshotUri: screenshot.uri,
                screenshotId: screenshot.id
            }
        });
    };

    // Load tags function
    const loadTags = async () => {
        setTagsLoading(true);
        try {
            // Use getAllScreenshots which checks both local and external storage
            let items = await getAllScreenshots();

            // If no items found, try loading from external storage directly as fallback
            if (!items || items.length === 0) {
                try {
                    const externalData = await readFromExternalStorage();
                    if (externalData) {
                        const externalItems = JSON.parse(externalData);
                        if (externalItems && externalItems.length > 0) {
                            items = externalItems;
                        }
                    }
                } catch (e) {
                    console.log('External storage check failed:', e);
                }
            }

            const map = new Map();
            for (const it of items) {
                if (!it.tags) continue;
                const list = String(it.tags)
                    .split(',')
                    .map(t => t.trim())
                    .filter(Boolean);
                for (const t of list) {
                    const existing = map.get(t) || { count: 0, firstImageUri: null };
                    existing.count = existing.count + 1;
                    // Set first image URI if not already set
                    if (!existing.firstImageUri && it.uri) {
                        existing.firstImageUri = it.uri;
                    }
                    map.set(t, existing);
                }
            }
            const rows = Array.from(map.entries())
                .map(([name, data]) => ({
                    name,
                    count: data.count,
                    coverUri: data.firstImageUri
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
            setTags(rows);
        } catch (e) {
            console.error('Failed to load tags', e);
            Alert.alert('Error', 'Failed to load tags');
            setTags([]);
        } finally {
            setTagsLoading(false);
        }
    };

    const openTag = (tag) => {
        router.push({ pathname: '/tag-images', params: { tag: tag.name } });
    };

    const renderScreenshot = useCallback(({ item: screenshot, index }) => {
        const imageContainerBg = isDark ? Colors.dark.card : Colors.light.surface;
        return (
            <TouchableOpacity
                key={screenshot.id || index}
                style={[styles.imageContainer, { backgroundColor: imageContainerBg }]}
                onPress={() => {
                    router.push({
                        pathname: '/view-screenshot',
                        params: {
                            screenshotUri: screenshot.uri,
                            screenshotId: screenshot.id
                        }
                    });
                }}
                onLongPress={() => {
                    setViewerIndex(index);
                    setViewerVisible(true);
                }}
            >
                <SmartImage
                    uri={screenshot.uri}
                    style={styles.image}
                    mode="cover"
                    onError={() => {
                        console.log('Failed to load image:', screenshot.uri);
                    }}
                />
            </TouchableOpacity>
        );
    }, [isDark]);

    const renderTag = useCallback(({ item: tag }) => {
        const scale = new Animated.Value(1);
        const onPressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
        const onPressOut = () => Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
        const tagCardBg = isDark ? Colors.dark.card : Colors.light.card;
        const tagThumbBg = isDark ? Colors.dark.surface : Colors.light.surface;
        return (
            <Animated.View style={[styles.tagCard, { transform: [{ scale }], backgroundColor: tagCardBg }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    onPress={() => {
                        router.push({ pathname: '/tag-images', params: { tag: tag.name } });
                    }}
                >
                    <View style={[styles.tagThumbWrap, { backgroundColor: tagThumbBg }]}>
                        {tag.coverUri ? (
                            <Image source={{ uri: tag.coverUri }} style={styles.tagThumb} resizeMode="cover" />
                        ) : (
                            <View style={styles.tagThumb} />
                        )}
                        <ThemedText style={styles.tagCardTitle} numberOfLines={1}>{tag.name}</ThemedText>
                        <ThemedText style={styles.tagCount}>{tag.count} item{tag.count !== 1 ? 's' : ''}</ThemedText>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    }, [isDark]);

    const toggleContainerBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
    const settingsButtonBg = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

    return (
        <ThemedView style={styles.container}>
            <View style={[styles.header, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                {/* Title Row */}
                <View style={styles.headerTitleRow}>
                    <View style={styles.titleContainer}>
                        <ThemedText type="title" style={styles.title}>
                            Gallery
                        </ThemedText>
                    </View>
                    <TouchableOpacity
                        style={[styles.settingsButton, { backgroundColor: settingsButtonBg }]}
                        onPress={() => router.push('/(tabs)/settings')}
                    >
                        <Ionicons name="settings-outline" size={24} color="#8B5CF6" />
                    </TouchableOpacity>
                </View>

                {/* Toggle Section */}
                <View style={styles.headerTopRow}>
                    <View style={[styles.toggleContainer, { backgroundColor: toggleContainerBg }]}>
                        <TouchableOpacity
                            style={[styles.toggleButton, activeView === 'screenshots' && styles.toggleButtonActive]}
                            onPress={() => setActiveView('screenshots')}
                        >
                            <ThemedText style={[styles.toggleButtonText, activeView === 'screenshots' && styles.toggleButtonTextActive]}>
                                Screenshots
                            </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.toggleButton, activeView === 'tags' && styles.toggleButtonActive]}
                            onPress={() => setActiveView('tags')}
                        >
                            <ThemedText style={[styles.toggleButtonText, activeView === 'tags' && styles.toggleButtonTextActive]}>
                                Tags
                            </ThemedText>
                        </TouchableOpacity>
                    </View>
                </View>

            </View>

            {/* Screenshots View */}
            {activeView === 'screenshots' && (
                <>
                    {loading && screenshots.length === 0 ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#8B5CF6" />
                            <ThemedText style={styles.loadingText} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                                Loading...
                            </ThemedText>
                        </View>
                    ) : (
                        <Animated.View style={{ flex: 1, opacity: contentOpacity }}>
                            <FlatList
                                data={screenshots}
                                keyExtractor={(item, idx) => String(item.id || item.uri || idx)}
                                numColumns={2}
                                columnWrapperStyle={styles.columnWrapper}
                                contentContainerStyle={screenshots.length === 0 ? styles.listEmptyContainer : styles.listContent}
                                renderItem={renderScreenshot}
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                windowSize={10}
                                initialNumToRender={20}
                                maxToRenderPerBatch={8}
                                updateCellsBatchingPeriod={50}
                                removeClippedSubviews
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <ThemedText style={styles.emptyText} darkColor={Colors.dark.text} lightColor={Colors.light.text}>
                                            No screenshots found
                                        </ThemedText>
                                        <ThemedText style={styles.emptySubtext} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                                            Take some screenshots to see them here
                                        </ThemedText>
                                        <TouchableOpacity style={styles.refreshButton} onPress={() => loadScreenshots(true)}>
                                            <ThemedText style={styles.refreshButtonText}>
                                                Refresh
                                            </ThemedText>
                                        </TouchableOpacity>
                                    </View>
                                }
                                ListFooterComponent={
                                    loading && screenshots.length > 0 ? (
                                        <View style={styles.loadingFooter}>
                                            <ActivityIndicator size="small" color="#8B5CF6" />
                                            <ThemedText style={styles.loadingFooterText} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                                                Loading more...
                                            </ThemedText>
                                        </View>
                                    ) : null
                                }
                            />
                        </Animated.View>
                    )}
                </>
            )}

            {/* Tags View */}
            {activeView === 'tags' && (
                <>
                    {tagsLoading && tags.length === 0 ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#8B5CF6" />
                            <ThemedText style={styles.loadingText} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                                Loading tags...
                            </ThemedText>
                        </View>
                    ) : (
                        <FlatList
                            data={tags}
                            keyExtractor={(item) => item.name}
                            renderItem={renderTag}
                            numColumns={2}
                            columnWrapperStyle={styles.tagsColumnWrapper}
                            contentContainerStyle={tags.length === 0 ? styles.listEmptyContainer : styles.tagsGridContent}
                            refreshing={tagsRefreshing}
                            onRefresh={onRefresh}
                            ListEmptyComponent={
                                <View style={styles.emptyContainer}>
                                    <ThemedText style={styles.emptyText} darkColor={Colors.dark.text} lightColor={Colors.light.text}>
                                        No tags yet
                                    </ThemedText>
                                    <ThemedText style={styles.emptySubtext} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                                        Add tags to screenshots to see them here
                                    </ThemedText>
                                </View>
                            }
                        />
                    )}
                </>
            )}

            <Modal
                visible={viewerVisible}
                transparent={false}
                animationType="fade"
                onRequestClose={() => setViewerVisible(false)}
                onShow={() => {
                    // jump to selected index when modal opens
                    if (viewerListRef.current && viewerIndex >= 0) {
                        try {
                            viewerListRef.current.scrollToIndex({ index: viewerIndex, animated: false });
                        } catch { }
                    }
                }}
            >
                <View style={styles.viewerContainer}>
                    <View style={styles.viewerHeader}>
                        <TouchableOpacity style={styles.closeButton} onPress={() => setViewerVisible(false)}>
                            <ThemedText style={styles.closeButtonText}>Close</ThemedText>
                        </TouchableOpacity>
                        <ThemedText style={styles.viewerTitle} numberOfLines={1}>
                            {screenshots[viewerIndex] ? screenshots[viewerIndex].name : ''}
                        </ThemedText>
                    </View>

                    <FlatList
                        ref={viewerListRef}
                        data={screenshots}
                        keyExtractor={(item, idx) => String(item.id || idx)}
                        horizontal
                        pagingEnabled
                        initialScrollIndex={Math.min(Math.max(viewerIndex, 0), Math.max(screenshots.length - 1, 0))}
                        getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(e) => {
                            const index = Math.round(e.nativeEvent.contentOffset.x / width);
                            setViewerIndex(index);
                        }}
                        renderItem={({ item }) => (
                            <View style={styles.viewerPage}>
                                <SmartImage
                                    uri={item.uri}
                                    style={styles.viewerImage}
                                    mode="contain"
                                />
                            </View>
                        )}
                    />
                    <View style={styles.viewerActions}>
                        <TouchableOpacity style={styles.actionButton} onPress={handleEdit}>
                            <ThemedText style={styles.actionText}>Edit</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                            <ThemedText style={styles.actionText}>Share</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
                            <ThemedText style={styles.actionText}>Delete</ThemedText>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingBottom: 100, // Add padding for floating dock
    },
    header: {
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    toggleContainer: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 4,
        flex: 1,
        maxWidth: 300,
    },
    settingsButton: {
        padding: 8,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toggleButtonActive: {
        backgroundColor: '#8B5CF6',
    },
    toggleButtonText: {
        fontSize: 14,
        fontWeight: '600',
    },
    toggleButtonTextActive: {
        color: '#FFF',
    },
    title: {
        fontSize: 26,
        fontWeight: '700',
    },
    subtitle: {
        textAlign: 'center',
        marginTop: 8,
    },
    scrollView: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        fontSize: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 20,
    },
    imageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 0,
        justifyContent: 'flex-start',
    },
    imageContainer: {
        width: imageSize,
        margin: 2,
        borderRadius: 12,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: imageSize,
        backgroundColor: '#1F1F1F',
        borderRadius: 0,
    },
    footer: {
        padding: 20,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    loadMoreButton: {
        backgroundColor: '#8B5CF6',
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
    },
    loadMoreButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    viewerContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    viewerHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        paddingTop: 40,
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: 'rgba(0,0,0,0.35)',
        flexDirection: 'row',
        alignItems: 'center',
    },
    closeButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 6,
        marginRight: 12,
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    viewerTitle: {
        color: '#fff',
        fontSize: 14,
        flex: 1,
    },
    viewerPage: {
        width: width,
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    viewerImage: {
        width: '100%',
        height: '100%',
    },
    viewerActions: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: 24,
        paddingTop: 12,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(0,0,0,0.35)',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        gap: 8,
    },
    actionButton: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 20,
        minWidth: 70,
        alignItems: 'center',
        flex: 1,
    },
    deleteButton: {
        backgroundColor: 'rgba(255,59,48,0.35)',
    },
    actionText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    refreshButton: {
        backgroundColor: '#6C757D',
        padding: 12,
        borderRadius: 6,
        alignItems: 'center',
    },
    refreshButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    columnWrapper: { justifyContent: 'flex-start', paddingHorizontal: 0 },
    listEmptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    listContent: { paddingTop: 0, paddingBottom: 0 },
    loadingFooter: {
        padding: 20,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    loadingFooterText: {
        marginLeft: 10,
        fontSize: 14,
    },
    // Tags styles
    tagsColumnWrapper: { justifyContent: 'space-between', paddingHorizontal: 2 },
    tagsGridContent: { paddingTop: 0, paddingBottom: 0 },
    tagCard: {
        flex: 1,
        marginHorizontal: 2,
        marginBottom: 4,
        borderRadius: 12,
        overflow: 'hidden',
    },
    tagThumbWrap: {
        height: 160,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
    },
    tagThumb: {
        width: '100%',
        height: '100%',
    },
    tagCardTitle: {
        position: 'absolute',
        bottom: 30,
        width: '100%',
        padding: 10,
        fontWeight: '600',
        color: '#fff',
        fontSize: 16,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    tagCount: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        padding: 10,
        color: '#fff',
        fontSize: 12,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
});
