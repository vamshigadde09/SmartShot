import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
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
            const rows = await mod.getImageAlbums();
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
            pathname: '/(tabs)/all-images',
            params: { bucketId: album.id, title: album.name }
        });
    };

    const renderAlbum = ({ item }) => (
        <TouchableOpacity style={styles.item} onPress={() => openAlbum(item)}>
            <Image source={{ uri: item.coverUri }} style={styles.cover} resizeMode="cover" />
            <View style={styles.meta}>
                <ThemedText style={styles.name} numberOfLines={1}>{item.name}</ThemedText>
                <ThemedText style={styles.count}>{item.count} items</ThemedText>
            </View>
        </TouchableOpacity>
    );

    return (
        <ThemedView style={styles.container}>
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
                    contentContainerStyle={albums.length === 0 ? styles.emptyContainer : styles.listContent}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                />
            )}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    loadingText: { marginTop: 10, color: '#666' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    listContent: { padding: 12 },
    item: {
        backgroundColor: '#fff',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 12,
        elevation: 2,
    },
    cover: { width: '100%', height: 160, backgroundColor: '#eee' },
    meta: { padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    name: { fontWeight: '600', color: '#333', maxWidth: '70%' },
    count: { color: '#666' },
});


