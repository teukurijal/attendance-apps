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