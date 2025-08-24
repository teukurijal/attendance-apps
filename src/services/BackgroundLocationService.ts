import {AppState, AppStateStatus} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LocationService from './LocationService';

class BackgroundLocationService {
  private appState: AppStateStatus;
  private backgroundTimer: NodeJS.Timeout | null;
  private isBackgroundTrackingEnabled: boolean;

  constructor() {
    this.appState = AppState.currentState;
    this.backgroundTimer = null;
    this.isBackgroundTrackingEnabled = false;
    
    this.initializeAppStateListener();
  }

  // Initialize app state change listener
  private initializeAppStateListener(): void {
    AppState.addEventListener('change', this.handleAppStateChange.bind(this));
  }

  // Handle app state changes
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    console.log('🔄 App state changed:', this.appState, '->', nextAppState);
    
    if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('📱 App has come to the foreground');
      this.handleForeground();
    } else if (this.appState === 'active' && nextAppState.match(/inactive|background/)) {
      console.log('🌙 App has gone to the background');
      this.handleBackground();
    }
    
    this.appState = nextAppState;
  }

  // Handle when app goes to foreground
  private async handleForeground(): Promise<void> {
    try {
      // Stop background tracking
      this.stopBackgroundTracking();
      
      // Force sync any pending data
      await LocationService.forceSyncPendingData();
      
      // Resume normal location tracking if it was active
      const wasTracking = await AsyncStorage.getItem('wasLocationTracking');
      if (wasTracking === 'true' && !LocationService.isLocationTrackingActive()) {
        console.log('🟢 Resuming location tracking from background');
        await LocationService.startLocationTracking();
      }
      
      console.log('✅ Foreground transition completed');
    } catch (error) {
      console.error('❌ Error handling foreground transition:', error);
    }
  }

  // Handle when app goes to background
  private async handleBackground(): Promise<void> {
    try {
      // Store current tracking state
      const isTracking = LocationService.isLocationTrackingActive();
      await AsyncStorage.setItem('wasLocationTracking', isTracking.toString());
      
      if (isTracking && this.isBackgroundTrackingEnabled) {
        console.log('🌙 Starting background location tracking...');
        this.startBackgroundTracking();
      }
      
      console.log('✅ Background transition completed');
    } catch (error) {
      console.error('❌ Error handling background transition:', error);
    }
  }

  // Start background location tracking
  private startBackgroundTracking(): void {
    if (this.backgroundTimer) {
      return; // Already running
    }

    // More frequent updates in background (every 2 minutes)
    this.backgroundTimer = setInterval(async () => {
      try {
        console.log('🌙 Background location update...');
        
        // Get current location and send to API
        const position = await LocationService.getCurrentLocation();
        await LocationService.sendLocationToAPI(position);
        
        // Log background activity
        await AsyncStorage.setItem('lastBackgroundUpdate', new Date().toISOString());
        
      } catch (error) {
        console.error('❌ Background location update failed:', error);
      }
    }, 120000); // 2 minutes

    console.log('🟢 Background tracking started');
  }

  // Stop background location tracking
  private stopBackgroundTracking(): void {
    if (this.backgroundTimer) {
      clearInterval(this.backgroundTimer);
      this.backgroundTimer = null;
      console.log('🔴 Background tracking stopped');
    }
  }

  // Enable/disable background tracking
  setBackgroundTrackingEnabled(enabled: boolean): void {
    this.isBackgroundTrackingEnabled = enabled;
    console.log('⚙️ Background tracking enabled:', enabled);
    
    // Store preference
    AsyncStorage.setItem('backgroundTrackingEnabled', enabled.toString());
  }

  // Initialize background tracking setting from storage
  async initializeBackgroundTracking(): Promise<void> {
    try {
      const enabled = await AsyncStorage.getItem('backgroundTrackingEnabled');
      this.isBackgroundTrackingEnabled = enabled === 'true';
      console.log('⚙️ Background tracking initialized:', this.isBackgroundTrackingEnabled);
    } catch (error) {
      console.error('Error initializing background tracking setting:', error);
      this.isBackgroundTrackingEnabled = true; // Default to enabled
    }
  }

  // Get background tracking stats
  async getBackgroundStats(): Promise<any> {
    try {
      const lastBackgroundUpdate = await AsyncStorage.getItem('lastBackgroundUpdate');
      const wasTracking = await AsyncStorage.getItem('wasLocationTracking');
      
      return {
        isBackgroundTrackingEnabled: this.isBackgroundTrackingEnabled,
        isBackgroundTimerActive: this.backgroundTimer !== null,
        lastBackgroundUpdate: lastBackgroundUpdate ? new Date(lastBackgroundUpdate) : null,
        wasLocationTracking: wasTracking === 'true',
        currentAppState: this.appState,
      };
    } catch (error) {
      console.error('Error getting background stats:', error);
      return {
        isBackgroundTrackingEnabled: this.isBackgroundTrackingEnabled,
        isBackgroundTimerActive: this.backgroundTimer !== null,
        currentAppState: this.appState,
      };
    }
  }

  // Force background sync (useful for testing)
  async forceBackgroundSync(): Promise<void> {
    try {
      console.log('🔄 Forcing background sync...');
      const position = await LocationService.getCurrentLocation();
      await LocationService.sendLocationToAPI(position);
      await AsyncStorage.setItem('lastBackgroundUpdate', new Date().toISOString());
      console.log('✅ Background sync completed');
    } catch (error) {
      console.error('❌ Background sync failed:', error);
      throw error;
    }
  }

  // Cleanup method
  destroy(): void {
    this.stopBackgroundTracking();
    AppState.removeEventListener('change', this.handleAppStateChange.bind(this));
    console.log('🧹 BackgroundLocationService destroyed');
  }
}

// Export singleton instance
export default new BackgroundLocationService();