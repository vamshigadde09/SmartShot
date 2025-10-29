import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Image,
    NativeModules,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const PEOPLE = [
    { id: '1', name: 'Alice Johnson', username: '@alice' },
    { id: '2', name: 'Bob Singh', username: '@bob' },
    { id: '3', name: 'Carla Mendes', username: '@carla' },
    { id: '4', name: 'Deep Patel', username: '@deep' },
    { id: '5', name: 'Emma Chen', username: '@emma' },
    { id: '6', name: 'Farid Khan', username: '@farid' },
    { id: '7', name: 'Grace Lee', username: '@grace' },
];

export default function SearchScreen() {
    const [query, setQuery] = useState('');
    const [peopleThumbs, setPeopleThumbs] = useState([]);
    const [series, setSeries] = useState([]);

    useEffect(() => {
        const load = async () => {
            try {
                const mod = NativeModules.ScreenshotModule;
                if (mod && typeof mod.getPeopleThumbnails === 'function') {
                    const rows = await mod.getPeopleThumbnails(12);
                    if (rows && rows.length > 0) {
                        setPeopleThumbs(rows);
                    } else if (mod && typeof mod.getScreenshots === 'function') {
                        // Fallback: show latest images as bubbles if People/Faces bucket not present
                        const all = await mod.getScreenshots();
                        setPeopleThumbs((all || []).slice(0, 12).map(it => ({ uri: it.uri })));
                    }
                }
                if (mod && typeof mod.getSimilarGroups === 'function') {
                    const groups = await mod.getSimilarGroups(8, 3);
                    setSeries(groups || []);
                }
            } catch { }
        };
        load();
    }, []);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return PEOPLE;
        return PEOPLE.filter(p => p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q));
    }, [query]);

    const openSettings = () => {
        router.push('/(tabs)/settings');
    };

    const renderPerson = ({ item }) => (
        <View style={styles.personRow}>
            <View style={styles.avatar} />
            <View style={styles.personMeta}>
                <ThemedText style={styles.personName}>{item.name}</ThemedText>
                <ThemedText style={styles.personHandle}>{item.username}</ThemedText>
            </View>
            <TouchableOpacity style={styles.followBtn}>
                <ThemedText style={styles.followText}>Follow</ThemedText>
            </TouchableOpacity>
        </View>
    );

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search people..."
                    placeholderTextColor="#999"
                />
                <TouchableOpacity style={styles.settingsBtn} onPress={openSettings}>
                    <ThemedText style={styles.settingsText}>Settings</ThemedText>
                </TouchableOpacity>
            </View>
            {!!peopleThumbs?.length && (
                <View style={styles.peopleSection}>
                    <View style={styles.peopleHeader}>
                        <ThemedText style={styles.peopleTitle}>People</ThemedText>
                    </View>
                    <View style={styles.peopleRow}>
                        {peopleThumbs.map((p, idx) => (
                            <Image key={idx} source={{ uri: p.uri }} style={styles.personBubble} />
                        ))}
                    </View>
                </View>
            )}
            {!!series?.length && (
                <View style={styles.scenesSection}>
                    <View style={styles.peopleHeader}>
                        <ThemedText style={styles.peopleTitle}>Scenes</ThemedText>
                    </View>
                    <View style={styles.scenesGrid}>
                        {series.map((g, idx) => (
                            <View key={idx} style={styles.sceneCard}>
                                <Image source={{ uri: g.coverUri }} style={styles.sceneImage} resizeMode="cover" />
                                <View style={styles.sceneMeta}>
                                    <ThemedText style={styles.sceneName} numberOfLines={1}>{g.name}</ThemedText>
                                    <ThemedText style={styles.sceneCount}>{g.count}</ThemedText>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
            )}
            <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={renderPerson}
                contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.list}
                ListEmptyComponent={<ThemedText style={styles.emptyText}>No people found</ThemedText>}
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: {
        paddingTop: 60,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    searchInput: {
        flex: 1,
        backgroundColor: '#f0f0f0',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
        color: '#333',
    },
    settingsBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#8B5CF6',
        borderRadius: 10,
    },
    settingsText: { color: '#fff', fontWeight: '600' },
    list: { padding: 12 },
    peopleSection: { paddingHorizontal: 16, paddingTop: 8 },
    peopleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    peopleTitle: { color: '#666', fontWeight: '700', letterSpacing: 1 },
    peopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
    personBubble: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ddd' },
    scenesSection: { paddingHorizontal: 16, paddingTop: 16 },
    scenesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
    sceneCard: { width: '48%', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff', marginBottom: 12, elevation: 2 },
    sceneImage: { width: '100%', height: 120, backgroundColor: '#eee' },
    sceneMeta: { padding: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sceneName: { color: '#333', fontWeight: '600', maxWidth: '75%' },
    sceneCount: { color: '#666' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyText: { color: '#666' },
    personRow: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ddd' },
    personMeta: { flex: 1 },
    personName: { color: '#333', fontWeight: '600' },
    personHandle: { color: '#888', fontSize: 12 },
    followBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#6C757D', borderRadius: 8 },
    followText: { color: '#fff', fontWeight: '600', fontSize: 12 },
});


