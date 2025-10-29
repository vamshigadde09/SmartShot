import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import * as FileSystem from 'expo-file-system/legacy';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

const STORAGE_FILE = FileSystem.documentDirectory + 'screenshots.json';
const FALLBACK_STORAGE_FILE = FileSystem.cacheDirectory + 'screenshots.json';
const { width } = Dimensions.get('window');
const imageSize = (width - 40 - 10) / 2; // padding 20 each side, spacing 10

const getStorageFile = async () => {
    try {
        const info = await FileSystem.getInfoAsync(FileSystem.documentDirectory);
        return info.exists ? STORAGE_FILE : FALLBACK_STORAGE_FILE;
    } catch {
        return FALLBACK_STORAGE_FILE;
    }
};

export default function TagImagesScreen() {
    const { tag } = useLocalSearchParams();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { load(); }, [tag]);

    const load = async () => {
        setLoading(true);
        try {
            const path = await getStorageFile();
            const info = await FileSystem.getInfoAsync(path);
            if (!info.exists) { setItems([]); return; }
            const json = await FileSystem.readAsStringAsync(path);
            const all = JSON.parse(json);
            const filtered = all.filter((it) => String(it.tags || '')
                .split(',').map(t => t.trim()).filter(Boolean).includes(String(tag)));
            setItems(filtered);
        } catch (e) {
            console.error('Failed to load tag images', e);
            Alert.alert('Error', 'Failed to load tagged images');
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

    const openEdit = (it) => {
        router.push({ pathname: '/edit-screenshot', params: { screenshotUri: it.uri, screenshotId: it.id } });
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => openEdit(item)}>
            <Image source={{ uri: item.uri }} style={styles.image} resizeMode="cover" />
            <View style={styles.meta}>
                <ThemedText numberOfLines={1} style={styles.name}>{item.name || 'Image'}</ThemedText>
            </View>
        </TouchableOpacity>
    );

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <ThemedText type="title" style={styles.title}>#{String(tag)}</ThemedText>
            </View>
            {loading && items.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(item, idx) => String(item.id || idx)}
                    numColumns={2}
                    columnWrapperStyle={{ justifyContent: 'space-between', paddingHorizontal: 20 }}
                    contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.list}
                    renderItem={renderItem}
                />
            )}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { padding: 20, paddingTop: 60, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
    title: { textAlign: 'center', color: '#8B5CF6' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    list: { paddingVertical: 12 },
    card: { width: imageSize, marginBottom: 12, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', elevation: 2 },
    image: { width: '100%', height: imageSize, backgroundColor: '#eee' },
    meta: { padding: 8 },
    name: { color: '#333', fontWeight: '600', fontSize: 12 },
});


