import { ThemedText } from '@/components/themed-text';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    Image,
    LayoutAnimation,
    Modal,
    NativeModules,
    PermissionsAndroid,
    Platform,
    Share,
    StyleSheet,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { GestureHandlerRootView, PinchGestureHandler, State } from 'react-native-gesture-handler';

// Try to import expo-media-library, fallback to native module if not available
let MediaLibrary = null;
try {
    MediaLibrary = require('expo-media-library');
} catch (e) {
    console.log('expo-media-library not available, using native module');
}

const { width } = Dimensions.get('window');
const padding = 0;
const spacing = 0;

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Removed getColumnsAndSize function - using direct calculation instead

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

const SmartMedia = ({ item, style }) => {
    try {
        if (item.mediaType === 'video') {
            const VideoLib = require('expo-av').Video;
            return (
                <VideoLib
                    source={{ uri: item.uri }}
                    style={style}
                    resizeMode="cover"
                    shouldPlay={false}
                    isMuted
                />
            );
        }
    } catch { }
    return <SmartImage uri={item.uri} style={style} mode="cover" />;
};

const SmartMediaViewer = ({ item, style }) => {
    try {
        if (item.mediaType === 'video') {
            const VideoLib = require('expo-av').Video;
            return (
                <VideoLib
                    source={{ uri: item.uri }}
                    style={style}
                    resizeMode="contain"
                    shouldPlay
                    isMuted={false}
                    useNativeControls
                />
            );
        }
    } catch { }
    return <SmartImage uri={item.uri} style={style} mode="contain" />;
};

