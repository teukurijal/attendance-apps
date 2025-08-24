# WebView Communication Bridge

This document describes how the webview (absen.php) can communicate with the React Native app.

## Available Functions

The React Native app injects a `ReactNativeBridge` object into the webview that provides the following functions:

### Location Functions

#### `ReactNativeBridge.requestLocation()`
Requests the current location from the React Native app.

```javascript
// Request current location
ReactNativeBridge.requestLocation();

// Listen for the location response
window.addEventListener('ReactNative_LOCATION_DATA', function(event) {
    const locationData = event.detail.data;
    console.log('Received location:', locationData);
    // locationData contains: latitude, longitude, accuracy, timestamp
});

// Listen for location errors
window.addEventListener('ReactNative_LOCATION_ERROR', function(event) {
    console.error('Location error:', event.detail.error);
});
```

### Tracking Functions

#### `ReactNativeBridge.getTrackingStatus()`
Gets the current tracking status from React Native.

```javascript
// Request tracking status
ReactNativeBridge.getTrackingStatus();

// Listen for the response
window.addEventListener('ReactNative_TRACKING_STATUS', function(event) {
    const status = event.detail.data;
    console.log('Tracking status:', status);
    // status contains: isTracking, isOnline, pendingRequests, lastLocation
});
```

#### `ReactNativeBridge.startTracking()`
Requests React Native to start location tracking.

```javascript
// Start tracking
ReactNativeBridge.startTracking();

// Listen for success
window.addEventListener('ReactNative_TRACKING_STARTED', function(event) {
    console.log('Tracking started successfully');
});

// Listen for errors
window.addEventListener('ReactNative_TRACKING_ERROR', function(event) {
    console.error('Tracking error:', event.detail.error);
});
```

#### `ReactNativeBridge.stopTracking()`
Requests React Native to stop location tracking.

```javascript
// Stop tracking
ReactNativeBridge.stopTracking();

// Listen for success
window.addEventListener('ReactNative_TRACKING_STOPPED', function(event) {
    console.log('Tracking stopped successfully');
});
```

### User Info Functions

#### `ReactNativeBridge.sendUserInfo(nik, additionalData)`
Sends user information to React Native.

```javascript
// Send user NIK to React Native
ReactNativeBridge.sendUserInfo('123456');

// Send user NIK with additional data
ReactNativeBridge.sendUserInfo('123456', {
    username: 'john.doe',
    department: 'IT'
});
```

### Generic Communication

#### `ReactNativeBridge.sendMessage(type, data)`
Sends a generic message to React Native.

```javascript
// Send custom message
ReactNativeBridge.sendMessage('CUSTOM_ACTION', {
    action: 'attendance_submitted',
    timestamp: new Date().toISOString()
});
```

## Event Listeners

### General Message Listener
Listen to all messages from React Native:

```javascript
window.addEventListener('ReactNativeMessage', function(event) {
    const message = event.detail;
    console.log('Message from React Native:', message);
    
    switch(message.type) {
        case 'APP_INFO':
            console.log('App info:', message.data);
            break;
        case 'LOCATION_DATA':
            handleLocationData(message.data);
            break;
        // ... handle other message types
    }
});
```

### App Info Event
Automatically triggered when the webview loads:

```javascript
window.addEventListener('ReactNative_APP_INFO', function(event) {
    const appInfo = event.detail.data;
    console.log('React Native App Info:', appInfo);
    // appInfo contains: platform, locationPermission, trackingActive, appVersion
});
```

## Complete Example Usage

Here's a complete example of how to use the bridge in your webview:

```javascript
// Wait for the bridge to be ready
document.addEventListener('DOMContentLoaded', function() {
    // Check if bridge is available
    if (typeof ReactNativeBridge !== 'undefined') {
        console.log('React Native bridge is available');
        
        // Set up event listeners first
        setupEventListeners();
        
        // Request app info and current status
        setTimeout(() => {
            ReactNativeBridge.getTrackingStatus();
        }, 500);
        
    } else {
        console.log('Running in regular browser (no React Native bridge)');
    }
});

function setupEventListeners() {
    // Listen for location data
    window.addEventListener('ReactNative_LOCATION_DATA', function(event) {
        const location = event.detail.data;
        document.getElementById('latitude').value = location.latitude;
        document.getElementById('longitude').value = location.longitude;
        document.getElementById('accuracy').value = location.accuracy;
    });
    
    // Listen for tracking status
    window.addEventListener('ReactNative_TRACKING_STATUS', function(event) {
        const status = event.detail.data;
        updateTrackingUI(status.isTracking);
    });
    
    // Listen for app info
    window.addEventListener('ReactNative_APP_INFO', function(event) {
        const appInfo = event.detail.data;
        console.log('Running on:', appInfo.platform);
        console.log('Location permission:', appInfo.locationPermission);
        
        // Enable location features only if permission is granted
        if (appInfo.locationPermission) {
            enableLocationFeatures();
        }
    });
}

// Example function to handle attendance submission
function submitAttendance() {
    // First get current location
    ReactNativeBridge.requestLocation();
    
    // Listen for location response
    window.addEventListener('ReactNative_LOCATION_DATA', function(event) {
        const location = event.detail.data;
        
        // Submit attendance with location data
        submitAttendanceWithLocation(location.latitude, location.longitude);
        
        // Remove the listener after use
        this.removeEventListener('ReactNative_LOCATION_DATA', arguments.callee);
    }, { once: true });
}

// Example button handlers
function onStartTrackingClick() {
    ReactNativeBridge.startTracking();
}

function onStopTrackingClick() {
    ReactNativeBridge.stopTracking();
}

function onGetLocationClick() {
    ReactNativeBridge.requestLocation();
}
```

## Message Types Reference

### From WebView to React Native:
- `USER_INFO` - Send user information
- `REQUEST_LOCATION` - Request current location
- `REQUEST_TRACKING_STATUS` - Request tracking status
- `START_TRACKING` - Start location tracking
- `STOP_TRACKING` - Stop location tracking
- `WEBVIEW_READY` - Automatically sent when webview is ready

### From React Native to WebView:
- `APP_INFO` - App information (platform, permissions, etc.)
- `LOCATION_DATA` - Location data response
- `LOCATION_ERROR` - Location error
- `TRACKING_STATUS` - Tracking status data
- `TRACKING_STARTED` - Tracking started successfully
- `TRACKING_STOPPED` - Tracking stopped successfully
- `TRACKING_ERROR` - Tracking error

## Debugging

To debug communication, check the console logs. Both React Native and WebView will log all messages being sent and received.

### In React Native Logs:
```
Message from WebView: {"type":"REQUEST_LOCATION"}
Sending message to WebView: {"type":"LOCATION_DATA","data":{...}}
```

### In WebView Console:
```
🌉 React Native WebView Bridge initialized
📱 Message from React Native: {"type":"APP_INFO","data":{...}}
🚀 WebView bridge setup complete
```

## Error Handling

Always include error handling in your webview code:

```javascript
// Example with error handling
function safeRequestLocation() {
    if (typeof ReactNativeBridge === 'undefined') {
        console.warn('React Native bridge not available, falling back to HTML5 geolocation');
        // Fallback to HTML5 geolocation API
        navigator.geolocation.getCurrentPosition(
            function(position) {
                handleLocationData({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            function(error) {
                console.error('Geolocation error:', error);
            }
        );
        return;
    }
    
    // Use React Native bridge
    ReactNativeBridge.requestLocation();
}
```