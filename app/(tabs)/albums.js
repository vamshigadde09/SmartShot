import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, AppTheme as theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const { width, height } = Dimensions.get('window');
const padding = 16;
const spacing = 8;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

let ExpoImageLib = null;
let FastImageLib = null;
try { ExpoImageLib = require('expo-image').Image; } catch { }
try { FastImageLib = require('react-native-fast-image'); } catch { }

const SmartImage = ({ uri, style, mode, onLoad, onError }) => {
    if (ExpoImageLib) {
        return <ExpoImageLib source={{ uri }} style={style} contentFit={mode === 'cover' ? 'cover' : 'contain'} cachePolicy="memory-disk" transition={200} onLoad={onLoad} onError={onError} />;
    }
    if (FastImageLib) {
        const FastImg = FastImageLib.default || FastImageLib;
        return (
            <FastImg
                source={{ uri, priority: FastImageLib.priority.normal, cache: FastImageLib.cacheControl.immutable }}
                style={style}
                resizeMode={mode === 'cover' ? FastImageLib.resizeMode.cover : FastImageLib.resizeMode.contain}
                onLoad={onLoad}
                onError={onError}
            />
        );
    }
    return <Image source={{ uri }} style={style} resizeMode={mode === 'cover' ? 'cover' : 'contain'} onLoad={onLoad} onError={onError} />;
};

// Enhanced SmartMedia with better video handling
const SmartMedia = ({ item, style, isDark }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const errorIconColor = isDark ? Colors.dark.icon : Colors.light.icon;
    const loadingBg = isDark ? Colors.dark.surface : Colors.light.surface;
    const errorBg = isDark ? Colors.dark.surface : Colors.light.surface;

    const handleLoad = () => {
        setLoading(false);
        setError(false);
    };

    const handleError = () => {
        setLoading(false);
        setError(true);
    };

    try {
        if (item.mediaType === 'video') {
            return (
                <View style={[style, { overflow: 'hidden' }]}>
                    <SmartImage
                        uri={item.uri}
                        style={style}
                        mode="cover"
                        onLoad={handleLoad}
                        onError={handleError}
                    />
                    {loading && !error && (
                        <View style={[style, styles.mediaLoading, { backgroundColor: loadingBg }]}>
                            <ActivityIndicator size="small" color="#8B5CF6" />
                        </View>
                    )}
                    {error && (
                        <View style={[style, styles.mediaError, { backgroundColor: errorBg }]}>
                            <Ionicons name="alert-circle" size={20} color={errorIconColor} />
                        </View>
                    )}
                </View>
            );
        }
    } catch { }

    return (
        <View style={style}>
            <SmartImage
                uri={item.uri}
                style={style}
                mode="cover"
                onLoad={handleLoad}
                onError={handleError}
            />
            {loading && !error && (
                <View style={[style, styles.mediaLoading, { backgroundColor: loadingBg }]}>
                    <ActivityIndicator size="small" color="#8B5CF6" />
                </View>
            )}
            {error && (
                <View style={[style, styles.mediaError, { backgroundColor: errorBg }]}>
                    <Ionicons name="alert-circle" size={20} color={errorIconColor} />
                </View>
            )}
        </View>
    );
};

// Enhanced Video Player Component
const EnhancedVideoPlayer = React.forwardRef(({
    source,
    style,
    shouldPlay,
    isMuted,
    onStatusUpdate,
    onLoad,
    onError
}, ref) => {
    const [videoLoaded, setVideoLoaded] = useState(false);
    const [videoError, setVideoError] = useState(false);

    const handleLoad = (status) => {
        setVideoLoaded(true);
        setVideoError(false);
        onLoad?.(status);
    };

    const handleError = (error) => {
        console.log('Video player error:', error);
        setVideoError(true);
        setVideoLoaded(false);
        onError?.(error);
    };

    try {
        const VideoLib = require('expo-av').Video;
        return (
            <View style={style}>
                {!videoLoaded && !videoError && (
                    <View style={[style, styles.videoLoading]}>
                        <ActivityIndicator size="large" color="#8B5CF6" />
                        <ThemedText style={styles.videoLoadingText}>Loading video...</ThemedText>
                    </View>
                )}
                {videoError && (
                    <View style={[style, styles.videoError]}>
                        <Ionicons name="alert-circle" size={48} color="#666" />
                        <ThemedText style={styles.videoErrorText}>Failed to load video</ThemedText>
                    </View>
                )}
                <VideoLib
                    ref={ref}
                    source={source}
                    style={videoLoaded && !videoError ? style : { width: 0, height: 0 }}
                    resizeMode="contain"
                    shouldPlay={shouldPlay && !videoError}
                    isMuted={isMuted}
                    useNativeControls={false}
                    isLooping={true}
                    onPlaybackStatusUpdate={onStatusUpdate}
                    onLoad={handleLoad}
                    onError={handleError}
                    onReadyForDisplay={handleLoad}
                    progressUpdateIntervalMillis={100}
                />
            </View>
        );
    } catch (error) {
        return (
            <View style={[style, styles.videoError]}>
                <Ionicons name="videocam-off" size={48} color="#666" />
                <ThemedText style={styles.videoErrorText}>Video player not available</ThemedText>
            </View>
        );
    }
});

