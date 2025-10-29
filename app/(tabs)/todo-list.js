import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    RefreshControl,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';

// Use file storage for data persistence
const STORAGE_FILE = FileSystem.documentDirectory + 'screenshots.json';
const FALLBACK_STORAGE_FILE = FileSystem.cacheDirectory + 'screenshots.json';

// Get the appropriate storage file path
const getStorageFile = async () => {
    try {
        const dirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory);
        if (dirInfo.exists) {
            return STORAGE_FILE;
        } else {
            return FALLBACK_STORAGE_FILE;
        }
    } catch (error) {
        console.error('Error determining storage file:', error);
        return FALLBACK_STORAGE_FILE;
    }
};

export default function TodoListScreen() {
    const [todos, setTodos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyId, setBusyId] = useState(null);

    useEffect(() => {
        loadTodos();
    }, []);

    const loadTodos = async () => {
        try {
            let allScreenshots = [];
            const storageFile = await getStorageFile();
            const fileInfo = await FileSystem.getInfoAsync(storageFile);
            if (fileInfo.exists) {
                const fileContent = await FileSystem.readAsStringAsync(storageFile);
                allScreenshots = JSON.parse(fileContent);
            }

            const todoScreenshots = allScreenshots.filter(screenshot => screenshot.isTodo);
            setTodos(todoScreenshots);
        } catch (error) {
            console.error('Error loading todos:', error);
            Alert.alert('Error', 'Failed to load todo list');
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadTodos();
        setRefreshing(false);
    };

    const openScreenshot = (screenshot) => {
        router.push({
            pathname: '/edit-screenshot',
            params: {
                screenshotUri: screenshot.uri,
                screenshotId: screenshot.id
            }
        });
    };

    const updateTodoFlag = async (id, value) => {
        try {
            setBusyId(id);
            const storageFile = await getStorageFile();
            const fileInfo = await FileSystem.getInfoAsync(storageFile);
            if (!fileInfo.exists) return;
            const content = await FileSystem.readAsStringAsync(storageFile);
            const arr = JSON.parse(content);
            const idx = arr.findIndex((s) => s.id === id);
            if (idx >= 0) {
                arr[idx].isTodo = value;
                arr[idx].updatedAt = new Date().toISOString();
                await FileSystem.writeAsStringAsync(storageFile, JSON.stringify(arr));
            }
            // refresh local list
            setTodos(arr.filter((s) => s.isTodo));
        } catch (e) {
            console.error('Error updating todo flag:', e);
            Alert.alert('Error', 'Failed to update todo');
        } finally {
            setBusyId(null);
        }
    };

    const markDone = async (item) => {
        await updateTodoFlag(item.id, false);
    };

    const removeTodo = async (item) => {
        await updateTodoFlag(item.id, false);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    const renderTodoItem = ({ item }) => (
        <TouchableOpacity
            style={styles.todoItem}
            onPress={() => openScreenshot(item)}
        >
            <View style={styles.imageContainer}>
                <Image
                    source={{ uri: item.uri }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                />
            </View>
            <View style={styles.contentContainer}>
                <ThemedText style={styles.todoTitle} numberOfLines={2}>
                    {item.text || 'No description'}
                </ThemedText>
                {item.reminder && (
                    <ThemedText style={styles.reminderText} numberOfLines={1}>
                        📅 {item.reminder}
                    </ThemedText>
                )}
                {item.tags && (
                    <ThemedText style={styles.tagsText} numberOfLines={1}>
                        🏷️ {item.tags}
                    </ThemedText>
                )}
                {item.audio && (
                    <ThemedText style={styles.audioText} numberOfLines={1}>
                        🎤 Audio note recorded
                    </ThemedText>
                )}
                <ThemedText style={styles.dateText}>
                    {formatDate(item.updatedAt)}
                </ThemedText>
                <View style={styles.rowActions}>
                    <TouchableOpacity style={styles.doneButton} onPress={() => markDone(item)} disabled={busyId === item.id}>
                        <ThemedText style={styles.actionText}>{busyId === item.id ? '...' : 'Mark Done'}</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.removeButton} onPress={() => removeTodo(item)} disabled={busyId === item.id}>
                        <ThemedText style={styles.actionText}>Remove</ThemedText>
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <ThemedView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ThemedText>Loading todos...</ThemedText>
                </View>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <ThemedText style={styles.title}>Todo List</ThemedText>
                <ThemedText style={styles.subtitle}>
                    {todos.length} todo{todos.length !== 1 ? 's' : ''} found
                </ThemedText>
            </View>

            {todos.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <ThemedText style={styles.emptyText}>No todos yet</ThemedText>
                    <ThemedText style={styles.emptySubtext}>
                        Mark screenshots as todos to see them here
                    </ThemedText>
                </View>
            ) : (
                <FlatList
                    data={todos}
                    keyExtractor={(item) => item.id}
                    renderItem={renderTodoItem}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={['#8B5CF6']}
                        />
                    }
                    contentContainerStyle={styles.listContainer}
                />
            )}
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
        fontSize: 24,
        fontWeight: 'bold',
    },
    subtitle: {
        textAlign: 'center',
        color: '#666',
        fontSize: 14,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
    },
    listContainer: {
        padding: 20,
    },
    todoItem: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    imageContainer: {
        width: 80,
        height: 80,
        borderRadius: 8,
        overflow: 'hidden',
        marginRight: 16,
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'space-between',
    },
    todoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    reminderText: {
        fontSize: 14,
        color: '#8B5CF6',
        marginBottom: 2,
    },
    tagsText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    audioText: {
        fontSize: 14,
        color: '#4CAF50',
        marginBottom: 4,
    },
    dateText: {
        fontSize: 12,
        color: '#999',
    },
    rowActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 8,
        alignItems: 'center',
    },
    doneButton: {
        backgroundColor: '#4CAF50',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    removeButton: {
        backgroundColor: '#ff6b6b',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    actionText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 12,
    },
});
