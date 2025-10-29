import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
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
const imageSize = (width - 60) / 2; // 2 columns with padding

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
    const [screenshots, setScreenshots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const contentOpacity = React.useRef(new Animated.Value(0)).current;
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);
    const viewerListRef = React.useRef(null);

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
        loadScreenshots(true);
    }, []);

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
            const path = await getStorageFile();
            const info = await FileSystem.getInfoAsync(path);
            if (!info.exists) return { ids: new Set(), uris: new Set() };
            const json = await FileSystem.readAsStringAsync(path);
            const items = JSON.parse(json);
            const ids = new Set();
            const uris = new Set();
            for (const it of items) {
                const edited = Boolean((it.text && it.text.trim()) || it.audio || it.reminder || it.isTodo || (it.tags && String(it.tags).trim()));
                if (!edited) continue;
                if (it.id) ids.add(String(it.id));
                if (it.uri) uris.add(String(it.uri));
            }
            return { ids, uris };
        } catch {
            return { ids: new Set(), uris: new Set() };
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
                    const { ids, uris } = await loadEditedIndex();
                    const filtered = (screenshots || []).filter((s) => ids.has(String(s.id)) || uris.has(String(s.uri)));
                    setScreenshots(filtered);
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
        setRefreshing(true);
        await loadScreenshots(true);
        setRefreshing(false);
    }, []);

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

    const renderScreenshot = useCallback(({ item: screenshot, index }) => (
        <TouchableOpacity
            key={screenshot.id || index}
            style={styles.imageContainer}
            onPress={() => openViewer(index)}
        >
            <SmartImage
                uri={screenshot.uri}
                style={styles.image}
                mode="cover"
                onError={() => {
                    console.log('Failed to load image:', screenshot.uri);
                }}
            />
            <View style={styles.imageInfo}>
                <ThemedText style={styles.imageName} numberOfLines={1}>
                    {screenshot.name}
                </ThemedText>
                <ThemedText style={styles.imageDate}>
                    {formatDate(screenshot.dateAdded)}
                </ThemedText>
            </View>
        </TouchableOpacity>
    ), []);

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <ThemedText type="title" style={styles.title}>
                    Screenshot Gallery
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                    {screenshots.length} screenshots found
                </ThemedText>
            </View>

            {loading && screenshots.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <ThemedText style={styles.loadingText}>Loading...</ThemedText>
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
                                <ThemedText style={styles.emptyText}>
                                    No screenshots found
                                </ThemedText>
                                <ThemedText style={styles.emptySubtext}>
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
                                    <ThemedText style={styles.loadingFooterText}>Loading more...</ThemedText>
                                </View>
                            ) : null
                        }
                    />
                </Animated.View>
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
        backgroundColor: '#f5f5f5',
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
        color: '#666',
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
        color: '#666',
        marginBottom: 10,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
        marginBottom: 20,
    },
    imageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 10,
        justifyContent: 'space-between',
    },
    imageContainer: {
        width: imageSize,
        marginBottom: 15,
        backgroundColor: '#fff',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: imageSize,
        backgroundColor: '#f0f0f0',
    },
    imageInfo: {
        padding: 8,
    },
    imageName: {
        fontSize: 12,
        fontWeight: '500',
        color: '#333',
        marginBottom: 2,
    },
    imageDate: {
        fontSize: 10,
        color: '#666',
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
    columnWrapper: {
        justifyContent: 'space-between',
        paddingHorizontal: 10,
    },
    listEmptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    listContent: {
        paddingBottom: 20,
    },
    loadingFooter: {
        padding: 20,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    loadingFooterText: {
        marginLeft: 10,
        color: '#666',
        fontSize: 14,
    },
});