const SmartMediaViewer = ({ item, style, videoRef, shouldPlay, isMuted, onStatusUpdate, onTap }) => {
    try {
        if (item.mediaType === 'video') {
            return (
                <TouchableOpacity activeOpacity={1} onPress={onTap} style={style}>
                    <EnhancedVideoPlayer
                        ref={videoRef}
                        source={{ uri: item.uri }}
                        style={style}
                        shouldPlay={shouldPlay}
                        isMuted={isMuted}
                        onStatusUpdate={onStatusUpdate}
                    />
                </TouchableOpacity>
            );
        }
    } catch (error) {
        console.log('Error in SmartMediaViewer:', error);
    }

    return (
        <TouchableOpacity activeOpacity={1} onPress={onTap} style={style}>
            <SmartImage uri={item.uri} style={style} mode="contain" />
        </TouchableOpacity>
    );
};

const GridControlButton = ({ active, onPress, icon, isDark }) => {
    const inactiveColor = isDark ? Colors.dark.icon : Colors.light.icon;
    const buttonBg = isDark ? Colors.dark.surface : Colors.light.surface;
    const buttonBorder = isDark ? Colors.dark.border : Colors.light.border;

    return (
        <TouchableOpacity
            style={[
                styles.gridButton,
                { backgroundColor: active ? '#8B5CF6' : buttonBg, borderColor: active ? '#8B5CF6' : buttonBorder },
                active && styles.gridButtonActive
            ]}
            onPress={onPress}
        >
            <Ionicons
                name={icon}
                size={16}
                color={active ? '#fff' : inactiveColor}
            />
        </TouchableOpacity>
    );
};

