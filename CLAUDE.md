# Employee Attendance App - Project Memory

## Project Overview
React Native application for employee attendance tracking with GPS location services.

## Recent Changes (2025-08-21)

### API URL Updates
- **GPS Log API**: Changed from `https://online.tirtadaroy.co.id/absenlokasi/api/gps_log.php` to `https://absen.tirtadaroy.co.id/absenlokasi/api/gps_log.php`
- **WebView URL**: Changed from `https://online.tirtadaroy.co.id/absenlokasi/absen.php` to `https://absen.tirtadaroy.co.id/absenlokasi/absen.php`

### Files Modified
- `src/services/LocationService.ts:56` - Updated API_BASE_URL
- `src/services/LocationService.ts:556` - Updated cookie domain
- `App.tsx:296` - Updated WebView source URL

### Build Status
- Last successful Android build: 2025-08-21
- Build time: 1m 22s
- Target: Pixel_8a_API_35 emulator
- Status: Successfully installed and running

## Key Architecture
- **LocationService**: Handles GPS tracking and API communication
- **WebView Integration**: Two-way communication between React Native and web interface
- **Permission Management**: Location permissions handled on app startup

## Dependencies
- @react-native-community/geolocation
- react-native-webview  
- @react-native-async-storage/async-storage
- @react-native-cookies/cookies
- react-native-permissions

## Commands to Remember
- Build Android: `npx react-native run-android`
- Check devices: `adb devices`

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Employee Attendance App built with React Native 0.80.2. The app is a WebView wrapper that loads a web-based attendance system requiring location permissions.

## Architecture

- **Single Component Architecture**: The app consists primarily of one main component (`App.tsx`)
- **WebView-based**: Renders a web application from `https://online.tirtadaroy.co.id/absenlokasi/absen.php`
- **Location Permission Handling**: Requests location permissions before allowing access to the attendance system
- **Cross-platform**: Supports both Android and iOS with platform-specific permission handling

## Key Components

- `App.tsx`: Main application component handling permissions and WebView
- `index.js`: Entry point registering the App component
- Native Android code in `android/app/src/main/java/com/employeeattendanceapp/`
- Native iOS code in `ios/EmployeeAttendanceApp/`

## Development Commands

### Start Metro bundler:
```bash
npm start
# or
yarn start
```

### Run on Android:
```bash
npm run android
# or
yarn android
```

### Run on iOS:
First install CocoaPods dependencies:
```bash
bundle install
bundle exec pod install
```
Then run:
```bash
npm run ios
# or
yarn ios
```

### Testing:
```bash
npm test
# or
yarn test
```

### Linting:
```bash
npm run lint
# or
yarn lint
```

## Dependencies

- **react-native-webview**: WebView component for loading the attendance web app
- **react-native-permissions**: Handles location permission requests
- **@react-native/new-app-screen**: Default React Native components

## Platform-specific Notes

### Android
- Requires `ACCESS_FINE_LOCATION` permission
- Custom splash screen and app icons configured
- Main activity in Kotlin (`MainActivity.kt`)

### iOS  
- Requires `LOCATION_WHEN_IN_USE` permission
- CocoaPods for native dependencies management
- Custom app icons and launch screen configured

## WebView Configuration

The WebView is configured with:
- JavaScript enabled
- DOM storage enabled  
- Geolocation enabled
- Custom user agent: "EmployeeAttendanceApp/1.0"
- Mixed content compatibility mode