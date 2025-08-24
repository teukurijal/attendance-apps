import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import LocationService from '../services/LocationService';

interface SetupResult {
  success: boolean;
  deviceId?: string;
  error?: string;
  authenticated?: boolean;
}

/**
 * Setup Location Service with user credentials
 * Call this after user login to initialize location tracking
 */
export const setupLocationService = async (userNik: string | number = '222', generateDeviceId = true): Promise<SetupResult> => {
  try {
    // Store user NIK for API calls (default to '222' if not provided)
    const nikToStore = userNik || '222';
    await AsyncStorage.setItem('userNik', nikToStore.toString());
    
    // Generate or retrieve device ID
    let deviceId = await AsyncStorage.getItem('deviceId');
    if (!deviceId && generateDeviceId) {
      // Generate a unique device ID (you can customize this logic)
      deviceId = `RN_${Platform.OS}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await AsyncStorage.setItem('deviceId', deviceId);
    }
    
    // Update the API base URL in LocationService
    LocationService.API_BASE_URL = 'https://absen.tirtadaroy.co.id/';
    
    // Check if user is authenticated
    const isAuthenticated = await LocationService.isAuthenticated();
    
    console.log('✅ Location service setup completed:', {
      userNik: nikToStore,
      deviceId,
      baseUrl: LocationService.API_BASE_URL,
      authenticated: isAuthenticated
    });
    
    return { 
      success: true, 
      deviceId: deviceId || undefined,
      authenticated: isAuthenticated
    };
  } catch (error: any) {
    console.error('❌ Failed to setup location service:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
};

/**
 * Clear location service data (call on logout)
 */
export const clearLocationService = async (): Promise<void> => {
  try {
    LocationService.stopLocationTracking();
    await AsyncStorage.multiRemove([
      'userNik',
      'deviceId', 
      'locationTrackingActive',
      'lastLocationUpdate',
      'sessionToken'
    ]);
    console.log('✅ Location service data cleared');
  } catch (error) {
    console.error('❌ Failed to clear location service:', error);
  }
};

/**
 * Auto-start location tracking if it was previously enabled
 */
export const autoStartLocationTracking = async (): Promise<boolean> => {
  try {
    const isAuthenticated = await LocationService.isAuthenticated();
    const wasTracking = await AsyncStorage.getItem('locationTrackingActive');
    
    if (isAuthenticated && wasTracking === 'true') {
      await LocationService.startLocationTracking();
      console.log('✅ Auto-started location tracking');
      return true;
    } else if (!isAuthenticated) {
      console.warn('⚠️ Cannot auto-start tracking: User not authenticated');
    }
    return false;
  } catch (error) {
    console.error('❌ Failed to auto-start location tracking:', error);
    return false;
  }
};

/**
 * Check authentication status
 */
export const checkAuthenticationStatus = async (): Promise<{
  authenticated: boolean;
  userNik?: string;
  deviceId?: string;
}> => {
  try {
    const isAuthenticated = await LocationService.isAuthenticated();
    const userNik = await AsyncStorage.getItem('userNik');
    const deviceId = await AsyncStorage.getItem('deviceId');
    
    return {
      authenticated: isAuthenticated,
      userNik: userNik || undefined,
      deviceId: deviceId || undefined
    };
  } catch (error) {
    console.error('❌ Failed to check authentication status:', error);
    return { authenticated: false };
  }
};

/**
 * Force refresh authentication (call after manual login)
 */
export const refreshAuthentication = async (): Promise<boolean> => {
  try {
    await LocationService.updateSessionCookies();
    const isAuthenticated = await LocationService.isAuthenticated();
    console.log('🔄 Authentication refreshed:', isAuthenticated);
    return isAuthenticated;
  } catch (error) {
    console.error('❌ Failed to refresh authentication:', error);
    return false;
  }
};