// Helper function to format time
const formatTime = (millis) => {
    if (!millis || millis < 0) return '0:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function AlbumsScreen() {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const themeColors = isDark ? Colors.dark : Colors.light;

    // Albums list state
    const [albums, setAlbums] = useState([]);
    const [albumsLoading, setAlbumsLoading] = useState(false);
    const [albumsRefreshing, setAlbumsRefreshing] = useState(false);

    // Selected album state (null when showing albums, album object when showing images)
    const [selectedAlbum, setSelectedAlbum] = useState(null);

    // Album images state
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

    // Video player state
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [positionMillis, setPositionMillis] = useState(0);
    const [durationMillis, setDurationMillis] = useState(0);
    const [trackWidth, setTrackWidth] = useState(0);
    const isSeekingRef = useRef(false);
    const wasPlayingRef = useRef(false);
    const progress = durationMillis > 0 ? positionMillis / durationMillis : 0;

    // Controls visibility with auto-hide
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef(null);

    const onStatusUpdate = useCallback((status) => {
        try {
            if (!status) return;
            if (typeof status.positionMillis === 'number') setPositionMillis(status.positionMillis);
            if (typeof status.durationMillis === 'number') setDurationMillis(status.durationMillis);
            if (typeof status.isPlaying === 'boolean') setIsPlaying(status.isPlaying);
            if (typeof status.isMuted === 'boolean') setIsMuted(status.isMuted);
        } catch { }
    }, []);

    const seekAt = useCallback(async (x) => {
        try {
            if (!videoRef.current || durationMillis <= 0 || trackWidth <= 0) return;
            const ratio = Math.min(1, Math.max(0, x / trackWidth));
            const newPos = Math.floor(durationMillis * ratio);
            await videoRef.current.setPositionAsync(newPos, { toleranceMillisBefore: 100, toleranceMillisAfter: 100 });
        } catch { }
    }, [durationMillis, trackWidth]);

    const togglePlayPause = useCallback(async () => {
        try {
            const video = videoRef.current;
            if (!video) return;
            if (isPlaying) {
                await video.pauseAsync();
                setIsPlaying(false);
            } else {
                await video.playAsync();
                setIsPlaying(true);
            }
        } catch { }
    }, [isPlaying]);

    const toggleMute = useCallback(async () => {
        try {
            const video = videoRef.current;
            if (!video) return;
            const newMuted = !isMuted;
            await video.setIsMutedAsync(newMuted);
            setIsMuted(newMuted);
        } catch { }
    }, [isMuted]);

    const toggleControls = useCallback(() => {
        setShowControls(v => !v);
        // Auto-hide controls after 3 seconds
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        if (!showControls) {
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        }
    }, [showControls]);

    // Reset video state when switching items or closing viewer
    useEffect(() => {
        if (viewerVisible) {
            setPositionMillis(0);
            setDurationMillis(0);
            setIsPlaying(true);
            setIsMuted(false);

            // Auto-hide controls after 3 seconds
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 3000);
        } else {
            // Stop any playing video when viewer closes
            if (videoRef.current) {
                videoRef.current.stopAsync().catch(() => { });
            }
        }

        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        };
    }, [viewerVisible, viewerIndex]);

    const [pinchScale, setPinchScale] = useState(1);
    const [lastScale, setLastScale] = useState(1);
    const [isPinching, setIsPinching] = useState(false);

    const scaleValue = React.useRef(new Animated.Value(1)).current;
    const opacityValue = React.useRef(new Animated.Value(1)).current;

    const changeGrid = useCallback((cols) => {
        LayoutAnimation.configureNext({
            duration: 400,
            create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
            update: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.scaleXY },
        });
        setColumns(cols);
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
            setIsPinching(true);
            scaleValue.setValue(1);
            opacityValue.setValue(1);
        } else if (state === State.ACTIVE) {
            const currentScale = lastScale * scale;
            Animated.timing(scaleValue, { toValue: Math.max(0.8, Math.min(1.2, currentScale)), duration: 0, useNativeDriver: true }).start();
        } else if (state === State.END || state === State.CANCELLED) {
            setIsPinching(false);
            const newScale = lastScale * scale;
            let newColumns = columns;
            // Toggle between 3 and 6 columns only
            if (newScale > 1.3 && columns === 6) newColumns = 3;
            else if (newScale < 0.7 && columns === 3) newColumns = 6;
            Animated.parallel([
                Animated.timing(scaleValue, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.timing(opacityValue, { toValue: 1, duration: 200, useNativeDriver: true })
            ]).start();
            if (newColumns !== columns) setTimeout(() => { changeGrid(newColumns); }, 100);
            setLastScale(1);
            setPinchScale(1);
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
            const item = getCurrentItem();
            if (!item) return;
            await Share.share({ message: item.filename || 'Media', url: item.uri });
        } catch (e) {
            console.error('Share error:', e);
            Alert.alert('Error', 'Could not share this media');
        }
    };

    const handleEdit = () => {
        const item = getCurrentItem();
        if (!item) return;
        setViewerVisible(false);
        router.push({ pathname: '/edit-screenshot', params: { screenshotUri: item.uri, screenshotId: item.id } });
    };

    const requestStoragePermission = async () => {
        try {
            if (Platform.OS !== 'android') return false;
            const permission = Platform.Version >= 33 ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
            const result = await PermissionsAndroid.request(permission, {
                title: 'Storage Permission',
                message: 'SmartShot needs access to show images.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny'
            });
            return result === PermissionsAndroid.RESULTS.GRANTED;
        } catch {
            return false;
        }
    };

    // Load albums
    const loadAlbums = async () => {
        setAlbumsLoading(true);
        try {
            const mod = NativeModules.ScreenshotModule;
            if (!mod) {
                Alert.alert('Unavailable', 'Albums not supported on this device');
                setAlbums([]);
                return;
            }
            const hasPermission = await mod.checkStoragePermission();
            if (!hasPermission) {
                const granted = await requestStoragePermission();
                if (!granted) {
                    Alert.alert('Permission Required', 'Storage permission is required to view albums.');
                    setAlbums([]);
                    return;
                }
            }
            const rows = await mod.getMediaAlbums();
            setAlbums(rows || []);
        } catch (e) {
            Alert.alert('Error', 'Failed to load albums');
            setAlbums([]);
        } finally {
            setAlbumsLoading(false);
        }
    };

    // Load images for selected album
    const loadImages = async (reset = false) => {
        if (!selectedAlbum) return;
        contentOpacity.setValue(0);
        setLoading(true);
        try {
            if (MediaLibrary) {
                if (!permissionResponse?.granted) {
                    const p = await requestPermission();
                    if (!p?.granted) {
                        Alert.alert('Permission Required', 'Media library permission is required.');
                        return;
                    }
                }

                let albumObj = null;
                try {
                    const albums = await MediaLibrary.getAlbumsAsync();
                    if (selectedAlbum.name) {
                        albumObj = albums.find(a => String(a.title).toLowerCase() === String(selectedAlbum.name).toLowerCase()) || null;
                    }
                } catch { }

                const query = {
                    mediaType: ['photo', 'video'],
                    first: 120,
                    after: reset ? null : endCursor,
                    sortBy: [MediaLibrary.SortBy.creationTime],
                    album: albumObj || undefined,
                };

                const { assets, endCursor: newEndCursor, hasNextPage: hasMore } = await MediaLibrary.getAssetsAsync(query);

                if (reset) setImages(assets);
                else setImages(prev => [...prev, ...assets]);
                setEndCursor(newEndCursor);
                setHasNextPage(hasMore);
            } else {
                // Fallback to native module
                const media = await NativeModules.ScreenshotModule.getAllMedia();
                const filtered = selectedAlbum.id ? (media || []).filter((m) => String(m.bucketId) === String(selectedAlbum.id)) : (media || []);
                const all = filtered.map((m, index) => ({
                    id: m.id || `m_${index}`,
                    uri: m.uri,
                    filename: m.name || `media_${index}`,
                    creationTime: m.dateAdded || Date.now() / 1000,
                    mediaType: m.mediaType || 'image',
                    width: m.width,
                    height: m.height,
                }));
                setImages(all);
                setHasNextPage(false);
            }
        } catch (error) {
            console.error('Error loading images:', error);
            Alert.alert('Error', 'Failed to load media');
            if (reset) setImages([]);
        } finally {
            setLoading(false);
            Animated.timing(contentOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        }
    };

    useEffect(() => {
        if (!selectedAlbum) {
            loadAlbums();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-refresh when screen comes into focus (only if no album selected)
    useFocusEffect(
        useCallback(() => {
            if (!selectedAlbum) {
                loadAlbums();
            }
        }, [selectedAlbum])
    );

    // Load images when album is selected
    useEffect(() => {
        if (selectedAlbum) {
            loadImages(true);
        } else {
            setImages([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAlbum]);

    const onAlbumsRefresh = useCallback(async () => {
        setAlbumsRefreshing(true);
        await loadAlbums();
        setAlbumsRefreshing(false);
    }, []);

    const onImagesRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadImages(true);
        setRefreshing(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAlbum]);

    const openAlbum = (album) => {
        setSelectedAlbum(album);
        setViewerIndex(0);
        setViewerVisible(false);
    };

    const goBackToAlbums = () => {
        setSelectedAlbum(null);
        setImages([]);
        setViewerVisible(false);
        setViewerIndex(0);
    };

    const openViewer = (index) => {
        setViewerIndex(index);
        setViewerVisible(true);
    };

    const renderAlbum = ({ item }) => {
        const scale = new Animated.Value(1);
        const onPressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
        const onPressOut = () => Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
        return (
            <Animated.View style={[styles.albumCard, { transform: [{ scale }] }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    onPress={() => openAlbum(item)}
                >
                    <View style={styles.thumbWrap}>
                        <Image source={{ uri: item.coverUri }} style={styles.thumb} resizeMode="cover" />
                        <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.name}</ThemedText>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    const renderImage = useCallback(({ item: image, index }) => {
        const imageContainerBg = isDark ? Colors.dark.card : Colors.light.surface;
        return (
            <Animated.View key={image.id || index} style={[styles.imageContainer, { width: imageSize, height: imageSize, backgroundColor: imageContainerBg }]}>
                <TouchableOpacity
                    style={[styles.imageTouchable, { width: imageSize, height: imageSize }]}
                    onPress={() => openViewer(index)}
                    activeOpacity={0.7}
                >
                    <SmartMedia item={image} style={[styles.image, { width: imageSize, height: imageSize }]} isDark={isDark} />
                    {image.mediaType === 'video' && (
                        <View style={styles.durationBadge}>
                            <Ionicons name="play" size={10} color="#fff" />
                        </View>
                    )}
                </TouchableOpacity>
            </Animated.View>
        );
    }, [imageSize, isDark]);

    // Show albums list
    if (!selectedAlbum) {
        return (
            <ThemedView style={styles.container}>
                <View style={[styles.albumsHeader, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                    <ThemedText type="title" style={styles.albumsTitle}>Folder</ThemedText>
                </View>
                {albumsLoading && albums.length === 0 ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#8B5CF6" />
                        <ThemedText style={styles.loadingText} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                            Loading...
                        </ThemedText>
                    </View>
                ) : (
                    <FlatList
                        data={albums}
                        keyExtractor={(item, idx) => String(item.id || idx)}
                        renderItem={renderAlbum}
                        numColumns={2}
                        columnWrapperStyle={styles.albumsColumnWrapper}
                        contentContainerStyle={albums.length === 0 ? styles.emptyContainer : styles.albumsGridContent}
                        refreshing={albumsRefreshing}
                        onRefresh={onAlbumsRefresh}
                    />
                )}
            </ThemedView>
        );
    }

    // Show album images
    return (
        <GestureHandlerRootView style={styles.container}>
            <PinchGestureHandler onGestureEvent={onPinchGestureEvent} onHandlerStateChange={onPinchHandlerStateChange}>
                <ThemedView style={styles.container}>
                    {/* Enhanced Header */}
                    <View style={[styles.header, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
                        <View style={styles.headerContent}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={goBackToAlbums}
                            >
                                <Ionicons name="chevron-back" size={24} color="#8B5CF6" />
                            </TouchableOpacity>
                            <View style={styles.titleContainer}>
                                <ThemedText type="title" style={styles.title}>
                                    {selectedAlbum.name || 'Album'}
                                </ThemedText>
                                <ThemedText style={styles.subtitle} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                                    {images.length} items
                                </ThemedText>
                            </View>
                            <View style={styles.headerActions}>
                                <GridControlButton
                                    active={columns === 3}
                                    onPress={() => changeGrid(3)}
                                    icon="grid-outline"
                                    isDark={isDark}
                                />
                                <GridControlButton
                                    active={columns === 6}
                                    onPress={() => changeGrid(6)}
                                    icon="grid"
                                    isDark={isDark}
                                />
                            </View>
                        </View>
                    </View>

                    {loading && images.length === 0 ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#8B5CF6" />
                            <ThemedText style={styles.loadingText} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                                Loading album media...
                            </ThemedText>
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
                                    onRefresh={onImagesRefresh}
                                    windowSize={8}
                                    initialNumToRender={24}
                                    maxToRenderPerBatch={12}
                                    updateCellsBatchingPeriod={40}
                                    removeClippedSubviews
                                    ListEmptyComponent={
                                        <View style={styles.emptyContainer}>
                                            <Ionicons name="images-outline" size={64} color={isDark ? Colors.dark.textSecondary : '#ccc'} />
                                            <ThemedText style={styles.emptyText} darkColor={Colors.dark.text} lightColor={Colors.light.text}>
                                                No media found in this album
                                            </ThemedText>
                                            <ThemedText style={styles.emptySubtext} darkColor={Colors.dark.textSecondary} lightColor={Colors.light.textSecondary}>
                                                Photos and videos in this album will appear here
                                            </ThemedText>
                                        </View>
                                    }
                                />
                            </Animated.View>
                        </Animated.View>
                    )}

                    {/* Enhanced Media Viewer */}
                    <Modal
                        visible={viewerVisible}
                        transparent={false}
                        animationType="fade"
                        onRequestClose={() => setViewerVisible(false)}
                        statusBarTranslucent
                    >
                        <View style={styles.viewerContainer}>
                            {/* Viewer Header */}
                            <View style={[styles.viewerHeader, { opacity: showControls ? 1 : 0 }]} pointerEvents={showControls ? 'auto' : 'none'}>
                                <TouchableOpacity style={styles.closeButton} onPress={() => setViewerVisible(false)}>
                                    <Ionicons name="chevron-down" size={24} color="#fff" />
                                </TouchableOpacity>
                                <View style={styles.viewerTitleContainer}>
                                    <ThemedText style={styles.viewerTitle} numberOfLines={1}>
                                        {images[viewerIndex]?.filename || ''}
                                    </ThemedText>
                                    <ThemedText style={styles.viewerSubtitle}>
                                        {viewerIndex + 1} of {images.length}
                                    </ThemedText>
                                </View>
                                <View style={styles.viewerHeaderActions}>
                                    <TouchableOpacity style={styles.iconButton} onPress={handleShare}>
                                        <Ionicons name="share-outline" size={20} color="#fff" />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.iconButton} onPress={handleEdit}>
                                        <Ionicons name="create-outline" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
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
                                onMomentumScrollEnd={(e) => {
                                    const index = Math.round(e.nativeEvent.contentOffset.x / width);
                                    setViewerIndex(index);
                                }}
                                renderItem={({ item, index }) => (
                                    <View style={styles.viewerPage}>
                                        <SmartMediaViewer
                                            item={item}
                                            style={styles.viewerImage}
                                            videoRef={index === viewerIndex ? videoRef : undefined}
                                            shouldPlay={viewerVisible && viewerIndex === index && isPlaying}
                                            isMuted={isMuted}
                                            onStatusUpdate={index === viewerIndex ? onStatusUpdate : undefined}
                                            onTap={toggleControls}
                                        />
                                    </View>
                                )}
                            />

                            {/* Progress bar */}
                            {images[viewerIndex]?.mediaType === 'video' && (
                                <View style={[styles.progressBarContainer, { opacity: showControls ? 1 : 0 }]} pointerEvents={showControls ? 'auto' : 'none'}>
                                    <View
                                        style={styles.progressBarTrack}
                                        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                                        onStartShouldSetResponder={() => true}
                                        onMoveShouldSetResponder={() => true}
                                        onResponderGrant={async (e) => {
                                            wasPlayingRef.current = isPlaying;
                                            isSeekingRef.current = true;
                                            await seekAt(e.nativeEvent.locationX);
                                            if (wasPlayingRef.current) {
                                                try { await videoRef.current?.playAsync(); } catch { }
                                            }
                                        }}
                                        onResponderMove={async (e) => { await seekAt(e.nativeEvent.locationX); }}
                                        onResponderRelease={async (e) => {
                                            await seekAt(e.nativeEvent.locationX);
                                            if (wasPlayingRef.current) {
                                                try { await videoRef.current?.playAsync(); } catch { }
                                                setIsPlaying(true);
                                            }
                                            isSeekingRef.current = false;
                                        }}
                                    >
                                        <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }]} />
                                    </View>
                                    <View style={styles.progressTimeRow}>
                                        <ThemedText style={styles.progressTimeText}>
                                            {formatTime(positionMillis)}
                                        </ThemedText>
                                        <ThemedText style={styles.progressTimeText}>
                                            {formatTime(durationMillis)}
                                        </ThemedText>
                                    </View>
                                </View>
                            )}

                            {/* Enhanced Footer Controls */}
                            <View style={[styles.viewerActions, { opacity: showControls ? 1 : 0 }]} pointerEvents={showControls ? 'auto' : 'none'}>
                                {images[viewerIndex]?.mediaType === 'video' && (
                                    <>
                                        <TouchableOpacity
                                            style={[styles.viewerIconButton, styles.playPauseButton]}
                                            onPress={togglePlayPause}
                                            accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                                        >
                                            <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color="#fff" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.viewerIconButton, styles.muteButton]}
                                            onPress={toggleMute}
                                            accessibilityLabel={isMuted ? 'Unmute' : 'Mute'}
                                        >
                                            <Ionicons name={isMuted ? 'volume-mute' : 'volume-high'} size={20} color="#fff" />
                                        </TouchableOpacity>
                                    </>
                                )}
                                <TouchableOpacity
                                    style={[styles.viewerIconButton, styles.editButton]}
                                    onPress={handleEdit}
                                    accessibilityLabel="Edit"
                                >
                                    <Ionicons name="create-outline" size={20} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.viewerIconButton, styles.shareButton]}
                                    onPress={handleShare}
                                    accessibilityLabel="Share"
                                >
                                    <Ionicons name="share-outline" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>
                </ThemedView>
            </PinchGestureHandler>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginBottom: 20,
    },
    // Albums list styles
    albumsHeader: {
        padding: 20,
        paddingTop: 60,
        borderBottomWidth: 1,
    },
    albumsTitle: {
        textAlign: 'center',
        marginBottom: 5,
        color: '#8B5CF6',
        fontSize: 20,
        fontWeight: '700',
    },
    albumsSubtitle: {
        textAlign: 'center',
        fontSize: 14,
    },
    albumsColumnWrapper: { justifyContent: 'space-between', marginBottom: 14 },
    albumsGridContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 20 },
    albumCard: {
        flex: 1,
        borderRadius: theme.radius,
        overflow: 'hidden',
        ...theme.shadow,
        marginHorizontal: 4,
    },
    thumbWrap: {
        height: 160,
        borderRadius: theme.radius,
        overflow: 'hidden',
    },
    thumb: { width: '100%', height: '100%' },
    cardTitle: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        padding: 10,
        fontWeight: '600',
        color: '#fff',
        fontSize: 16,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    // Enhanced Header for album images
    header: {
        paddingTop: 60,
        paddingBottom: 12,
        paddingHorizontal: padding,
        borderBottomWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        padding: 8,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 12,
        marginTop: 2,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    gridButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
    },
    gridButtonActive: {
        backgroundColor: '#8B5CF6',
        borderColor: '#8B5CF6',
    },
    pinchInstructions: {
        alignItems: 'center',
        marginTop: 12,
        paddingVertical: 8,
    },
    pinchText: {
        fontSize: 13,
        fontWeight: '500',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        fontSize: 16,
        marginTop: 16,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        minHeight: 300,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    listEmptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    listContent: { padding: padding, paddingBottom: 100 },
    columnWrapper: { justifyContent: 'flex-start', gap: spacing, marginBottom: spacing },
    imageContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    imageTouchable: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    image: { width: '100%', height: '100%', borderRadius: 12 },
    // Loading and error states
    mediaLoading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#f8f9fa',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mediaError: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#f8f9fa',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoLoading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    videoLoadingText: {
        color: '#fff',
        marginTop: 8,
        fontSize: 14,
    },
    videoError: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    videoErrorText: {
        color: '#fff',
        marginTop: 8,
        fontSize: 14,
    },
    durationBadge: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: 8,
        padding: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    // Enhanced viewer styles
    viewerContainer: { flex: 1, backgroundColor: '#000' },
    viewerHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: 'rgba(0,0,0,0.8)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    closeButton: { padding: 8 },
    viewerTitleContainer: {
        flex: 1,
    },
    viewerTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    viewerSubtitle: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        marginTop: 2,
    },
    viewerHeaderActions: {
        flexDirection: 'row',
        gap: 8,
    },
    iconButton: {
        padding: 8,
    },
    viewerPage: { width: width, height: height, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
    viewerImage: { width: '100%', height: '100%' },
    // Progress bar
    progressBarContainer: { position: 'absolute', left: 20, right: 20, bottom: 100 },
    progressBarTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' },
    progressBarFill: { height: 4, backgroundColor: '#8B5CF6' },
    progressTimeRow: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
    progressTimeText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
    // Footer controls
    viewerActions: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: 40,
        paddingTop: 16,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(0,0,0,0.8)',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        gap: 12,
    },
    viewerIconButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    playPauseButton: { backgroundColor: 'rgba(59, 130, 246, 0.3)' },
    muteButton: { backgroundColor: 'rgba(148, 163, 184, 0.3)' },
    shareButton: { backgroundColor: 'rgba(34, 197, 94, 0.3)' },
    editButton: { backgroundColor: 'rgba(59, 130, 246, 0.3)' },
});
