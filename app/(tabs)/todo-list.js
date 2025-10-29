import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AppTheme as theme } from '@/constants/theme';
import { getAllScreenshots, saveScreenshotData } from '@/utils/fileStorage';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    Modal,
    RefreshControl,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';


export default function TodoListScreen() {
    const [todos, setTodos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [createVisible, setCreateVisible] = useState(false);
    const [newText, setNewText] = useState('');
    const [newTags, setNewTags] = useState('');

    useEffect(() => {
        loadTodos();
    }, []);

    const loadTodos = async () => {
        try {
            const allScreenshots = await getAllScreenshots();
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
            const all = await getAllScreenshots();
            const target = all.find((s) => s.id === id);
            if (!target) return;
            const updated = { ...target, isTodo: value, updatedAt: new Date().toISOString() };
            await saveScreenshotData(updated);
            const refreshed = await getAllScreenshots();
            setTodos(refreshed.filter((s) => s.isTodo));
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
                {item.uri ? (
                    <Image
                        source={{ uri: item.uri }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={[styles.thumbnail, styles.placeholder]}>
                        <ThemedText style={styles.placeholderText}>TODO</ThemedText>
                    </View>
                )}
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

    const onCreateTodo = async () => {
        try {
            const now = new Date().toISOString();
            const id = 'todo-' + Date.now();
            const newItem = {
                id,
                isTodo: true,
                text: newText.trim(),
                tags: newTags.trim(),
                createdAt: now,
                updatedAt: now,
            };
            await saveScreenshotData(newItem);
            setCreateVisible(false);
            setNewText('');
            setNewTags('');
            await loadTodos();
        } catch (e) {
            console.error('Error creating todo:', e);
            Alert.alert('Error', 'Failed to create todo');
        }
    };

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

            {/* Create FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => setCreateVisible(true)}>
                <ThemedText style={styles.fabText}>＋</ThemedText>
            </TouchableOpacity>

            {/* Create Modal */}
            <Modal
                transparent
                visible={createVisible}
                animationType="fade"
                onRequestClose={() => setCreateVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <ThemedText style={styles.modalTitle}>New Todo</ThemedText>
                        <View style={{ height: 12 }} />
                        <TextInput
                            style={styles.input}
                            placeholder="What to do?"
                            placeholderTextColor="#999"
                            value={newText}
                            onChangeText={setNewText}
                        />
                        <View style={{ height: 8 }} />
                        <TextInput
                            style={styles.input}
                            placeholder="Tags (optional)"
                            placeholderTextColor="#999"
                            value={newTags}
                            onChangeText={setNewTags}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelBtn]} onPress={() => setCreateVisible(false)}>
                                <ThemedText style={styles.modalBtnText}>Cancel</ThemedText>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.saveBtn]}
                                onPress={onCreateTodo}
                                disabled={!newText.trim()}
                            >
                                <ThemedText style={styles.modalBtnText}>Save</ThemedText>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.bg,
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
        paddingHorizontal: 14,
        paddingTop: 12,
        paddingBottom: 20,
    },
    todoItem: {
        backgroundColor: theme.card,
        borderRadius: theme.radius,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        ...theme.shadow,
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
        borderRadius: 10,
        backgroundColor: '#f0f0f0',
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
    placeholder: {
        backgroundColor: '#f0e9ff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: '#8B5CF6',
        fontWeight: '700',
    },
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        backgroundColor: theme.accent,
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        ...theme.shadow,
    },
    fabText: {
        color: '#fff',
        fontSize: 32,
        lineHeight: 32,
        fontWeight: 'bold',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalCard: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#333',
        textAlign: 'center',
    },
    input: {
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#333',
        backgroundColor: '#fafafa',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 14,
    },
    modalButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
    },
    cancelBtn: {
        backgroundColor: '#e0e0e0',
    },
    saveBtn: {
        backgroundColor: '#8B5CF6',
    },
    modalBtnText: {
        color: '#fff',
        fontWeight: '700',
    },
});
