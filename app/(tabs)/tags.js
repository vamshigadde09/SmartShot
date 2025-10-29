import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
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

export default function TagsScreen() {
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadTags(); }, []);

    const loadTags = async () => {
        setLoading(true);
        try {
            const path = await getStorageFile();
            const info = await FileSystem.getInfoAsync(path);
            if (!info.exists) {
                setTags([]);
                return;
            }
            const json = await FileSystem.readAsStringAsync(path);
            const items = JSON.parse(json);
            const map = new Map();
            for (const it of items) {
                if (!it.tags) continue;
                const list = String(it.tags)
                    .split(',')
                    .map(t => t.trim())
                    .filter(Boolean);
                for (const t of list) {
                    const prev = map.get(t) || 0;
                    map.set(t, prev + 1);
                }
            }
            const rows = Array.from(map.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => a.name.localeCompare(b.name));
            setTags(rows);
        } catch (e) {
            console.error('Failed to load tags', e);
            Alert.alert('Error', 'Failed to load tags');
            setTags([]);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadTags();
        setRefreshing(false);
    }, []);

    const openTag = (tag) => {
        router.push({ pathname: '/tag-images', params: { tag: tag.name } });
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity style={styles.item} onPress={() => openTag(item)}>
            <ThemedText style={styles.tagName}>#{item.name}</ThemedText>
            <ThemedText style={styles.count}>{item.count}</ThemedText>
        </TouchableOpacity>
    );

    return (
        <ThemedView style={styles.container}>
            {loading && tags.length === 0 ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <ThemedText style={styles.loadingText}>Loading tags...</ThemedText>
                </View>
            ) : (
                <FlatList
                    data={tags}
                    keyExtractor={(item) => item.name}
                    renderItem={renderItem}
                    contentContainerStyle={tags.length === 0 ? styles.emptyContainer : styles.list}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <ThemedText style={styles.emptyText}>No tags yet</ThemedText>
                            <ThemedText style={styles.emptySubtext}>Add tags to screenshots to see them here</ThemedText>
                        </View>
                    }
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
    emptyText: { fontSize: 18, fontWeight: 'bold', color: '#666', marginBottom: 10 },
    emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center' },
    list: { padding: 12 },
    item: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        elevation: 2,
    },
    tagName: { fontWeight: '600', color: '#333' },
    count: { color: '#666' },
});


