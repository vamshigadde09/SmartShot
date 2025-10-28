import React, { useEffect } from 'react';
import { NativeModules, Platform, NativeEventEmitter } from 'react-native';

const ScreenshotDetector = ({ onScreenshotDetected, permissionsGranted }) => {
    useEffect(() => {
        console.log('ScreenshotDetector: Initializing...');

        try {
            if (Platform.OS === 'android') {
                // Register for screenshot detection on Android
                const ScreenshotModule = NativeModules.ScreenshotModule;

                console.log('ScreenshotDetector: ScreenshotModule available:', !!ScreenshotModule);

                if (ScreenshotModule) {
                    // Check permissions first
                    console.log('ScreenshotDetector: Checking permissions...');
                    const hasPermissions = ScreenshotModule.checkPermissions();

                    if (hasPermissions) {
                        // Start listening for screenshots
                        console.log('ScreenshotDetector: Starting detection...');
                        ScreenshotModule.startScreenshotDetection();
                    } else {
                        console.warn('ScreenshotDetector: Permissions not granted, cannot start detection');
                        return;
                    }

                    // Create event emitter for listening to native events
                    const eventEmitter = new NativeEventEmitter(ScreenshotModule);

                    // Listen for screenshot events
                    const subscription = eventEmitter.addListener('ScreenshotDetected', (event) => {
                        console.log('ScreenshotDetector: Screenshot detected event:', event);
                        if (onScreenshotDetected) {
                            onScreenshotDetected(event);
                        }
                    });

                    console.log('ScreenshotDetector: Event listener registered');

                    // Cleanup on unmount
                    return () => {
                        console.log('ScreenshotDetector: Cleaning up...');
                        try {
                            subscription.remove();
                            ScreenshotModule.stopScreenshotDetection();
                        } catch (error) {
                            console.warn('ScreenshotDetector: Error during cleanup:', error);
                        }
                    };
                } else {
                    console.warn('ScreenshotDetector: ScreenshotModule not available');
                }
            } else {
                console.warn('ScreenshotDetector: Screenshot detection is only available on Android');
            }
        } catch (error) {
            console.error('ScreenshotDetector: Error during initialization:', error);
        }
    }, [onScreenshotDetected]);

    // Restart detection when permissions are granted
    useEffect(() => {
        if (Platform.OS === 'android' && permissionsGranted) {
            console.log('ScreenshotDetector: Permissions granted, restarting detection...');
            const ScreenshotModule = NativeModules.ScreenshotModule;
            if (ScreenshotModule) {
                ScreenshotModule.restartDetection();
            }
        }
    }, [permissionsGranted]);

    return null; // This component doesn't render anything
};

export { ScreenshotDetector };
