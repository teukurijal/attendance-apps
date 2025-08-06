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

function App() {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const permissions: Permission[] = Platform.select({
      android: [
        PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
      ],
      ios: [
        PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
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

  const handleWebViewMessage = (event: any) => {
    const data = event.nativeEvent.data;
    console.log('Message from WebView:', data);
  };

  const handleWebViewError = (error: any) => {
    console.error('WebView error:', error);
    Alert.alert('Error', 'Failed to load attendance page');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Setting up location access...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      
      {permissionsGranted ? (
        <WebView
          source={{uri: 'https://online.tirtadaroy.co.id/absenlokasi/absen.php'}}
          style={styles.webview}
          onMessage={handleWebViewMessage}
          onError={handleWebViewError}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          geolocationEnabled={true}
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback={true}
          mixedContentMode="compatibility"
          userAgent="EmployeeAttendanceApp/1.0"
          onLoadStart={() => console.log('WebView loading started')}
          onLoadEnd={() => console.log('WebView loading finished')}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0066cc" />
              <Text style={styles.loadingText}>Loading attendance page...</Text>
            </View>
          )}
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
