import Geolocation from '@react-native-community/geolocation';
import {PermissionsAndroid, Platform, Alert, AppState, NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CookieManager from '@react-native-cookies/cookies';

interface LocationData {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

interface ApiResponse {
  status: string;
  message: string;
  log_id?: number;
  debug?: any;
}

interface LocationConfig {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  distanceFilter: number;
  interval: number;
}

interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  apiTimeout: number;
}

class LocationService {
  private watchId: number | null;
  private intervalId: NodeJS.Timeout | null;
  private isTracking: boolean;
  private lastKnownLocation: LocationData | null;
  private retryCount: number;
  private isOnline: boolean;
  private pendingRequests: any[];
  public API_BASE_URL: string;
  private config: LocationConfig;
  private retryConfig: RetryConfig;
  private sessionCookies: string;

  constructor() {
    this.watchId = null;
    this.intervalId = null;
    this.isTracking = false;
    this.lastKnownLocation = null;
    this.retryCount = 0;
    this.isOnline = true;
    this.pendingRequests = [];
    this.API_BASE_URL = 'https://absen.tirtadaroy.co.id/';
    this.sessionCookies = '';
    this.config = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000,
      distanceFilter: 10, // meters
      interval: 10000, // 10 seconds default (will be adjusted based on battery)
    };
    
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 5000,
      backoffMultiplier: 2,
      apiTimeout: 20000, // 20 seconds
    };
    
    this.initializeDeviceId();
  }

  // Get tracking interval based on battery state and memory pressure
  private async getTrackingInterval(): Promise<number> {
    try {
      // Check if device has memory pressure or low performance
      const isLowPowerMode = await this.isLowPowerMode();
      
      if (isLowPowerMode) {
        // console.log('🔋 Low power mode detected, using 15s interval');
        return 15000; // 15 seconds
      }
      
      // Use 10 seconds for normal battery mode
      // console.log('🔋 Normal battery mode, using 10s interval');
      return 10000; // 10 seconds
    } catch (error) {
      // console.warn('⚠️ Failed to get power mode info, using default 10s interval:', error);
      return 10000; // Default to 10 seconds
    }
  }

  // Simple low power mode detection based on app state and performance
  private async isLowPowerMode(): Promise<boolean> {
    try {
      // Check if background processing is limited
      const backgroundMode = AppState.currentState === 'background';
      
      if (Platform.OS === 'android' && NativeModules.PowerManager) {
        // For Android, we can check power save mode
        const isPowerSaveMode = await NativeModules.PowerManager.isPowerSaveMode();
        return isPowerSaveMode || backgroundMode;
      } else if (Platform.OS === 'ios') {
        // For iOS, check Low Power Mode if available
        try {
          if (NativeModules.RNDeviceInfo && NativeModules.RNDeviceInfo.isPowerSaveModeEnabled) {
            const isLowPowerMode = await NativeModules.RNDeviceInfo.isPowerSaveModeEnabled();
            // console.log('🔋 iOS Low Power Mode:', isLowPowerMode);
            return isLowPowerMode || backgroundMode;
          }
        } catch (iosError) {
          // console.warn('⚠️ iOS Low Power Mode detection not available:', iosError);
        }
        
        // Fallback for iOS: use app state and memory pressure heuristics
        return backgroundMode;
      }
      
      // For other platforms or fallback, use app state heuristics
      return backgroundMode;
    } catch (error) {
      // console.warn('⚠️ Failed to detect power mode:', error);
      return false; // Default to normal mode
    }
  }

  // Adjust tracking interval based on current battery state
  private async adjustTrackingInterval(): Promise<void> {
    try {
      const newInterval = await this.getTrackingInterval();
      const currentInterval = this.config.interval;
      
      if (newInterval !== currentInterval) {
        // console.log(`🔄 Adjusting tracking interval from ${currentInterval}ms to ${newInterval}ms`);
        
        // Clear current interval
        if (this.intervalId) {
          clearInterval(this.intervalId);
        }
        
        // Set new interval
        this.intervalId = setInterval(async () => {
          if (this.isTracking && this.lastKnownLocation) {
            // Check if userNik and deviceId are available before API call
            const userNik = await AsyncStorage.getItem('userNik');
            const deviceId = await AsyncStorage.getItem('deviceId');
            
            if (!userNik || !deviceId || userNik.trim() === '' || deviceId.trim() === '') {
              // console.warn('⚠️ Skipping location API call: userNik or deviceId is empty/null');
              return;
            }
            
            await this.sendLocationToAPI(this.lastKnownLocation);
          }
        }, newInterval);
        
        // Update config
        this.config.interval = newInterval;
      }
    } catch (error) {
      // console.error('❌ Failed to adjust tracking interval:', error);
    }
  }

  // Initialize device ID (matching web login system)
  private async initializeDeviceId(): Promise<void> {
    try {
      let deviceId = await AsyncStorage.getItem('deviceId');
      if (!deviceId) {
        // Generate device ID similar to web version
        const platformPrefix = Platform.OS === 'ios' ? 'RN_iOS' : `RN_${Platform.OS}`;
        deviceId = `${platformPrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AsyncStorage.setItem('deviceId', deviceId);
        // console.log('🔧 Generated new device ID:', deviceId);
      }
      
      // Load session cookies
      await this.loadSessionCookies();
    } catch (error) {
      // console.error('Error initializing device ID:', error);
    }
  }

  // Request location permissions
  async requestLocationPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        // First request foreground location permission
        const foregroundGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location for attendance tracking.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        
        if (foregroundGranted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('❌ [DEBUG] Foreground location permission denied');
          return false;
        }
        console.log('✅ [DEBUG] Foreground location permission granted');
        
        // For Android 10+ (API 29+), request background location separately
        if (Platform.Version >= 29) {
          const backgroundGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
            {
              title: 'Background Location Permission',
              message: 'This app needs background location access to track attendance even when the app is closed. Please select "Allow all the time" for proper functionality.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel', 
              buttonPositive: 'OK',
            }
          );
          console.log('🔍 [DEBUG] Background permission result:', backgroundGranted);
          return backgroundGranted === PermissionsAndroid.RESULTS.GRANTED;
        }
        
        return true;
      } else if (Platform.OS === 'ios') {
        // For iOS, we need to test location permissions by attempting to get location
        return new Promise((resolve) => {
          Geolocation.getCurrentPosition(
            () => {
              // console.log('✅ iOS location permission granted');
              resolve(true);
            },
            (error) => {
              // console.log('❌ iOS location permission denied:', error);
              if (error.code === 1) { // PERMISSION_DENIED
                Alert.alert(
                  'Location Permission Required',
                  'Please enable location services for this app in Settings > Privacy & Security > Location Services.',
                  [{ text: 'OK' }]
                );
              }
              resolve(false);
            },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
          );
        });
      }
      return true;
    } catch (err) {
      // console.warn('Location permission error:', err);
      return false;
    }
  }

  // Get current position
  getCurrentLocation(): Promise<LocationData> {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position => resolve(position),
        error => reject(error),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    });
  }

  // Send location to API with retry logic
  async sendLocationToAPI(locationData: LocationData, retryCount: number = 0): Promise<ApiResponse> {
    try {
      // Refresh session cookies before sending location
      await this.loadSessionCookies();
      
      // Check authentication before sending
      const isAuth = await this.isAuthenticated();
      if (!isAuth) {
        // console.log('🔍 [Authentication Debug] Current auth status:', {
        //   sessionCookies: this.sessionCookies.substring(0, 50) + '...',
        //   cookiesLength: this.sessionCookies.length,
        //   hasPhpSessId: this.sessionCookies.includes('PHPSESSID')
        // });
        throw new Error('User not authenticated. Please login first.');
      }
      const userNik = await AsyncStorage.getItem('userNik');
      const deviceId = await AsyncStorage.getItem('deviceId');

      if (!userNik || !deviceId || userNik.trim() === '' || deviceId.trim() === '') {
        console.warn('⚠️ [DEBUG] Cannot send location: userNik or deviceId is empty/null');
        throw new Error('User NIK or Device ID is empty or not set. Please login through WebView first.');
      }

      const payload = {
        nik: parseInt(userNik),
        device_id: deviceId,
        latitude: locationData.coords.latitude,
        longitude: locationData.coords.longitude,
        accuracy: locationData.coords.accuracy || 0,
        note: "Iphone",
        fake: 0,
        xposed: await this.detectRoot(),
        isvirtual: await this.detectMockLocation()
      };

      console.log('📍 [DEBUG] API Payload Parameters:', payload);
      // console.log('📍 Sending location data (attempt ' + (retryCount + 1) + '):', {
      //   url: `${this.API_BASE_URL}gps_log.php`,
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Accept': 'application/json',
      //   },
      //   payload: {
      //     ...payload,
      //     lat_short: payload.latitude.toFixed(6),
      //     lng_short: payload.longitude.toFixed(6)
      //   }
      // });

      const controller = new AbortController();
      const timeoutDuration = this.retryConfig.apiTimeout;
      const timeoutId = setTimeout(() => {
        // console.log('⏰ API request timeout after', timeoutDuration/1000, 'seconds');
        controller.abort();
      }, timeoutDuration);


      const response = await fetch(`${this.API_BASE_URL}api/gps_log.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cookie': this.sessionCookies,
          'User-Agent': 'EmployeeAttendanceApp/1.0',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      console.log('🌐 [DEBUG] Network Response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
      });

      if (!response.ok) {
        // console.error('❌ HTTP Error Details:', {
        //   status: response.status,
        //   statusText: response.statusText,
        //   url: response.url,
        //   body: responseText
        // });
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${responseText}`);
      }

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        // console.error('❌ JSON Parse Error:', parseError);
        // console.error('Raw response:', responseText);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }
      
      if (responseData.status === 'success') {
        console.log('✅ [DEBUG] Location sent successfully:', responseData.message);
        this.retryCount = 0; // Reset retry count on success
        this.isOnline = true;
        await this.processPendingRequests(); // Process any pending requests
        return responseData;
      } else {
        throw new Error(responseData.message || 'Server returned error status');
      }
    } catch (error: any) {
      console.error(`❌ [DEBUG] Error sending location (attempt ${retryCount + 1}):`, {
        message: error.message,
        name: error.name,
        stack: error.stack,
        cause: error.cause,
      });
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        // console.error('🚫 Network fetch failed - possible connectivity issue');
        // console.error('💡 Check network connection or server availability');
      }
      
      if (error.name === 'AbortError') {
        // console.error('⏱️ Request timeout - server took too long to respond');
        // console.error('💡 Server may be overloaded or network is slow');
        // console.error('🔍 API URL:', `${this.API_BASE_URL}api/gps_log.php`);
      }
      
      // Handle network errors and retry logic
      if (retryCount < this.retryConfig.maxRetries && this.shouldRetry(error)) {
        const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, retryCount);
        // console.log(`⏳ Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendLocationToAPI(locationData, retryCount + 1);
      } else {
        // Store failed request for later retry
        if (this.shouldQueue(error)) {
          await this.queueFailedRequest(locationData);
          this.isOnline = false;
        }
        throw error;
      }
    }
  }

  // Start real-time location tracking
  async startLocationTracking(): Promise<void> {
    try {
      if (this.isTracking) {
        // console.log('Location tracking already active');
        return;
      }

      // Check if userNik and deviceId are set from WebView
      const userNik = await AsyncStorage.getItem('userNik');
      const deviceId = await AsyncStorage.getItem('deviceId');
      
      if (!userNik || !deviceId) {
        // console.warn('⚠️ Cannot start location tracking: userNik or deviceId not set from WebView');
        Alert.alert('Setup Required', 'Please login through the web interface first to enable location tracking.');
        return;
      }

      const hasPermission = await this.requestLocationPermission();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Location permission is required for attendance tracking.');
        return;
      }

      console.log('🟢 [DEBUG] Starting real-time location tracking...');
      this.isTracking = true;

      // Send initial location immediately
      await this.logCurrentLocation();

      // Check and adjust tracking interval every 5 minutes based on battery state
      setInterval(async () => {
        if (this.isTracking) {
          await this.adjustTrackingInterval();
        }
      }, 300000); // 5 minutes

      // Set up continuous position watching
      this.watchId = Geolocation.watchPosition(
        (position) => {
          this.handleLocationUpdate(position);
        },
        (error) => {
          // console.error('Location watch error:', error);
          this.handleLocationError(error);
        },
        {
          enableHighAccuracy: this.config.enableHighAccuracy,
          timeout: this.config.timeout,
          maximumAge: this.config.maximumAge,
          distanceFilter: this.config.distanceFilter,
        }
      );

      // Set up interval for regular API calls based on battery state
      const trackingInterval = await this.getTrackingInterval();
      this.intervalId = setInterval(async () => {
        if (this.isTracking && this.lastKnownLocation) {
          // Check if userNik and deviceId are available before API call
          const userNik = await AsyncStorage.getItem('userNik');
          const deviceId = await AsyncStorage.getItem('deviceId');
          
          if (!userNik || !deviceId || userNik.trim() === '' || deviceId.trim() === '') {
            // console.warn('⚠️ Skipping location API call: userNik or deviceId is empty/null');
            return;
          }
          
          await this.sendLocationToAPI(this.lastKnownLocation);
        }
      }, trackingInterval);

    } catch (error) {
      // console.error('Error starting location tracking:', error);
      this.isTracking = false;
    }
  }

  // Handle location updates from watch position
  private async handleLocationUpdate(position: LocationData): Promise<void> {
    try {
      this.lastKnownLocation = position;
      
      // Update storage with latest location
      await AsyncStorage.setItem('lastLocationUpdate', new Date().toISOString());
      await AsyncStorage.setItem('lastLocation', JSON.stringify({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: Date.now()
      }));
      
      // console.log('📍 Location updated:', {
      //   lat: position.coords.latitude.toFixed(6),
      //   lng: position.coords.longitude.toFixed(6),
      //   accuracy: Math.round(position.coords.accuracy),
      // });
      
    } catch (error) {
      // console.error('Error handling location update:', error);
    }
  }

  // Handle location errors
  private handleLocationError(error: any): void {
    // console.error('Location error:', error);
    
    switch (error?.code) {
      case 1: // PERMISSION_DENIED
        Alert.alert('Location Access Denied', 'Please enable location services for this app.');
        this.stopLocationTracking();
        break;
      case 2: // POSITION_UNAVAILABLE
        // console.warn('Location unavailable, continuing to monitor...');
        break;
      case 3: // TIMEOUT
        // console.warn('Location timeout, will retry automatically...');
        break;
      default:
        // console.warn('Unknown location error:', error);
    }
  }

  // Log current location (immediate)
  async logCurrentLocation(): Promise<void> {
    try {
      const position = await this.getCurrentLocation();
      this.lastKnownLocation = position;
      await this.sendLocationToAPI(position);
      
      // Store last location timestamp
      await AsyncStorage.setItem('lastLocationUpdate', new Date().toISOString());
      
    } catch (error: any) {
      // console.error('Error logging location:', error);
      this.handleLocationError(error);
    }
  }

  // Stop location tracking
  stopLocationTracking(): void {
    // console.log('🔴 Stopping location tracking...');
    
    this.isTracking = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.watchId) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  // Check if tracking is active
  isLocationTrackingActive(): boolean {
    return this.isTracking;
  }

  // Utility methods for security checks
  private async detectRoot(): Promise<number> {
    // Basic root detection - can be enhanced
    try {
      // This is a placeholder - implement actual root detection
      return 0; // 0 = not rooted, 1 = rooted
    } catch (error) {
      return 0;
    }
  }

  private async detectMockLocation(): Promise<number> {
    // Mock location detection - can be enhanced
    try {
      let isMockLocation = false;
      
      if (Platform.OS === 'android') {
        // Check if running on Android emulator
        const isAndroidEmulator = (
          Platform.constants.Brand?.includes('google') ||
          Platform.constants.Model?.includes('sdk') ||
          Platform.constants.Manufacturer?.includes('Google')
        );
        
        if (isAndroidEmulator) {
          // console.log('🤖 Running on Android emulator - mock location detected');
          isMockLocation = true;
        }
      } else if (Platform.OS === 'ios') {
        // Check if running on iOS simulator
        const isIOSSimulator = (
          Platform.constants.systemName?.includes('iPhone OS') && 
          (Platform.constants.model?.includes('Simulator') || 
           Platform.constants.model?.includes('simulator') ||
           __DEV__ && Platform.constants.systemVersion?.includes('x86_64'))
        );
        
        if (isIOSSimulator) {
          // console.log('🤖 Running on iOS simulator - mock location detected');
          isMockLocation = true;
        }
      }
      
      this.notifyWebViewFakeGps(isMockLocation);
      return isMockLocation ? 1 : 0; // 0 = real location, 1 = mock location
    } catch (error) {
      // console.warn('Error detecting mock location:', error);
      this.notifyWebViewFakeGps(false);
      return 0;
    }
  }

  // Notify WebView about fake GPS detection
  private notifyWebViewFakeGps(isFake: boolean) {
    try {
      // This would be called by the App.tsx component that has access to webViewRef
      // We'll emit an event that App.tsx can listen to
      if (global.webViewRef?.current) {
        global.webViewRef.current.injectJavaScript(`
          if (typeof handleFakeGpsFromReactNative === 'function') {
            handleFakeGpsFromReactNative(${isFake});
          }
          true; // Required for injectJavaScript
        `);
      }
    } catch (error) {
      // console.warn('Could not notify WebView about fake GPS:', error);
    }
  }

  // Retry logic helpers
  private shouldRetry(error: any): boolean {
    // Retry on network errors, timeouts, server errors
    return (
      error.name === 'AbortError' ||
      error.message?.includes('Network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('fetch') ||
      error.message?.startsWith('HTTP 5')
    );
  }

  private shouldQueue(error: any): boolean {
    // Queue requests on network connectivity issues
    return (
      error.name === 'AbortError' ||
      error.message?.includes('Network') ||
      error.message?.includes('fetch failed')
    );
  }

  // Queue failed requests for retry when online
  private async queueFailedRequest(locationData: LocationData): Promise<void> {
    try {
      const queuedRequest = {
        locationData,
        timestamp: Date.now(),
        id: Math.random().toString(36).substr(2, 9)
      };
      
      this.pendingRequests.push(queuedRequest);
      
      // Keep only last 10 failed requests to prevent memory issues
      if (this.pendingRequests.length > 10) {
        this.pendingRequests.shift();
      }
      
      // console.log('📋 Queued failed request. Total pending:', this.pendingRequests.length);
    } catch (error) {
      // console.error('Error queueing failed request:', error);
    }
  }

  // Process pending requests when online
  private async processPendingRequests(): Promise<void> {
    if (this.pendingRequests.length === 0) return;
    
    // console.log('🔄 Processing', this.pendingRequests.length, 'pending requests...');
    
    const requests = [...this.pendingRequests];
    this.pendingRequests = [];
    
    for (const request of requests) {
      try {
        await this.sendLocationToAPI(request.locationData);
        // console.log('✅ Processed pending request:', request.id);
      } catch (error) {
        // console.error('❌ Failed to process pending request:', request.id, error);
        // Re-queue if still failing
        this.pendingRequests.push(request);
      }
    }
  }

  // Get tracking status and statistics
  getTrackingStats(): any {
    return {
      isTracking: this.isTracking,
      isOnline: this.isOnline,
      pendingRequests: this.pendingRequests.length,
      lastLocation: this.lastKnownLocation ? {
        latitude: this.lastKnownLocation.coords.latitude,
        longitude: this.lastKnownLocation.coords.longitude,
        accuracy: this.lastKnownLocation.coords.accuracy,
      } : null,
      retryCount: this.retryCount,
    };
  }

  // Force sync all pending data
  async forceSyncPendingData(): Promise<void> {
    if (this.pendingRequests.length > 0) {
      // console.log('🔄 Force syncing', this.pendingRequests.length, 'pending requests...');
      await this.processPendingRequests();
    }
    
    if (this.lastKnownLocation) {
      // console.log('📍 Force sending current location...');
      await this.sendLocationToAPI(this.lastKnownLocation);
    }
  }

  // Update tracking configuration
  updateConfig(newConfig: Partial<LocationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    // console.log('⚙️ Updated location config:', this.config);
    
    // Restart tracking if active to apply new config
    if (this.isTracking) {
      // console.log('🔄 Restarting tracking to apply new config...');
      this.stopLocationTracking();
      setTimeout(() => this.startLocationTracking(), 1000);
    }
  }

  // Update retry configuration (including timeout)
  updateRetryConfig(newConfig: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...newConfig };
    // console.log('⚙️ Updated retry config:', this.retryConfig);
  }

  // Auto-adjust timeout based on network conditions
  async adjustTimeoutBasedOnNetworkSpeed(): Promise<void> {
    try {
      const connectivityTest = await this.testApiConnectivity();
      
      if (connectivityTest.success && connectivityTest.latency) {
        // Adjust timeout based on measured latency
        let newTimeout = this.retryConfig.apiTimeout;
        
        if (connectivityTest.latency > 3000) { // Slow network
          newTimeout = 30000; // 30 seconds
          // console.log('🐌 Slow network detected, increasing timeout to 30s');
        } else if (connectivityTest.latency > 1500) { // Moderate network
          newTimeout = 25000; // 25 seconds
          // console.log('⚡ Moderate network speed, using 25s timeout');
        } else { // Fast network
          newTimeout = 15000; // 15 seconds
          // console.log('🚀 Fast network detected, using 15s timeout');
        }
        
        this.updateRetryConfig({ apiTimeout: newTimeout });
      }
    } catch (error) {
      // console.warn('⚠️ Failed to adjust timeout based on network speed:', error);
    }
  }

  // Get last location update time
  async getLastLocationUpdate(): Promise<Date | null> {
    try {
      const timestamp = await AsyncStorage.getItem('lastLocationUpdate');
      return timestamp ? new Date(timestamp) : null;
    } catch (error) {
      // console.error('Error getting last location update:', error);
      return null;
    }
  }

  // Get cached location data
  async getCachedLocation(): Promise<any | null> {
    try {
      const cachedLocation = await AsyncStorage.getItem('lastLocation');
      return cachedLocation ? JSON.parse(cachedLocation) : null;
    } catch (error) {
      // console.error('Error getting cached location:', error);
      return null;
    }
  }

  // Load session cookies for authentication
  private async loadSessionCookies(): Promise<void> {
    try {
      const cookies = await CookieManager.get('https://absen.tirtadaroy.co.id');
      const cookieString = Object.entries(cookies)
        .map(([key, cookie]) => `${key}=${cookie.value}`)
        .join('; ');
      this.sessionCookies = cookieString;
      // console.log('🍪 Loaded session cookies on', Platform.OS + ':', cookieString.substring(0, 100) + '...');
      // console.log('🍪 Cookie count on', Platform.OS + ':', Object.keys(cookies).length);
    } catch (error) {
      // console.error('Error loading session cookies on', Platform.OS + ':', error);
      this.sessionCookies = '';
    }
  }

  // Check if user is authenticated
  async isAuthenticated(): Promise<boolean> {
    try {
      const userNik = await AsyncStorage.getItem('userNik');
      const sessionToken = await AsyncStorage.getItem('sessionToken');
      
      // Check if we have PHPSESSID cookie specifically
      const hasPhpSessId = this.sessionCookies && this.sessionCookies.includes('PHPSESSID=');
      const hasValidSession = sessionToken || hasPhpSessId;
      
      // console.log('🔍 [Authentication Check] Details:', {
      //   hasUserNik: !!userNik,
      //   userNik: userNik,
      //   hasSessionToken: !!sessionToken,
      //   hasPhpSessId: hasPhpSessId,
      //   sessionCookiesLength: this.sessionCookies.length,
      //   isAuthenticated: !!(userNik && hasValidSession)
      // });
      
      return !!(userNik && hasValidSession);
    } catch (error) {
      // console.error('Error checking authentication:', error);
      return false;
    }
  }

  // Test API connectivity (optional health check)
  async testApiConnectivity(): Promise<{success: boolean, latency?: number, error?: string}> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second test
      
      const response = await fetch(`${this.API_BASE_URL}api/health_check.php`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cookie': this.sessionCookies,
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        // console.log(`✅ API connectivity test passed (${latency}ms)`);
        return { success: true, latency };
      } else {
        return { success: false, error: `HTTP ${response.status}` };
      }
    } catch (error: any) {
      const latency = Date.now() - startTime;
      // console.warn(`⚠️ API connectivity test failed (${latency}ms):`, error.message);
      return { success: false, error: error.message, latency };
    }
  }


  // Update session cookies (call after login)
  async updateSessionCookies(): Promise<void> {
    // console.log('🔄 [Cookie Refresh] Refreshing session cookies...');
    await this.loadSessionCookies();
    // console.log('✅ [Cookie Refresh] Session cookies updated:', {
    //   cookiesLength: this.sessionCookies.length,
    //   hasPhpSessId: this.sessionCookies.includes('PHPSESSID='),
    //   preview: this.sessionCookies.substring(0, 100) + '...'
    // });
  }
}

// Export singleton instance
export default new LocationService();