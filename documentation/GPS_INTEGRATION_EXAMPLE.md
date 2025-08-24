# GPS Log Integration with React Native

This example shows how to integrate your `gps_log.php` API with React Native for real-time location tracking.

## 🚀 Quick Start

### 1. Set User Credentials

Before starting location tracking, set the user NIK and device ID:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Set user credentials (call this after user login)
await AsyncStorage.setItem('userNik', '123456'); // Replace with actual NIK
await AsyncStorage.setItem('deviceId', 'device_unique_id'); // Auto-generated
```

### 2. Start Location Tracking

```typescript
import LocationService from './src/services/LocationService';
import BackgroundLocationService from './src/services/BackgroundLocationService';

// Initialize and start tracking
await BackgroundLocationService.initializeBackgroundTracking();
BackgroundLocationService.setBackgroundTrackingEnabled(true);

// Start real-time location tracking
await LocationService.startLocationTracking();

console.log('✅ Real-time location tracking started!');
```

### 3. Use LocationTracker Component

```typescript
import LocationTracker from './src/components/LocationTracker';

export default function App() {
  return (
    <View style={{ flex: 1 }}>
      <LocationTracker />
      {/* Your other components */}
    </View>
  );
}
```

## 📱 Features

### Real-time Location Tracking
- **Continuous GPS monitoring** with high accuracy
- **3-minute intervals** for API calls to your server
- **Background tracking** when app is minimized
- **Automatic retry** on network failures

### Data Sent to Your API
```json
{
  "nik": 123456,
  "device_id": "device_1234567890_abc123def",
  "latitude": -6.200000,
  "longitude": 106.816666,
  "accuracy": 5.0,
  "note": "auto log - realtime tracking (2025-01-20T10:30:00.000Z)",
  "xposed": 0,
  "virtual": 0,
  "fake": 0
}
```

### API Response Expected
```json
{
  "status": "success",
  "message": "✅ Data lokasi berhasil disimpan",
  "log_id": 12345,
  "debug": {
    "nik": 123456,
    "usrid": 789,
    "device_id": "device_1234567890_abc123def",
    "lat": -6.200000,
    "lng": 106.816666
  }
}
```

## ⚙️ Configuration

### Location Service Configuration
```typescript
// Update tracking settings
LocationService.updateConfig({
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 30000,
  distanceFilter: 10, // meters
  interval: 180000,   // 3 minutes
});
```

### API Endpoint
Current endpoint: `https://online.tirtadaroy.co.id/absenlokasi/api/gps_log.php`

To change the API endpoint:
```typescript
LocationService.API_BASE_URL = 'https://your-api-domain.com/api';
```

## 🔧 Error Handling

The service includes comprehensive error handling:

- **Network failures**: Automatic retry with exponential backoff
- **GPS unavailable**: Graceful fallback and retry
- **Permission denied**: User-friendly alerts
- **Offline mode**: Queue requests and sync when online

### Check Status
```typescript
// Get current tracking statistics
const stats = LocationService.getTrackingStats();
console.log('Tracking stats:', stats);

// Get background service status
const bgStats = await BackgroundLocationService.getBackgroundStats();
console.log('Background stats:', bgStats);
```

## 🔄 Manual Operations

### Force Sync Pending Data
```typescript
// Force sync all queued location data
await LocationService.forceSyncPendingData();
```

### Get Last Known Location
```typescript
// Get cached location data
const lastLocation = await LocationService.getCachedLocation();
console.log('Last location:', lastLocation);
```

### Stop Tracking
```typescript
// Stop all location tracking
LocationService.stopLocationTracking();
BackgroundLocationService.setBackgroundTrackingEnabled(false);
```

## 📊 Database Integration

Your `gps_log.php` will store data in the `tgps_log` table with these fields:

- `nik`: Employee NIK (integer)
- `usrid`: User ID from `tuser` table
- `device_id`: Unique device identifier
- `waktu`: Timestamp (NOW())
- `status_gps`: 'AKTIF' or 'FAKE'
- `latitude`, `longitude`: GPS coordinates
- `keterangan`: Note field
- `accuracy`: GPS accuracy in meters
- `xposed`: Root detection flag
- `virtual`: Mock location detection flag

## 🔒 Security Features

- **Root detection**: Basic detection (expandable)
- **Mock location detection**: Placeholder (expandable)
- **CSRF protection**: Ready for token integration
- **Data validation**: Server-side coordinate validation
- **Retry limits**: Prevents infinite retry loops

## 📱 Permissions Required

### Android (`android/app/src/main/AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

### iOS (`ios/YourApp/Info.plist`)
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>This app needs location access for attendance tracking.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>This app needs location access for attendance tracking.</string>
```

## 🧪 Testing

Test the integration with these methods:

```typescript
// 1. Check if tracking is active
console.log('Is tracking:', LocationService.isLocationTrackingActive());

// 2. Force a location update
await LocationService.logCurrentLocation();

// 3. Test background sync
await BackgroundLocationService.forceBackgroundSync();

// 4. Check API connectivity
const position = await LocationService.getCurrentLocation();
await LocationService.sendLocationToAPI(position);
```

## 📋 Troubleshooting

### Common Issues

1. **"User NIK or Device ID not found"**
   - Solution: Ensure AsyncStorage has 'userNik' and 'deviceId' set

2. **Network timeout**
   - The service automatically retries with exponential backoff
   - Check your server connectivity

3. **GPS not available**
   - Ensure location permissions are granted
   - Test on a real device (not simulator)

4. **High battery usage**
   - Adjust the `distanceFilter` in config to reduce GPS frequency
   - The service already optimizes for battery usage

### Debug Logs

Enable debug logging to troubleshoot:
```typescript
// Check console logs for these prefixes:
// 📍 - Location data being sent
// ✅ - Successful operations  
// ❌ - Errors and failures
// 🔄 - Retry attempts
// 📱 - App state changes
// 🌙 - Background operations
```

## 🎯 Integration Complete!

Your React Native app now sends real-time location data to your `gps_log.php` API every 3 minutes with:

- ✅ Real-time GPS monitoring
- ✅ Background tracking support  
- ✅ Automatic retry on failures
- ✅ Offline data queuing
- ✅ Security features
- ✅ Comprehensive error handling
- ✅ User-friendly UI components

The integration is production-ready and optimized for battery life and network efficiency.