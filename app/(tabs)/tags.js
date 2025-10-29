import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppTheme as theme } from '@/constants/theme';
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
        <TouchableOpacity style={styles.card} onPress={() => openTag(item)}>
            <View style={styles.thumbWrap}>
                <View style={styles.thumb} />
            </View>
            <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.name}</ThemedText>
        </TouchableOpacity>
    );

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <ThemedText type="title" style={styles.title}>Tag</ThemedText>
                <ThemedText style={styles.subtitle}>{tags.length} tag{tags.length !== 1 ? 's' : ''}</ThemedText>
            </View>
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
                    numColumns={2}
                    columnWrapperStyle={styles.columnWrapper}
                    contentContainerStyle={tags.length === 0 ? styles.emptyContainer : styles.grid}
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
    emptyText: { fontSize: 18, fontWeight: 'bold', color: '#666', marginBottom: 10 },
    emptySubtext: { fontSize: 14, color: '#999', textAlign: 'center' },
    grid: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 20 },
    columnWrapper: { justifyContent: 'space-between', marginBottom: 14 },
    card: {
        flex: 1,
        backgroundColor: theme.card,
        borderRadius: theme.radius,
        paddingVertical: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 4,
        ...theme.shadow,
    },
    thumbWrap: {
        height: 80,
        borderRadius: 12,
        backgroundColor: '#e9e9ef',
        overflow: 'hidden',
        marginBottom: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumb: {
        width: '80%',
        height: '80%',
        borderRadius: 10,
        backgroundColor: '#ddd',
    },
    cardTitle: { textAlign: 'center', color: theme.textPrimary, fontWeight: '600', fontSize: 16 },
    tagPill: {
        backgroundColor: theme.accent + '15',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
});


