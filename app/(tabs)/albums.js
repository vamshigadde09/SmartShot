import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppTheme as theme } from '@/constants/theme';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert, Animated, FlatList,
    Image,
    NativeModules,
    PermissionsAndroid,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

export default function AlbumsScreen() {
    const [albums, setAlbums] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadAlbums(); }, []);

    const requestStoragePermission = async () => {
        try {
            if (Platform.OS !== 'android') return false;
            const permission = Platform.Version >= 33
                ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
                : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
            const result = await PermissionsAndroid.request(permission, {
                title: 'Storage Permission',
                message: 'SmartShot needs access to your media to show albums.',
                buttonPositive: 'Allow',
                buttonNegative: 'Deny',
            });
            return result === PermissionsAndroid.RESULTS.GRANTED;
        } catch {
            return false;
        }
    };

    const loadAlbums = async () => {
        setLoading(true);
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
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAlbums();
        setRefreshing(false);
    }, []);

    const openAlbum = (album) => {
        router.push({
            pathname: '/(tabs)/album-images',
            params: { bucketId: album.id, title: album.name }
        });
    };

    const renderAlbum = ({ item }) => {
        const scale = new Animated.Value(1);
        const onPressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
        const onPressOut = () => Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
        return (
            <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
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

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <ThemedText type="title" style={styles.title}>Folder</ThemedText>
                <ThemedText style={styles.subtitle}>{albums.length} album{albums.length !== 1 ? 's' : ''}</ThemedText>
            </View>
            {loading && albums.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <ThemedText style={styles.loadingText}>Loading...</ThemedText>
                </View>
            ) : (
                <FlatList
                    data={albums}
                    keyExtractor={(item, idx) => String(item.id || idx)}
                    renderItem={renderAlbum}
                    numColumns={2}
                    columnWrapperStyle={styles.columnWrapper}
                    contentContainerStyle={albums.length === 0 ? styles.emptyContainer : styles.gridContent}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                />
            )}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
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
        fontSize: 20,
        fontWeight: '700',
    },
    subtitle: {
        textAlign: 'center',
        color: '#666',
        fontSize: 14,
    },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    loadingText: { marginTop: 10, color: '#666' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    gridContent: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 20 },
    columnWrapper: { justifyContent: 'space-between', marginBottom: 14 },
    card: {
        flex: 1,
        borderRadius: theme.radius,
        overflow: 'hidden',
        backgroundColor: theme.card,
        ...theme.shadow,
        marginHorizontal: 4,
    },
    thumbWrap: {
        height: 160,
        borderRadius: theme.radius,
        overflow: 'hidden',
        backgroundColor: '#e9e9ef',
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
});


