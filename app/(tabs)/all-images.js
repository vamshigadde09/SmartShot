import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// Try to import expo-media-library, fallback to native module if not available
let MediaLibrary = null;
try {
    MediaLibrary = require('expo-media-library');
} catch (e) {
    console.log('expo-media-library not available, using native module');
}

const { width } = Dimensions.get('window');
const imageSize = (width - 60) / 3; // 3 columns with padding

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

export default function AllImagesScreen() {
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

    useEffect(() => {
        loadImages(true);
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
                // Use native module - getScreenshots now returns ALL images (no filtering)
                const screenshots = await NativeModules.ScreenshotModule.getScreenshots();
                console.log('getScreenshots result (all images):', screenshots.length);

                const allImages = screenshots.map((img, index) => ({
                    id: img.id || `img_${index}`,
                    uri: img.uri,
                    filename: img.name || `image_${index}.jpg`,
                    creationTime: img.dateAdded || Date.now() / 1000,
                    width: 1000,
                    height: 1000,
                }));

                setImages(allImages);
                setHasNextPage(false); // Native module loads all at once
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

    const renderImage = useCallback(({ item: image, index }) => (
        <TouchableOpacity
            key={image.id || index}
            style={styles.imageContainer}
            onPress={() => openViewer(index)}
        >
            <SmartImage
                uri={image.uri}
                style={styles.image}
                mode="cover"
                onError={() => {
                    console.log('Failed to load image:', image.uri);
                }}
            />
            <View style={styles.imageInfo}>
                <ThemedText style={styles.imageName} numberOfLines={1}>
                    {image.filename}
                </ThemedText>
                <ThemedText style={styles.imageDate}>
                    {formatDate(image.creationTime)}
                </ThemedText>
            </View>
        </TouchableOpacity>
    ), []);

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <ThemedText type="title" style={styles.title}>
                    All Images
                </ThemedText>
                <ThemedText style={styles.subtitle}>
                    {filteredImages.length} images found
                </ThemedText>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search images..."
                        placeholderTextColor="#999"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {loading && images.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <ThemedText style={styles.loadingText}>Loading images...</ThemedText>
                </View>
            ) : (
                <Animated.View style={{ flex: 1, opacity: contentOpacity }}>
                    <FlatList
                        data={filteredImages}
                        keyExtractor={(item, idx) => String(item.id || item.uri || idx)}
                        numColumns={3}
                        columnWrapperStyle={styles.columnWrapper}
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
                                <SmartImage
                                    uri={item.uri}
                                    style={styles.viewerImage}
                                    mode="contain"
                                />
                            </View>
                        )}
                    />
                    <View style={styles.viewerActions}>
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
    listContent: {
        paddingBottom: 20,
    },
    columnWrapper: {
        justifyContent: 'space-between',
        paddingHorizontal: 10,
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
        fontSize: 10,
        fontWeight: '500',
        color: '#333',
        marginBottom: 2,
    },
    imageDate: {
        fontSize: 8,
        color: '#666',
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
    },
    actionButton: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 20,
        minWidth: 90,
        alignItems: 'center',
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
