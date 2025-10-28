# Screenshot Detection Feature

This app includes a screenshot detection feature that monitors when someone takes a screenshot of the app and sends notifications.

## How it Works

### Android Implementation (Kotlin)
- **ScreenshotModule.kt**: Native Android module that monitors the MediaStore for new images
- **ScreenshotPackage.kt**: React Native package registration
- Uses `ContentObserver` to watch for changes in the MediaStore
- Detects screenshots by checking file naming patterns and paths
- Sends events to React Native and shows local notifications

### React Native Implementation (JavaScript)
- **ScreenshotDetector.tsx**: Component that bridges native Android code with React Native
- **screenshot.tsx**: Main page that displays screenshot statistics and handles events
- Uses `NativeEventEmitter` to listen for screenshot events from Android
- Updates UI state when screenshots are detected

## Features

1. **Real-time Detection**: Monitors for screenshots as they happen
2. **Statistics Tracking**: Counts total screenshots and tracks last screenshot time
3. **Notifications**: Shows both in-app alerts and system notifications
4. **Modern UI**: Clean interface with purple accent color [[memory:2885978]]

## How to Test

1. Run the app on an Android device: `npm run android`
2. Navigate to the "Screenshot" tab
3. Take a screenshot using your device's screenshot function (usually Power + Volume Down)
4. You should see:
   - An in-app alert notification
   - A system notification
   - Updated counter and timestamp
   - Console logs showing the detection

## Technical Details

### Required Permissions
- `READ_EXTERNAL_STORAGE`: Access to read media files
- `READ_MEDIA_IMAGES`: Access to read images (Android 13+)
- `POST_NOTIFICATIONS`: Show notifications

### Detection Method
The app detects screenshots by:
1. Monitoring MediaStore.Images.Media.EXTERNAL_CONTENT_URI
2. Checking file names for common screenshot patterns:
   - `Screenshot_*`
   - `screenshot_*`
   - `IMG_*`
3. Checking file paths for screenshot directories:
   - `/Screenshots/`
   - `/Pictures/Screenshots/`

### Event Flow
1. User takes screenshot → Android saves to MediaStore
2. ContentObserver detects change → ScreenshotModule processes
3. Module checks if it's a screenshot → Sends event to React Native
4. React Native receives event → Updates UI and shows notifications

## Files Created/Modified

### New Files
- `app/(tabs)/screenshot.tsx` - Main screenshot detection page
- `components/ScreenshotDetector.tsx` - React Native bridge component
- `android/app/src/main/java/com/anonymous/SmartShot/ScreenshotModule.kt` - Native Android module
- `android/app/src/main/java/com/anonymous/SmartShot/ScreenshotPackage.kt` - Package registration

### Modified Files
- `app/(tabs)/_layout.tsx` - Added screenshot tab
- `android/app/src/main/java/com/anonymous/SmartShot/MainApplication.kt` - Registered package
- `android/app/src/main/AndroidManifest.xml` - Added permissions

## Notes

- This feature only works on Android devices
- Requires proper permissions to be granted
- The detection is based on file naming patterns and may not catch all screenshots
- The app uses modern React Native architecture with TypeScript
