import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import LocationService from '../services/LocationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LocationTracker = () => {
  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    initializeLocationService();
    
    // Handle app state changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
      LocationService.stopLocationTracking();
    };
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (appState.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to foreground
      checkTrackingStatus();
    }
    setAppState(nextAppState);
  };

  const initializeLocationService = async () => {
    try {
      // Check if tracking was previously active
      const wasTracking = await AsyncStorage.getItem('locationTrackingActive');
      if (wasTracking === 'true') {
        setIsTracking(true);
        await LocationService.startLocationTracking();
      }
      
      // Get last update time
      const lastUpdateTime = await LocationService.getLastLocationUpdate();
      setLastUpdate(lastUpdateTime);
    } catch (error) {
      console.error('Error initializing location service:', error);
    }
  };

  const checkTrackingStatus = () => {
    const trackingActive = LocationService.isLocationTrackingActive();
    setIsTracking(trackingActive);
  };

  const startTracking = async () => {
    try {
      await LocationService.startLocationTracking();
      setIsTracking(true);
      await AsyncStorage.setItem('locationTrackingActive', 'true');
      
      Alert.alert(
        'Location Tracking Started',
        'Your location will be logged every 3 minutes for attendance tracking.',
        [{text: 'OK'}]
      );
    } catch (error) {
      console.error('Error starting location tracking:', error);
      Alert.alert('Error', 'Failed to start location tracking. Please try again.');
    }
  };

  const stopTracking = async () => {
    try {
      LocationService.stopLocationTracking();
      setIsTracking(false);
      await AsyncStorage.setItem('locationTrackingActive', 'false');
      
      Alert.alert(
        'Location Tracking Stopped',
        'Location tracking has been disabled.',
        [{text: 'OK'}]
      );
    } catch (error) {
      console.error('Error stopping location tracking:', error);
    }
  };

  const formatLastUpdate = (date: Date | null): string => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    return date.toLocaleDateString();
  };

  const refreshLastUpdate = async () => {
    const lastUpdateTime = await LocationService.getLastLocationUpdate();
    setLastUpdate(lastUpdateTime);
  };

  return (
    <View style={styles.container}>
      <View style={styles.statusContainer}>
        <View style={[styles.statusIndicator, {backgroundColor: isTracking ? '#4CAF50' : '#F44336'}]} />
        <Text style={styles.statusText}>
          Location Tracking: {isTracking ? 'Active' : 'Inactive'}
        </Text>
      </View>

      <Text style={styles.description}>
        {isTracking 
          ? 'Your location is being logged every 3 minutes for attendance tracking.'
          : 'Enable location tracking to automatically log your attendance location.'
        }
      </Text>

      <View style={styles.lastUpdateContainer}>
        <Text style={styles.lastUpdateLabel}>Last Update:</Text>
        <TouchableOpacity onPress={refreshLastUpdate}>
          <Text style={styles.lastUpdateText}>{formatLastUpdate(lastUpdate)}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, {backgroundColor: isTracking ? '#F44336' : '#4CAF50'}]}
        onPress={isTracking ? stopTracking : startTracking}
      >
        <Text style={styles.buttonText}>
          {isTracking ? 'Stop Tracking' : 'Start Tracking'}
        </Text>
      </TouchableOpacity>

      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>How it works:</Text>
        <Text style={styles.infoText}>• Location is sent to server every 3 minutes</Text>
        <Text style={styles.infoText}>• Works in background when app is minimized</Text>
        <Text style={styles.infoText}>• Requires location permission to function</Text>
        <Text style={styles.infoText}>• Stops automatically when app is closed</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    margin: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    lineHeight: 20,
  },
  lastUpdateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  lastUpdateLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 5,
  },
  lastUpdateText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    textAlign: 'right',
  },
  actionButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 6,
    marginBottom: 10,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
});

export default LocationTracker;