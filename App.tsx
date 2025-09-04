import React, {useEffect, useState} from 'react';
import {
  View,
  Alert,
  StyleSheet,
  Text,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {WebView} from 'react-native-webview';
import {
  PERMISSIONS,
  RESULTS,
  requestMultiple,
  Permission,
} from 'react-native-permissions';
import LocationService from './src/services/LocationService';
import {setupLocationService} from './src/setup/LocationSetup';
import AsyncStorage from '@react-native-async-storage/async-storage';

function App() {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locationTracking, setLocationTracking] = useState(false);

  useEffect(() => {
    requestPermissions();
    
    // Cleanup when app closes
    return () => {
      LocationService.stopLocationTracking();
    };
  }, []);

  const requestPermissions = async () => {
    const permissions: Permission[] = Platform.select({
      android: [
        PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
      ],
      ios: [
        PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
        PERMISSIONS.IOS.LOCATION_ALWAYS,
      ],
    }) as Permission[];

    try {
      const results = await requestMultiple(permissions);
      
      const allPermissionsGranted = Object.values(results).every(
        result => result === RESULTS.GRANTED
      );

      if (allPermissionsGranted) {
        setPermissionsGranted(true);
      } else {
        Alert.alert(
          'Location Permission Required',
          'This app requires location permission for attendance tracking.',
          [
            {
              text: 'Retry',
              onPress: requestPermissions,
            },
            {
              text: 'Continue Anyway',
              onPress: () => setPermissionsGranted(true),
            },
          ],
        );
      }
    } catch (error) {
      console.error('Permission request failed:', error);
      Alert.alert('Error', 'Failed to request permissions');
      setPermissionsGranted(true);
    } finally {
      setLoading(false);
    }
  };

  // Start location tracking when WebView loads successfully
  const handleWebViewLoadEnd = async () => {
    console.log('WebView loading finished');
    if (!locationTracking && permissionsGranted) {
      try {
        // Get user NIK from stored credentials
        const userNik = await AsyncStorage.getItem('userNik');
        
        if (!userNik) {
          console.log('⚠️ No user NIK found in storage, waiting for user login');
          return;
        }
        
        await setupLocationService(userNik);
        await LocationService.startLocationTracking();
        setLocationTracking(true);
        console.log('✅ Location tracking started for WebView');
      } catch (error) {
        console.error('❌ Failed to start location tracking:', error);
      }
    }
  };

  const webViewRef = React.useRef(null);
  
  // Make webViewRef globally accessible for LocationService
  React.useEffect(() => {
    (global as any).webViewRef = webViewRef;
    return () => {
      (global as any).webViewRef = null;
    };
  }, []);

  const handleWebViewMessage = (event: any) => {
    const data = event.nativeEvent.data;
    console.log('📨 [WebView -> React Native] Raw message received:', data);
    
    try {
      const message = JSON.parse(data);
      console.log('📨 [WebView -> React Native] Parsed JSON message:', message);
      
      // Handle both 'type' and 'event' fields for backward compatibility
      const messageType = message.type || message.event;
      console.log('📨 [WebView -> React Native] Message type identified:', messageType);
      
      switch (messageType) {
        case 'USER_INFO':
          console.log('👤 [WebView -> React Native] USER_INFO message received:', {
            nik: message.nik,
            data: message.data,
            fullMessage: message
          });
          if (message.nik) {
            console.log('✅ [WebView -> React Native] Setting up LocationService with NIK:', message.nik);
            setupLocationService(message.nik);
            console.log('✅ [WebView -> React Native] User NIK successfully processed:', message.nik);
          } else {
            console.warn('⚠️ [WebView -> React Native] USER_INFO message received but NIK is missing or empty');
          }
          break;
          
        case 'REQUEST_LOCATION':
          handleLocationRequest();
          break;
          
        case 'REQUEST_TRACKING_STATUS':
          sendTrackingStatusToWebView();
          break;
          
        case 'START_TRACKING':
          console.log('Start tracking request from WebView:', message);
          handleStartTrackingFromWebView();
          break;
          
        case 'STOP_TRACKING':
          console.log('Stop tracking request from WebView:', message);
          handleStopTrackingFromWebView();
          break;
          
        case 'WEBVIEW_READY':
          console.log('WebView is ready for communication');
          sendAppInfoToWebView();
          break;
          
        case 'LOCATION_UPDATED':
          console.log('Location updated from WebView:', message);
          break;
          
        case 'FAKE_GPS_DETECTED':
          console.log('Fake GPS detected from WebView:', message);
          handleFakeGpsDetection(message.isFake);
          break;
          
        case 'LOCATION_VALID':
          console.log('Location valid from WebView:', message);
          break;
          
        case 'SET_REMINDER_ALARM':
          console.log('Set reminder alarm from WebView:', message);
          handleSetReminderAlarm(message.hour, message.minute);
          break;
          
        case 'CANCEL_REMINDER_ALARM':
          console.log('Cancel reminder alarm from WebView:', message);
          handleCancelReminderAlarm();
          break;
          
        case 'ATTENDANCE_ERROR':
          console.log('Attendance error from WebView:', message);
          handleAttendanceError(message.error, message.tipe);
          break;
          
        case 'ATTENDANCE_NETWORK_ERROR':
          console.log('Attendance network error from WebView:', message);
          handleAttendanceNetworkError(message.error, message.tipe);
          break;
          
        case 'SET_CREDENTIALS':
          console.log('🔐 [WebView -> React Native] SET_CREDENTIALS message received:', {
            nik: message.nik,
            device_id: message.device_id,
            fullMessage: message
          });
          if (message.nik) {
            console.log('✅ [WebView -> React Native] Processing credentials with NIK:', message.nik);
            handleSetCredentials(message.nik, message.device_id);
            console.log('✅ [WebView -> React Native] Credentials successfully processed');
          } else {
            console.warn('⚠️ [WebView -> React Native] SET_CREDENTIALS message received but NIK is missing or empty');
          }
          break;
          
        default:
          console.log('❓ [WebView -> React Native] Unknown message type received:', {
            messageType,
            fullMessage: message,
            availableFields: Object.keys(message)
          });
      }
    } catch (e) {
      // Not a JSON message, treat as plain text
      console.log('⚠️ [WebView -> React Native] Non-JSON message received:', {
        rawData: data,
        dataType: typeof data,
        error: e.message
      });
    }
  };

  // Send current location to WebView
  const handleLocationRequest = async () => {
    try {
      const cachedLocation = await LocationService.getCachedLocation();
      if (cachedLocation) {
        sendMessageToWebView({
          event: 'LOCATION_DATA',
          data: {
            latitude: cachedLocation.latitude,
            longitude: cachedLocation.longitude,
            accuracy: cachedLocation.accuracy,
            timestamp: cachedLocation.timestamp
          }
        });
      } else {
        // Get fresh location
        const position = await LocationService.getCurrentLocation();
        sendMessageToWebView({
          event: 'LOCATION_DATA',
          data: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now()
          }
        });
      }
    } catch (error) {
      console.error('Error getting location for WebView:', error);
      sendMessageToWebView({
        event: 'LOCATION_ERROR',
        error: error.message || 'Failed to get location'
      });
    }
  };

  // Send tracking status to WebView
  const sendTrackingStatusToWebView = () => {
    const stats = LocationService.getTrackingStats();
    sendMessageToWebView({
      event: 'TRACKING_STATUS',
      data: {
        isTracking: stats.isTracking,
        isOnline: stats.isOnline,
        pendingRequests: stats.pendingRequests,
        lastLocation: stats.lastLocation
      }
    });
  };

  // Handle start tracking request from WebView
  const handleStartTracking = async () => {
    try {
      if (!locationTracking && permissionsGranted) {
        await LocationService.startLocationTracking();
        setLocationTracking(true);
        sendMessageToWebView({
          event: 'TRACKING_STARTED',
          success: true
        });
      } else {
        sendMessageToWebView({
          event: 'TRACKING_ERROR',
          error: locationTracking ? 'Tracking already active' : 'Permissions not granted'
        });
      }
    } catch (error) {
      console.error('Error starting tracking from WebView:', error);
      sendMessageToWebView({
        event: 'TRACKING_ERROR',
        error: error.message || 'Failed to start tracking'
      });
    }
  };

  // Handle stop tracking request from WebView
  const handleStopTracking = () => {
    try {
      LocationService.stopLocationTracking();
      setLocationTracking(false);
      sendMessageToWebView({
        event: 'TRACKING_STOPPED',
        success: true
      });
    } catch (error) {
      console.error('Error stopping tracking from WebView:', error);
      sendMessageToWebView({
        event: 'TRACKING_ERROR',
        error: error.message || 'Failed to stop tracking'
      });
    }
  };

  // Send app info to WebView
  const sendAppInfoToWebView = () => {
    sendMessageToWebView({
      event: 'APP_INFO',
      data: {
        platform: Platform.OS,
        locationPermission: permissionsGranted,
        trackingActive: locationTracking,
        appVersion: '1.0.0'
      }
    });
  };

  // Handle fake GPS detection from WebView
  const handleFakeGpsDetection = (isFake: boolean) => {
    console.log('Handling fake GPS detection:', isFake);
    if (isFake && locationTracking) {
      LocationService.stopLocationTracking();
      setLocationTracking(false);
      Alert.alert('Warning', 'Fake GPS detected. Location tracking stopped.');
    }
  };

  // Handle start tracking from WebView
  const handleStartTrackingFromWebView = async () => {
    try {
      if (!locationTracking && permissionsGranted) {
        await LocationService.startLocationTracking();
        setLocationTracking(true);
        console.log('Location tracking started from WebView');
      }
    } catch (error) {
      console.error('Error starting tracking from WebView:', error);
    }
  };

  // Handle stop tracking from WebView
  const handleStopTrackingFromWebView = () => {
    try {
      LocationService.stopLocationTracking();
      setLocationTracking(false);
      console.log('Location tracking stopped from WebView');
    } catch (error) {
      console.error('Error stopping tracking from WebView:', error);
    }
  };

  // Handle set reminder alarm from WebView
  const handleSetReminderAlarm = (hour: number, minute: number) => {
    console.log(`Setting reminder alarm for ${hour}:${minute}`);
    // TODO: Implement alarm functionality if needed
  };

  // Handle cancel reminder alarm from WebView
  const handleCancelReminderAlarm = () => {
    console.log('Cancelling reminder alarm');
    // TODO: Implement alarm cancellation if needed
  };

  // Handle attendance error from WebView
  const handleAttendanceError = (error: string, type: string) => {
    console.error(`Attendance ${type} error:`, error);
    Alert.alert('Attendance Error', `Failed to submit ${type} attendance: ${error}`);
  };

  // Handle attendance network error from WebView
  const handleAttendanceNetworkError = (error: string, type: string) => {
    console.error(`Attendance ${type} network error:`, error);
    Alert.alert('Network Error', `Network error during ${type} attendance: ${error}`);
  };

  // Handle set credentials from WebView
  const handleSetCredentials = async (nik: string, deviceId: string) => {
    console.log('🔐 [Credentials Handler] Starting credential storage process...');
    console.log('🔐 [Credentials Handler] Received NIK:', nik, 'Type:', typeof nik);
    console.log('🔐 [Credentials Handler] Received Device ID:', deviceId, 'Type:', typeof deviceId);
    
    try {
      // Store credentials in AsyncStorage for LocationService to use
      console.log('📱 [AsyncStorage] Storing userNik...');
      await AsyncStorage.setItem('userNik', nik);
      console.log('✅ [AsyncStorage] userNik stored successfully');
      
      console.log('📱 [AsyncStorage] Storing deviceId...');
      await AsyncStorage.setItem('deviceId', deviceId);
      console.log('✅ [AsyncStorage] deviceId stored successfully');
      
      // Verify storage
      const storedNik = await AsyncStorage.getItem('userNik');
      const storedDeviceId = await AsyncStorage.getItem('deviceId');
      console.log('🔍 [Verification] Stored NIK verification:', storedNik);
      console.log('🔍 [Verification] Stored Device ID verification:', storedDeviceId);
      
      // Update LocationService configuration
      console.log('⚙️ [LocationService] Setting up LocationService with NIK:', nik);
      await setupLocationService(nik);
      
      // Refresh session cookies to ensure PHPSESSID is loaded
      console.log('🔄 [Credentials Handler] Refreshing session cookies...');
      await LocationService.updateSessionCookies();
      
      console.log('✅ [Credentials Handler] All credentials stored and configured successfully');
    } catch (error) {
      console.error('❌ [Credentials Handler] Failed to store credentials:', error);
      console.error('❌ [Credentials Handler] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
  };

  // Helper function to send messages to WebView
  const sendMessageToWebView = (message: any) => {
    if (webViewRef.current) {
      const messageString = JSON.stringify(message);
      console.log('Sending message to WebView:', messageString);
      webViewRef.current.postMessage(messageString);
    } else {
      console.warn('WebView ref not available, cannot send message:', message);
    }
  };

  const handleWebViewError = (error: any) => {
    console.error('WebView error:', error);
    Alert.alert('Error', 'Failed to load attendance page');
    // Stop location tracking if WebView fails
    if (locationTracking) {
      LocationService.stopLocationTracking();
      setLocationTracking(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#28A745" />
        <Text style={styles.loadingText}>Setting up location access...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      
      {permissionsGranted ? (
        <WebView
          ref={webViewRef}
          source={{uri: 'https://absen.tirtadaroy.co.id/absen.php'}}
          style={styles.webview}
          onMessage={handleWebViewMessage}
          onError={handleWebViewError}
          onLoadEnd={handleWebViewLoadEnd}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          geolocationEnabled={true}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          mixedContentMode="compatibility"
          userAgent="EmployeeAttendanceApp/1.0"
          onLoadStart={() => console.log('WebView loading started')}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#28A745" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}
          injectedJavaScript={`
            // Enhanced JavaScript bridge for React Native communication
            (function() {
              console.log('🌉 React Native WebView Bridge initialized');
              
              // Global bridge object for the webpage to use
              window.ReactNativeBridge = {
                // Request current location from React Native
                requestLocation: function() {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'REQUEST_LOCATION'
                  }));
                },
                
                // Request tracking status
                getTrackingStatus: function() {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'REQUEST_TRACKING_STATUS'
                  }));
                },
                
                // Start location tracking
                startTracking: function() {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'START_TRACKING'
                  }));
                },
                
                // Stop location tracking
                stopTracking: function() {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'STOP_TRACKING'
                  }));
                },
                
                // Send user info to React Native
                sendUserInfo: function(nik, additionalData) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'USER_INFO',
                    nik: nik,
                    data: additionalData || {}
                  }));
                },
                
                // Generic message sender
                sendMessage: function(type, data) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: type,
                    data: data
                  }));
                }
              };
              
              // Listen for messages from React Native
              window.addEventListener('message', function(event) {
                try {
                  const message = JSON.parse(event.data);
                  console.log('📱 Message from React Native:', message);
                  
                  // Handle specific message types/events directly
                  const msgType = message.type || message.event;
                  switch(msgType) {
                    case 'LOCATION_DATA':
                      if (typeof updateLocationFromReactNative === 'function') {
                        updateLocationFromReactNative(
                          message.data.latitude,
                          message.data.longitude,
                          message.data.accuracy,
                          true
                        );
                      }
                      break;
                      
                    case 'LOCATION_ERROR':
                      console.error('Location error from React Native:', message.error);
                      break;
                      
                    case 'TRACKING_STATUS':
                      console.log('Tracking status from React Native:', message.data);
                      break;
                      
                    case 'APP_INFO':
                      console.log('App info from React Native:', message.data);
                      break;
                  }
                  
                  // Trigger custom events that the webpage can listen to
                  const customEvent = new CustomEvent('ReactNativeMessage', {
                    detail: message
                  });
                  window.dispatchEvent(customEvent);
                  
                  // Also trigger specific events based on message type
                  if (message.type) {
                    const specificEvent = new CustomEvent('ReactNative_' + message.type, {
                      detail: message
                    });
                    window.dispatchEvent(specificEvent);
                  }
                  
                } catch (e) {
                  console.error('Error parsing message from React Native:', e);
                }
              });
              
              // Auto-extract user info when page loads
              function extractUserInfo() {
                try {
                  // Try multiple selectors for user NIK
                  const nikSelectors = [
                    '[data-nik]',
                    '#nik',
                    'input[name="nik"]',
                    'input[name="user_nik"]',
                    '.user-nik'
                  ];
                  
                  for (let selector of nikSelectors) {
                    const element = document.querySelector(selector);
                    if (element && (element.value || element.textContent || element.dataset.nik)) {
                      const nik = element.value || element.textContent || element.dataset.nik;
                      if (nik && nik.trim()) {
                        console.log('📋 Found user NIK:', nik);
                        window.ReactNativeBridge.sendUserInfo(nik.trim());
                        break;
                      }
                    }
                  }
                } catch (e) {
                  console.log('Could not extract user info:', e);
                }
              }
              
              // Signal that WebView is ready
              setTimeout(() => {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'WEBVIEW_READY'
                }));
                
                // Try to extract user info
                extractUserInfo();
                
                // Monitor for dynamic content changes
                if (window.MutationObserver) {
                  const observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                      if (mutation.type === 'childList') {
                        extractUserInfo();
                      }
                    });
                  });
                  
                  observer.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                }
                
              }, 1000);
              
              console.log('🚀 WebView bridge setup complete');
            })();
            
            true; // Required for injectedJavaScript
          `}
        />
      ) : (
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionText}>
            Please grant location permission to continue with attendance tracking.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666666',
  },
  locationIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    top: Platform.OS === 'android' ? 25 : 50,
    right: 10,
    borderRadius: 15,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    marginRight: 6,
  },
  locationText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  webview: {
    flex: 1,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666666',
    lineHeight: 24,
  },
});

export default App;
