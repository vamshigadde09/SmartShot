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

let MediaLibrary = null;
try { MediaLibrary = require('expo-media-library'); } catch { }

const { width } = Dimensions.get('window');
const padding = 0;
const spacing = 0;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

let ExpoImageLib = null;
let FastImageLib = null;
try { ExpoImageLib = require('expo-image').Image; } catch { }
try { FastImageLib = require('react-native-fast-image'); } catch { }

const SmartImage = ({ uri, style, mode }) => {
    if (ExpoImageLib) {
        return <ExpoImageLib source={{ uri }} style={style} contentFit={mode === 'cover' ? 'cover' : 'contain'} cachePolicy="memory-disk" transition={200} />;
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
    return <Image source={{ uri }} style={style} resizeMode={mode === 'cover' ? 'cover' : 'contain'} />;
};

export default function AlbumImagesScreen() {
    const { bucketId, title } = useLocalSearchParams();
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [hasNextPage, setHasNextPage] = useState(true);
    const [endCursor, setEndCursor] = useState(null);
    const contentOpacity = React.useRef(new Animated.Value(0)).current;
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);
    const viewerListRef = React.useRef(null);
    const [permissionResponse, requestPermission] = MediaLibrary ? MediaLibrary.usePermissions() : [null, null];

    const [columns, setColumns] = useState(3);
    const screenWidth = Dimensions.get('window').width;
    const imageSize = (screenWidth - padding * 2 - spacing * (columns - 1)) / columns;

    const [pinchScale, setPinchScale] = useState(1);
    const [lastScale, setLastScale] = useState(1);
    const [isPinching, setIsPinching] = useState(false);

    const scaleValue = React.useRef(new Animated.Value(1)).current;
    const opacityValue = React.useRef(new Animated.Value(1)).current;

    const changeGrid = useCallback((cols) => {
        LayoutAnimation.configureNext({
            duration: 600,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity, duration: 400 },
            update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleXY, duration: 600 },
            delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity, duration: 300 },
        });
        setTimeout(() => setColumns(cols), 50);
    }, []);

    const onPinchGestureEvent = useCallback((event) => {
        const scale = event.nativeEvent.scale;
        setPinchScale(scale);
        if (isPinching) {
            Animated.timing(scaleValue, { toValue: Math.max(0.8, Math.min(1.2, scale)), duration: 0, useNativeDriver: true }).start();
            Animated.timing(opacityValue, { toValue: Math.max(0.7, Math.min(1, 1 - (Math.abs(scale - 1) * 0.3))), duration: 0, useNativeDriver: true }).start();
        }
    }, [isPinching, scaleValue, opacityValue]);

    const onPinchHandlerStateChange = useCallback((event) => {
        const { state, scale } = event.nativeEvent;
        if (state === State.BEGAN) {
            setIsPinching(true); scaleValue.setValue(1); opacityValue.setValue(1);
        } else if (state === State.ACTIVE) {
            const currentScale = lastScale * scale;
            Animated.timing(scaleValue, { toValue: Math.max(0.8, Math.min(1.2, currentScale)), duration: 0, useNativeDriver: true }).start();
        } else if (state === State.END || state === State.CANCELLED) {
            setIsPinching(false);
            const newScale = lastScale * scale;
            let newColumns = columns;
            if (newScale > 1.3 && columns > 2) newColumns = Math.max(2, columns - 1);
            else if (newScale < 0.7 && columns < 6) newColumns = Math.min(6, columns + 1);
            Animated.parallel([
                Animated.timing(scaleValue, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.timing(opacityValue, { toValue: 1, duration: 200, useNativeDriver: true })
            ]).start();
            if (newColumns !== columns) setTimeout(() => { changeGrid(newColumns); }, 100);
            setLastScale(1); setPinchScale(1);
        }
    }, [columns, lastScale, changeGrid, scaleValue, opacityValue]);

    useEffect(() => { setColumns(3); }, []);

    const getCurrentItem = () => {
        if (!images || images.length === 0) return null;
        const safeIndex = Math.min(Math.max(viewerIndex, 0), images.length - 1);
        return images[safeIndex];
    };

    const handleShare = async () => {
        try {
            const item = getCurrentItem(); if (!item) return;
            await Share.share({ message: item.filename || 'Image', url: item.uri });
        } catch (e) {
            console.error('Share error:', e); Alert.alert('Error', 'Could not share this image');
        }
    };

    const handleEdit = () => {
        const item = getCurrentItem(); if (!item) return;
        setViewerVisible(false);
        router.push({ pathname: '/edit-screenshot', params: { screenshotUri: item.uri, screenshotId: item.id } });
    };

    const requestStoragePermission = async () => {
        try {
            if (Platform.OS !== 'android') return false;
            const permission = Platform.Version >= 33 ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
            const result = await PermissionsAndroid.request(permission, { title: 'Storage Permission', message: 'SmartShot needs access to show images.', buttonPositive: 'Allow', buttonNegative: 'Deny' });
            return result === PermissionsAndroid.RESULTS.GRANTED;
        } catch { return false; }
    };

    const loadImages = async (reset = false) => {
        contentOpacity.setValue(0); setLoading(true);
        try {
            if (MediaLibrary) {
                if (!permissionResponse?.granted) {
                    const p = await requestPermission(); if (!p.granted) { Alert.alert('Permission Required', 'Media library permission is required.'); return; }
                }
                const query = { mediaType: ['photo'], first: 100, after: reset ? null : endCursor, sortBy: [MediaLibrary.SortBy.creationTime], album: null };
                // If bucketId provided and expo-media-library supports filtering by album name, we could map, but fallback to native path below when available
            }
            // Use native module to filter by bucket
            const screenshots = await NativeModules.ScreenshotModule.getScreenshots();
            const filtered = bucketId ? (screenshots || []).filter((img) => String(img.bucketId) === String(bucketId)) : (screenshots || []);
            const all = filtered.map((img, index) => ({ id: img.id || `img_${index}`, uri: img.uri, filename: img.name || `image_${index}.jpg`, creationTime: img.dateAdded || Date.now() / 1000 }));
            setImages(all); setHasNextPage(false);
        } catch (error) {
            console.error('Error loading images:', error); Alert.alert('Error', 'Failed to load images'); if (reset) setImages([]);
        } finally {
            setLoading(false); Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }
    };

    useEffect(() => { loadImages(true); }, [bucketId]);

    const onRefresh = useCallback(async () => { setRefreshing(true); await loadImages(true); setRefreshing(false); }, [bucketId]);

    const openViewer = (index) => { setViewerIndex(index); setViewerVisible(true); };

    const renderImage = useCallback(({ item: image, index }) => (
        <Animated.View key={image.id || index} style={[styles.imageContainer, { width: imageSize, height: imageSize, transform: [{ scale: new Animated.Value(1) }] }]}>
            <TouchableOpacity style={[styles.imageTouchable, { width: imageSize, height: imageSize }]} onPress={() => openViewer(index)}>
                <SmartImage uri={image.uri} style={[styles.image, { width: imageSize, height: imageSize }]} mode="cover" />
            </TouchableOpacity>
        </Animated.View>
    ), [imageSize]);

    return (
        <GestureHandlerRootView style={styles.container}>
            <PinchGestureHandler onGestureEvent={onPinchGestureEvent} onHandlerStateChange={onPinchHandlerStateChange}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <ThemedText type="title" style={styles.title}>{title ? String(title) : 'Album'}</ThemedText>
                    </View>

                    {loading && images.length === 0 ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#8B5CF6" />
                            <ThemedText style={styles.loadingText}>Loading images...</ThemedText>
                        </View>
                    ) : (
                        <Animated.View style={{ flex: 1, opacity: contentOpacity, transform: [{ scale: scaleValue }] }}>
                            <Animated.View style={{ flex: 1, opacity: opacityValue }}>
                                <FlatList
                                    data={images}
                                    keyExtractor={(item, idx) => String(item.id || item.uri || idx)}
                                    numColumns={columns}
                                    key={`grid-${columns}-${images.length}`}
                                    columnWrapperStyle={columns > 1 ? styles.columnWrapper : null}
                                    contentContainerStyle={images.length === 0 ? styles.listEmptyContainer : styles.listContent}
                                    renderItem={renderImage}
                                    refreshing={refreshing}
                                    onRefresh={onRefresh}
                                    windowSize={10}
                                    initialNumToRender={30}
                                    maxToRenderPerBatch={15}
                                    updateCellsBatchingPeriod={50}
                                    removeClippedSubviews
                                />
                            </Animated.View>
                        </Animated.View>
                    )}

                    <Modal visible={viewerVisible} transparent={false} animationType="fade" onRequestClose={() => setViewerVisible(false)}>
                        <View style={styles.viewerContainer}>
                            <View style={styles.viewerHeader}>
                                <TouchableOpacity style={styles.closeButton} onPress={() => setViewerVisible(false)}>
                                    <ThemedText style={styles.closeButtonText}>Close</ThemedText>
                                </TouchableOpacity>
                                <ThemedText style={styles.viewerTitle} numberOfLines={1}>{images[viewerIndex] ? images[viewerIndex].filename : ''}</ThemedText>
                            </View>
                            <FlatList
                                ref={viewerListRef}
                                data={images}
                                keyExtractor={(item, idx) => String(item.id || idx)}
                                horizontal
                                pagingEnabled
                                initialScrollIndex={Math.min(Math.max(viewerIndex, 0), Math.max(images.length - 1, 0))}
                                getItemLayout={(data, index) => ({ length: width, offset: width * index, index })}
                                showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={(e) => { const index = Math.round(e.nativeEvent.contentOffset.x / width); setViewerIndex(index); }}
                                renderItem={({ item }) => (
                                    <View style={styles.viewerPage}>
                                        <SmartImage uri={item.uri} style={styles.viewerImage} mode="contain" />
                                    </View>
                                )}
                            />
                            <View style={styles.viewerActions}>
                                <TouchableOpacity style={styles.actionButton} onPress={handleEdit}><ThemedText style={styles.actionText}>Edit</ThemedText></TouchableOpacity>
                                <TouchableOpacity style={styles.actionButton} onPress={handleShare}><ThemedText style={styles.actionText}>Share</ThemedText></TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                </View>
            </PinchGestureHandler>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: {
        paddingTop: 60,
        paddingBottom: 12,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderBottomWidth: 0.5,
        borderBottomColor: '#E5E7EB',
    },
    title: { textAlign: 'center', marginBottom: 5, color: '#8B5CF6' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    loadingText: { fontSize: 16, color: '#666' },
    listEmptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    listContent: { paddingTop: 0, paddingBottom: 0 },
    columnWrapper: { justifyContent: 'flex-start', paddingHorizontal: 2 },
    imageContainer: { margin: 2 },
    imageTouchable: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    image: { width: '100%', backgroundColor: '#f0f0f0', borderRadius: 8 },
    viewerContainer: { flex: 1, backgroundColor: '#000' },
    viewerHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingTop: 40, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row', alignItems: 'center' },
    closeButton: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, marginRight: 12 },
    closeButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    viewerTitle: { color: '#fff', fontSize: 14, flex: 1 },
    viewerPage: { width: width, flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
    viewerImage: { width: '100%', height: '100%' },
    viewerActions: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 24, paddingTop: 12, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', gap: 8 },
    actionButton: { backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20, minWidth: 70, alignItems: 'center', flex: 1 },
    actionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});


