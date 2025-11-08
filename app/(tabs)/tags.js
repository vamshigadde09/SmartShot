import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppTheme as theme } from '@/constants/theme';
import { getAllScreenshots, readFromExternalStorage } from '@/utils/fileStorage';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    Image,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

export default function TagsScreen() {
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => { loadTags(); }, []);

    // Auto-refresh when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            loadTags();
        }, [])
    );

    const loadTags = async () => {
        setLoading(true);
        try {
            // Use getAllScreenshots which checks both local and external storage
            let items = await getAllScreenshots();

            // If no items found, try loading from external storage directly as fallback
            if (!items || items.length === 0) {
                try {
                    const externalData = await readFromExternalStorage();
                    if (externalData) {
                        const externalItems = JSON.parse(externalData);
                        if (externalItems && externalItems.length > 0) {
                            items = externalItems;
                        }
                    }
                } catch (e) {
                    console.log('External storage check failed:', e);
                }
            }

            console.log('Loaded items for tags:', items?.length || 0);
            console.log('Items with tags:', items.filter(it => it.tags).length);
            console.log('Sample items:', items.slice(0, 3).map(it => ({ id: it.id, tags: it.tags, hasTags: !!it.tags })));

            const map = new Map();
            for (const it of items) {
                if (!it.tags) {
                    console.log('Skipping item without tags:', it.id);
                    continue;
                }
                console.log('Processing tags for item:', it.id, 'tags:', it.tags);
                const list = String(it.tags)
                    .split(',')
                    .map(t => t.trim())
                    .filter(Boolean);
                console.log('Parsed tag list:', list);
                for (const t of list) {
                    const existing = map.get(t) || { count: 0, firstImageUri: null };
                    existing.count = existing.count + 1;
                    // Set first image URI if not already set
                    if (!existing.firstImageUri && it.uri) {
                        existing.firstImageUri = it.uri;
                    }
                    map.set(t, existing);
                }
            }
            console.log('Final tag map:', Array.from(map.entries()).map(([name, data]) => ({ name, count: data.count })));
            const rows = Array.from(map.entries())
                .map(([name, data]) => ({
                    name,
                    count: data.count,
                    coverUri: data.firstImageUri
                }))
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

    const renderItem = ({ item }) => {
        const scale = new Animated.Value(1);
        const onPressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true }).start();
        const onPressOut = () => Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
        return (
            <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
                <TouchableOpacity
                    activeOpacity={0.85}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    onPress={() => openTag(item)}
                >
                    <View style={styles.thumbWrap}>
                        {item.coverUri ? (
                            <Image source={{ uri: item.coverUri }} style={styles.thumb} resizeMode="cover" />
                        ) : (
                            <View style={styles.thumb} />
                        )}
                        <ThemedText style={styles.cardTitle} numberOfLines={1}>{item.name}</ThemedText>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

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
    container: {
        flex: 1,
        backgroundColor: theme.bg,
        paddingBottom: 100,
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
    thumb: {
        width: '100%',
        height: '100%',
    },
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
    tagPill: {
        backgroundColor: theme.accent + '15',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
});


