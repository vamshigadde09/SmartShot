import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, TouchableOpacity, NativeModules, Platform } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function ScreenshotPageSimple() {
    const [screenshotCount, setScreenshotCount] = useState(0);
    const [lastScreenshotTime, setLastScreenshotTime] = useState(null);

    const handleScreenshotDetected = () => {
        console.log('ScreenshotPage: Screenshot detected!');
        setScreenshotCount(prev => prev + 1);
        setLastScreenshotTime(new Date().toLocaleString());

        // Show an alert when screenshot is detected
        Alert.alert(
            'Screenshot Detected! 📸',
            'A screenshot was just taken of this app.',
            [{ text: 'OK' }]
        );
    };

    const testDetection = () => {
        console.log('ScreenshotPage: Testing detection...');
        handleScreenshotDetected();
    };

    const checkRecentImages = () => {
        console.log('ScreenshotPage: Checking recent images...');
        if (Platform.OS === 'android') {
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                ScreenshotModule.checkRecentImages();
                Alert.alert('Debug', 'Check Android logs for recent images. Look for "ScreenshotModule" in logcat.');
            } else {
                Alert.alert('Error', 'ScreenshotModule not available');
            }
        } else {
            Alert.alert('Error', 'Check only available on Android');
        }
    };

    return (
        <ScrollView style={styles.container}>
            <ThemedView style={styles.content}>
                <ThemedText type="title" style={styles.title}>
                    Screenshot Detection
                </ThemedText>

                <ThemedText style={styles.description}>
                    This page detects when someone takes a screenshot of the app and shows a notification.
                </ThemedText>

                <View style={styles.statsContainer}>
                    <ThemedText type="subtitle" style={styles.statsTitle}>
                        Screenshot Statistics
                    </ThemedText>

                    <View style={styles.statItem}>
                        <ThemedText style={styles.statLabel}>Total Screenshots:</ThemedText>
                        <ThemedText style={styles.statValue}>{screenshotCount}</ThemedText>
                    </View>

                    {lastScreenshotTime && (
                        <View style={styles.statItem}>
                            <ThemedText style={styles.statLabel}>Last Screenshot:</ThemedText>
                            <ThemedText style={styles.statValue}>{lastScreenshotTime}</ThemedText>
                        </View>
                    )}
                </View>

                <View style={styles.instructionsContainer}>
                    <ThemedText type="subtitle" style={styles.instructionsTitle}>
                        How to Test
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        1. Take a screenshot using your device's screenshot function
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        2. You should see a notification and the counter will increase
                    </ThemedText>
                    <ThemedText style={styles.instruction}>
                        3. The last screenshot time will be updated
                    </ThemedText>

                    <TouchableOpacity style={styles.testButton} onPress={testDetection}>
                        <ThemedText style={styles.testButtonText}>
                            Test Detection (Simulate Screenshot)
                        </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.debugButton} onPress={checkRecentImages}>
                        <ThemedText style={styles.debugButtonText}>
                            Check Recent Images (Debug)
                        </ThemedText>
                    </TouchableOpacity>
                </View>
            </ThemedView>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        padding: 20,
    },
    title: {
        textAlign: 'center',
        marginBottom: 20,
        color: '#8B5CF6',
    },
    description: {
        textAlign: 'center',
        marginBottom: 30,
        fontSize: 16,
        lineHeight: 24,
    },
    statsContainer: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    statsTitle: {
        marginBottom: 15,
        color: '#8B5CF6',
    },
    statItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    statLabel: {
        fontSize: 16,
        fontWeight: '500',
    },
    statValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#8B5CF6',
    },
    instructionsContainer: {
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 12,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    instructionsTitle: {
        marginBottom: 15,
        color: '#8B5CF6',
    },
    instruction: {
        fontSize: 14,
        marginBottom: 8,
        lineHeight: 20,
    },
    testButton: {
        backgroundColor: '#8B5CF6',
        padding: 15,
        borderRadius: 8,
        marginTop: 15,
        alignItems: 'center',
    },
    testButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    debugButton: {
        backgroundColor: '#FF6B6B',
        padding: 15,
        borderRadius: 8,
        marginTop: 10,
        alignItems: 'center',
    },
    debugButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
