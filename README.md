# 📸 SmartShot

> An intelligent screenshot management application for Android that automatically detects, organizes, and manages your screenshots with a modern gallery interface.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Android-green.svg)
![React Native](https://img.shields.io/badge/React%20Native-0.81.5-61dafb.svg)
![Expo](https://img.shields.io/badge/Expo-54.0.20-000020.svg)

## 🎯 Features

### Core Features
- **🔄 Automatic Screenshot Detection** - Automatically detects when screenshots are taken on your device
- **🖼️ Modern Gallery Interface** - Beautiful, intuitive gallery with dark/light theme support
- **📁 Album Management** - Organize screenshots into albums/folders
- **🏷️ Tag System** - Add tags to screenshots for easy organization and search
- **✏️ Edit Screenshots** - Add text notes, audio recordings, and reminders to screenshots
- **🎨 Theme Support** - Automatic dark/light mode based on system preferences
- **📱 Floating Navigation** - Modern floating navigation dock for easy access

### Advanced Features
- **🔍 Smart Filtering** - View screenshots with edits separately from tagged-only images
- **🎬 Video Support** - View and manage video screenshots
- **📊 Image Organization** - Sort by latest edits, date added, and more
- **🎯 Quick Edit** - Quick edit tile for fast access to screenshot editing
- **💾 Local Storage** - All data stored locally on your device
- **🔐 Privacy First** - No cloud sync, all data stays on your device

## 📦 Download APK

### Latest Release
> **Note:** APK files are not included in the repository. Please build the APK using the instructions below, or download from [GitHub Releases](https://github.com/vamshigadde09/SmartShot/releases) (when available).

### Building the APK

#### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Android Studio (for Android development)
- Java JDK 11 or higher

#### Build Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/vamshigadde09/SmartShot.git
   cd SmartShot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Generate native Android project**
   ```bash
   npx expo prebuild --platform android
   ```

4. **Build release APK**
   ```bash
   npx expo run:android --variant release
   ```

   The APK will be generated at:
   ```
   android/app/build/outputs/apk/release/app-release.apk
   ```

#### Alternative: Using EAS Build (Recommended for Production)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for Android
eas build --platform android --profile production
```

## 🚀 Getting Started

### Installation

1. **Prerequisites**
   - Node.js 18+
   - npm or yarn
   - Expo CLI (`npm install -g expo-cli`)

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start Development Server**
   ```bash
   npm start
   # or
   npx expo start
   ```

4. **Run on Android**
   ```bash
   npm run android
   # or
   npx expo run:android
   ```

### Development

```bash
# Start development server
npm start

# Run on Android
npm run android

# Run on iOS (requires macOS)
npm run ios

# Run on Web
npm run web
```

## 📱 Screenshots

> Screenshots coming soon! Add your app screenshots here.

## 🛠️ Tech Stack

### Frontend
- **React Native** - Cross-platform mobile framework
- **Expo** - Development platform and toolchain
- **Expo Router** - File-based routing
- **React Navigation** - Navigation library
- **React Native Reanimated** - Animation library
- **Expo AV** - Audio/video playback

### Backend (Android Native)
- **Kotlin** - Android native development
- **React Native Bridge** - Native module integration
- **ContentObserver** - Screenshot detection
- **MediaStore** - Media file access

### Key Dependencies
```json
{
  "react": "19.1.0",
  "react-native": "0.81.5",
  "expo": "~54.0.20",
  "expo-router": "~6.0.13",
  "expo-av": "~16.0.7",
  "react-native-reanimated": "~4.1.1"
}
```

## 📂 Project Structure

```
SmartShot/
├── app/                    # App screens and routes
│   ├── (tabs)/            # Tab navigation screens
│   │   ├── gallery.js     # Gallery/Screenshots view
│   │   ├── all-images.js  # All images view
│   │   ├── albums.js      # Albums view
│   │   └── settings.js    # Settings screen
│   ├── edit-screenshot.js # Edit screenshot screen
│   └── view-screenshot.js # View screenshot screen
├── android/               # Android native code
│   └── app/src/main/java/com/anonymous/SmartShot/
│       ├── ScreenshotModule.kt      # Screenshot detection
│       ├── PermissionManager.kt     # Permission handling
│       └── ScreenshotDetectionService.kt  # Background service
├── components/            # Reusable components
│   ├── floating-nav-dock.js  # Floating navigation
│   ├── themed-text.tsx       # Themed text component
│   └── themed-view.tsx       # Themed view component
├── constants/             # Constants and configuration
│   └── theme.ts           # Theme configuration
└── utils/                 # Utility functions
    └── fileStorage.js     # File storage utilities
```

## 🔧 Configuration

### App Configuration
- **Package Name**: `com.anonymous.SmartShot`
- **Version**: `1.0.0`
- **Minimum Android SDK**: API 21 (Android 5.0)
- **Target Android SDK**: API 33 (Android 13)

### Permissions
- `READ_MEDIA_IMAGES` - Access screenshots
- `READ_EXTERNAL_STORAGE` - Access media files (Android 12 and below)
- `WRITE_EXTERNAL_STORAGE` - Save edited screenshots
- `RECORD_AUDIO` - Record audio notes

## 🎨 Features in Detail

### Gallery View
- View all screenshots with edits (text, audio, reminders)
- Sort by latest edit time
- Filter out screenshots with only tags
- Grid layout with adjustable columns (3 or 6 columns)
- Pull to refresh

### Tags View
- View all tags with screenshot counts
- Tap to view all screenshots with a specific tag
- Automatic tag organization

### Albums View
- View all photo albums/folders
- Tap to view images in an album
- Support for videos and images

### Edit Screenshot
- Add text notes
- Record audio notes
- Add reminders
- Add single tag per screenshot
- Save custom tags for future use

### All Images View
- View all images and videos
- Grid layout with pinch-to-zoom
- Adjustable columns (3 or 6)

## 🐛 Known Issues

- Android build files may need regeneration if gradlew is missing
- Some file locks may occur during build (restart computer to fix)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👤 Author

**Vamshi Gadde**
- GitHub: [@vamshigadde09](https://github.com/vamshigadde09)
- Repository: [SmartShot](https://github.com/vamshigadde09/SmartShot)

## 🙏 Acknowledgments

- Expo team for the amazing development platform
- React Native community for the great ecosystem
- All contributors and users of this project

## 📄 Changelog

### Version 1.0.0 (Current)
- Initial release
- Screenshot detection and organization
- Gallery interface with tags and albums
- Edit screenshots with text, audio, and reminders
- Dark/light theme support
- Floating navigation dock

## 🔗 Links

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Project Report](./PROJECT_REPORT.txt)

---

**Note**: This app requires Android permissions to access your screenshots. All data is stored locally on your device and is never sent to any server.