export default function AllImagesScreen() {
    const { bucketId, title } = useLocalSearchParams();
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [endCursor, setEndCursor] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredImages, setFilteredImages] = useState([]);
    const contentOpacity = React.useRef(new Animated.Value(0)).current;
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);
    const viewerListRef = React.useRef(null);
    const [permissionResponse, requestPermission] = MediaLibrary ? MediaLibrary.usePermissions() : [null, null];

    // Dynamic grid state management with smooth animations
    const [columns, setColumns] = useState(3);
    const screenWidth = Dimensions.get('window').width;
    const imageSize = (screenWidth - padding * 2 - spacing * (columns - 1)) / columns;

    // Pinch gesture state
    const [pinchScale, setPinchScale] = useState(1);
    const [lastScale, setLastScale] = useState(1);
    const [isPinching, setIsPinching] = useState(false);

    // Animated values for smooth pinch scaling
    const scaleValue = React.useRef(new Animated.Value(1)).current;
    const opacityValue = React.useRef(new Animated.Value(1)).current;

    // Smooth grid change with LayoutAnimation
    const changeGrid = useCallback((cols) => {
        // Configure a more dramatic animation for grid changes
        LayoutAnimation.configureNext({
            duration: 600,
            create: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
                duration: 400,
            },
            update: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.scaleXY,
                duration: 600,
            },
            delete: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
                duration: 300,
            },
        });

        // Add a slight delay to make the animation more visible
        setTimeout(() => {
            setColumns(cols);
        }, 50);
    }, []);

    // Pinch gesture handler with smooth animations
    const onPinchGestureEvent = useCallback((event) => {
        const scale = event.nativeEvent.scale;
        setPinchScale(scale);

        // Real-time scaling animation during pinch
        if (isPinching) {
            Animated.timing(scaleValue, {
                toValue: Math.max(0.8, Math.min(1.2, scale)),
                duration: 0,
                useNativeDriver: true,
            }).start();

            // Subtle opacity change for visual feedback
            Animated.timing(opacityValue, {
                toValue: Math.max(0.7, Math.min(1, 1 - (Math.abs(scale - 1) * 0.3))),
                duration: 0,
                useNativeDriver: true,
            }).start();
        }
    }, [isPinching, scaleValue, opacityValue]);

    const onPinchHandlerStateChange = useCallback((event) => {
        const { state, scale } = event.nativeEvent;

        if (state === State.BEGAN) {
            setIsPinching(true);
            // Reset scale values
            scaleValue.setValue(1);
            opacityValue.setValue(1);
        } else if (state === State.ACTIVE) {
            // Continue real-time scaling during active pinch
            const currentScale = lastScale * scale;
            Animated.timing(scaleValue, {
                toValue: Math.max(0.8, Math.min(1.2, currentScale)),
                duration: 0,
                useNativeDriver: true,
            }).start();
        } else if (state === State.END || state === State.CANCELLED) {
            setIsPinching(false);

            // Determine grid based on pinch scale
            const newScale = lastScale * scale;
            let newColumns = columns;

            if (newScale > 1.3 && columns > 2) {
                // Pinch in - fewer columns (zoom in)
                newColumns = Math.max(2, columns - 1);
            } else if (newScale < 0.7 && columns < 6) {
                // Pinch out - more columns (zoom out)
                newColumns = Math.min(6, columns + 1);
            }

            // Smooth transition back to normal scale
            Animated.parallel([
                Animated.timing(scaleValue, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityValue, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                })
            ]).start();

            if (newColumns !== columns) {
                // Add a slight delay for the scale animation to complete
                setTimeout(() => {
                    changeGrid(newColumns);
                }, 100);
            }

            setLastScale(1);
            setPinchScale(1);
        }
    }, [columns, lastScale, changeGrid, scaleValue, opacityValue]);

    // Initialize with 3 columns on mount
    useEffect(() => {
        setColumns(3);
    }, []);

    const getCurrentItem = () => {
        if (!filteredImages || filteredImages.length === 0) return null;
        const safeIndex = Math.min(Math.max(viewerIndex, 0), filteredImages.length - 1);
        return filteredImages[safeIndex];
    };

    const handleShare = async () => {
        try {
            const item = getCurrentItem();
            if (!item) return;
            await Share.share({
                message: item.filename || 'Image',
                url: item.uri,
            });
        } catch (e) {
            console.error('Share error:', e);
            Alert.alert('Error', 'Could not share this image');
        }
    };

    const handleDelete = async () => {
        try {
            const item = getCurrentItem();
            if (!item) return;

            const confirm = await new Promise((resolve) => {
                Alert.alert(
                    'Delete image',
                    'Are you sure you want to delete this image? This action cannot be undone.',
                    [
                        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
                    ]
                );
            });
            if (!confirm) return;

            if (MediaLibrary) {
                // Use expo-media-library
                const result = await MediaLibrary.deleteAssetsAsync([item.id]);
                if (result) {
                    // Update local state
                    setImages((prev) => prev.filter((img) => img.id !== item.id));
                    setFilteredImages((prev) => prev.filter((img) => img.id !== item.id));

                    if (filteredImages.length === 1) {
                        setViewerVisible(false);
                        setViewerIndex(0);
                    } else {
                        setViewerIndex((idx) => Math.min(idx, filteredImages.length - 2));
                    }
                }
            } else {
                // Use native module (simplified - just remove from local state)
                setImages((prev) => prev.filter((img) => img.id !== item.id));
                setFilteredImages((prev) => prev.filter((img) => img.id !== item.id));

                if (filteredImages.length === 1) {
                    setViewerVisible(false);
                    setViewerIndex(0);
                } else {
                    setViewerIndex((idx) => Math.min(idx, filteredImages.length - 2));
                }
            }
        } catch (e) {
            console.error('Delete error:', e);
            Alert.alert('Error', 'Could not delete this image');
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

    useEffect(() => {
        const initializeImages = async () => {
            try {
                await loadImages(true);
            } catch (error) {
                console.error('Error initializing images:', error);
            }
        };
        initializeImages();
    }, []);

    // Preload next batch of images for smoother scrolling
    useEffect(() => {
        if (images.length > 0 && FastImageLib) {
            const nextBatch = images.slice(0, 20).map(asset => ({ uri: asset.uri }));
            FastImageLib.preload(nextBatch);
        }
    }, [images]);

    // Filter images based on search query
    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredImages(images);
        } else {
            const filtered = images.filter(image =>
                image.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                image.albumName?.toLowerCase().includes(searchQuery.toLowerCase())
            );
            setFilteredImages(filtered);
        }
    }, [images, searchQuery]);

    const requestStoragePermission = async () => {
        try {
            if (Platform.OS !== 'android') return false;

            const permission = Platform.Version >= 33
                ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
                : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

            const result = await PermissionsAndroid.request(permission, {
                title: 'Storage Permission',
                message: 'SmartShot needs access to your media to show images.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny',
            });

            return result === PermissionsAndroid.RESULTS.GRANTED;
        } catch (e) {
            console.error('Error requesting storage permission:', e);
            return false;
        }
    };

    const loadImages = async (reset = false) => {
        try {
            // Check permissions first
            if (MediaLibrary) {
                if (!permissionResponse?.granted) {
                    const permission = await requestPermission();
                    if (!permission.granted) {
                        Alert.alert('Permission Required', 'Media library permission is required to view images.');
                        return;
                    }
                }
            } else {
                // Use native module for permissions (same as Screenshots screen)
                try {
                    const ScreenshotModule = NativeModules.ScreenshotModule;
                    if (ScreenshotModule) {
                        // Check permissions first
                        const hasPermission = await ScreenshotModule.checkStoragePermission();
                        if (!hasPermission) {
                            const granted = await requestStoragePermission();
                            if (!granted) {
                                Alert.alert(
                                    'Permission Required',
                                    'Storage permission is required to view images.',
                                    [{ text: 'OK' }]
                                );
                                setImages([]);
                                return;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Error checking permissions:', err);
                    return;
                }
            }
        } catch (error) {
            console.error('Error in permission check:', error);
            return;
        }

        contentOpacity.setValue(0);
        setLoading(true);
        try {
            if (MediaLibrary) {
                // Use expo-media-library
                const { assets, endCursor: newEndCursor, hasNextPage: hasMore } = await MediaLibrary.getAssetsAsync({
                    mediaType: ['photo'],
                    first: 100,
                    after: reset ? null : endCursor,
                    sortBy: [MediaLibrary.SortBy.creationTime],
                });

                if (reset) {
                    setImages(assets);
                } else {
                    setImages(prev => [...prev, ...assets]);
                }

                setEndCursor(newEndCursor);
                setHasNextPage(hasMore);
            } else {
                // Use native module - merged images and videos
                const media = await NativeModules.ScreenshotModule.getAllMedia();
                console.log('getAllMedia result:', media.length);
                const filtered = bucketId
                    ? media.filter((m) => String(m.bucketId) === String(bucketId))
                    : media;
                const allMedia = filtered.map((m, index) => ({
                    id: m.id || `m_${index}`,
                    uri: m.uri,
                    filename: m.name || `media_${index}`,
                    creationTime: m.dateAdded || Date.now() / 1000,
                    mediaType: m.mediaType || 'image',
                }));

                setImages(allMedia);
                setHasNextPage(false);
            }
        } catch (error) {
            console.error('Error loading images:', error);
            Alert.alert('Error', 'Failed to load images');
            if (reset) setImages([]);
        } finally {
            setLoading(false);
            Animated.timing(contentOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    };

    const loadMoreImages = useCallback(() => {
        if (!loading && hasNextPage) {
            loadImages(false);
        }
    }, [loading, hasNextPage, endCursor]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadImages(true);
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
    };

    const renderImage = useCallback(({ item: image, index }) => {
        try {
            return (
                <Animated.View
                    key={image.id || index}
                    style={[
                        styles.imageContainer,
                        {
                            width: imageSize,
                            height: imageSize,
                            // Add a subtle scale animation for repositioning
                            transform: [{
                                scale: new Animated.Value(1)
                            }]
                        }
                    ]}
                >
                    <TouchableOpacity
                        style={[styles.imageTouchable, { width: imageSize, height: imageSize }]}
                        onPress={() => openViewer(index)}
                    >
                        <SmartMedia item={image} style={[styles.image, { width: imageSize, height: imageSize }]} />
                        {/* thumbnail only - no labels */}
                    </TouchableOpacity>
                </Animated.View>
            );
        } catch (error) {
            console.error('Error in renderImage:', error);
            return null;
        }
    }, [imageSize, columns, openViewer]);

    return (
        <GestureHandlerRootView style={styles.container}>
            <PinchGestureHandler
                onGestureEvent={onPinchGestureEvent}
                onHandlerStateChange={onPinchHandlerStateChange}
            >
                <View style={styles.container}>
                    <View style={styles.header}>
                        <ThemedText type="title" style={styles.title}>
                            {title ? String(title) : 'All Images'}
                        </ThemedText>
                    </View>

                    {loading && images.length === 0 ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#8B5CF6" />
                            <ThemedText style={styles.loadingText}>Loading images...</ThemedText>
                        </View>
                    ) : (
                        <Animated.View style={{
                            flex: 1,
                            opacity: contentOpacity,
                            transform: [
                                { scale: scaleValue },
                            ]
                        }}>
                            <Animated.View style={{
                                flex: 1,
                                opacity: opacityValue,
                            }}>
                                <FlatList
                                    data={filteredImages}
                                    keyExtractor={(item, idx) => {
                                        try {
                                            return String(item.id || item.uri || idx);
                                        } catch (error) {
                                            Alert.alert('Debug KeyExtractor Error', `Error in keyExtractor: ${error.message}`, [{ text: 'OK' }]);
                                            return String(idx);
                                        }
                                    }}
                                    numColumns={columns}
                                    key={`grid-${columns}-${filteredImages.length}`} // re-render grid cleanly with more specific key
                                    columnWrapperStyle={columns > 1 ? styles.columnWrapper : null}
                                    contentContainerStyle={filteredImages.length === 0 ? styles.listEmptyContainer : styles.listContent}
                                    renderItem={renderImage}
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    onEndReached={loadMoreImages}
                                    onEndReachedThreshold={0.5}
                                    windowSize={10}
                                    initialNumToRender={30}
                                    maxToRenderPerBatch={15}
                                    updateCellsBatchingPeriod={50}
                                    removeClippedSubviews
                                    ListEmptyComponent={
                                        <View style={styles.emptyContainer}>
                                            <ThemedText style={styles.emptyText}>
                                                {searchQuery ? 'No images found matching your search' : 'No images found'}
                                            </ThemedText>
                                            <ThemedText style={styles.emptySubtext}>
                                                {searchQuery ? 'Try a different search term' : 'Take some photos to see them here'}
                                            </ThemedText>
                                            <TouchableOpacity style={styles.refreshButton} onPress={() => loadImages(true)}>
                                                <ThemedText style={styles.refreshButtonText}>
                                                    Refresh
                                                </ThemedText>
                                            </TouchableOpacity>
                                        </View>
                                    }
                                    ListFooterComponent={
                                        loading && images.length > 0 ? (
                                            <View style={styles.loadingFooter}>
                                                <ActivityIndicator size="small" color="#8B5CF6" />
                                                <ThemedText style={styles.loadingFooterText}>Loading more...</ThemedText>
                                            </View>
                                        ) : null
                                    }
                                />
                            </Animated.View>
                        </Animated.View>
                    )}

                    <Modal
                        visible={viewerVisible}
                        transparent={false}
                        animationType="fade"
                        onRequestClose={() => setViewerVisible(false)}
                        onShow={() => {
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
                                    {filteredImages[viewerIndex] ? filteredImages[viewerIndex].filename : ''}
                                </ThemedText>
                            </View>

                            <FlatList
                                ref={viewerListRef}
                                data={filteredImages}
                                keyExtractor={(item, idx) => String(item.id || idx)}
                                horizontal
                                pagingEnabled
                                initialScrollIndex={Math.min(Math.max(viewerIndex, 0), Math.max(filteredImages.length - 1, 0))}
                                getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                                showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={(e) => {
                                    const index = Math.round(e.nativeEvent.contentOffset.x / width);
                                    setViewerIndex(index);
                                }}
                                renderItem={({ item }) => (
                                    <View style={styles.viewerPage}>
                                        <SmartMediaViewer item={item} style={styles.viewerImage} />
                                    </View>
                                )}
                            />
                            <View style={styles.viewerActions}>
                                <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                                    <ThemedText style={styles.actionText}>Share</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.actionButton} onPress={handleEdit}>
                                    <ThemedText style={styles.actionText}>Edit</ThemedText>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
                                    <ThemedText style={styles.actionText}>Delete</ThemedText>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                </View>
            </PinchGestureHandler>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        paddingTop: 60,
        paddingBottom: 12,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderBottomWidth: 0.5,
        borderBottomColor: '#E5E7EB',
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
        marginBottom: 15,
    },
    searchContainer: {
        marginTop: 10,
    },
    searchInput: {
        backgroundColor: '#f0f0f0',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 10,
        fontSize: 16,
        color: '#333',
    },
    debugButton: {
        backgroundColor: '#ff6b6b',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginTop: 10,
        alignSelf: 'center',
    },
    debugButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    gridControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginVertical: 10,
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.05)',
        borderRadius: 20,
    },
    gridInfoText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    gridButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    gridButton: {
        backgroundColor: '#f0f0f0',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    gridButtonActive: {
        backgroundColor: '#8B5CF6',
        borderColor: '#8B5CF6',
    },
    gridButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    gridButtonTextActive: {
        color: '#fff',
    },
    pinchInstructions: {
        alignItems: 'center',
        marginVertical: 8,
        paddingHorizontal: 16,
    },
    pinchText: {
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
        fontStyle: 'italic',
    },
    pinchIndicator: {
        marginTop: 8,
        paddingVertical: 4,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    pinchIndicatorText: {
        fontSize: 12,
        color: '#8B5CF6',
        textAlign: 'center',
        fontWeight: '600',
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
    listEmptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    listContent: { paddingTop: 0, paddingBottom: 0 },
    columnWrapper: { justifyContent: 'flex-start', paddingHorizontal: 2 },
    imageContainer: {
        margin: 2,
    },
    imageTouchable: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
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
});