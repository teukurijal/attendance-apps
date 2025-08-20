<?php
//absen.php
require_once 'includes/auth.php';
require_once 'includes/db.php';

$isApiRequest = false;

if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
    $isApiRequest = true;
}
if (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
    $isApiRequest = true;
}
if (isset($_GET['api']) && $_GET['api'] == '1') {
    $isApiRequest = true;
}
// Detect React Native requests
if (isset($_SERVER['HTTP_USER_AGENT'])) {
    $userAgent = $_SERVER['HTTP_USER_AGENT'];
    if (strpos($userAgent, 'ReactNativeWebView') !== false || 
        strpos($userAgent, 'ReactNative') !== false ||
        strpos($userAgent, 'okhttp') !== false) {
        $isApiRequest = true;
    }
}
// Additional headers that React Native might send
if (isset($_SERVER['HTTP_X_PLATFORM'])) {
    $isApiRequest = true;
}

if (!isset($_SESSION['nik'])) {
    if ($isApiRequest) {
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'message' => 'Sesi login tidak ditemukan. Silakan login ulang.'
        ]);
        exit;
    } else {
        header('Location: index.php');
        exit;
    }
}



if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$batas_jam_absen = getenv('ABSEN_END_TIME') ?: '08:00';

if ($isApiRequest) {
    header('Content-Type: application/json');
    echo json_encode([
        'success' => true,
        'message' => 'Halaman absen tersedia.',
        'csrf_token' => $_SESSION['csrf_token'],
        'nik' => $_SESSION['nik'],
        'batas_jam_absen' => $batas_jam_absen
    ]);
    exit;
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Absen Masuk & Keluar</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
  <link rel="stylesheet" href="assets/css/absen.css" />
</head>
<body>
<?php include 'menu.php'; ?>
<h2>Absen Masuk & Keluar</h2>

<div class="info-box" id="status">📱 Menunggu lokasi GPS...</div>
<div class="info-box" id="detail-posisi" style="font-size:14px; color:#555;"></div>
<div id="map"></div>
<button onclick="submitAbsen('masuk')" id="btn-absen-masuk" disabled>Absen Masuk</button>
<button onclick="submitAbsen('keluar')" id="btn-absen-keluar" disabled>Absen Keluar</button>
<button onclick="refreshGPS()">🔄 Refresh Lokasi</button>

<br>
<button class="laporan-btn" onclick="window.location.href='absen_saya.php'">📄 Lihat Laporan Absen Saya</button>

<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script>
const csrfToken = '<?= $_SESSION['csrf_token'] ?>';
let userMarker;
let areaPolygons = [];
let currentLat = null;
let currentLng = null;
let currentAccuracy = null;
let insideArea = false;

const statusBox = document.getElementById('status');
const detailBox = document.getElementById('detail-posisi');
const absenMasukBtn = document.getElementById('btn-absen-masuk');
const absenKeluarBtn = document.getElementById('btn-absen-keluar');
const map = L.map('map').setView([-6.2, 106.816666], 17);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

fetch('api/get_area_polygon.php')
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      data.data.forEach(area => {
        if (Array.isArray(area.koordinat_polygon)) {
          const polygon = L.polygon(area.koordinat_polygon, {
            color: 'blue',
            fillColor: '#2196f3',
            fillOpacity: 0.3
          }).addTo(map);
          polygon.bindPopup(area.nama);
          areaPolygons.push({ nama: area.nama, polygon, koordinat: area.koordinat_polygon });
          map.fitBounds(polygon.getBounds());
        }
      });
    } else {
      statusBox.innerText = "❌ Gagal memuat area kantor: " + data.message;
    }
  })
  .catch(() => {
    statusBox.innerText = "❌ Tidak dapat menghubungi server.";
  });

function pointInPolygon(point, vs) {
  let [x, y] = point, inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let [xi, yi] = vs[i], [xj, yj] = vs[j];
    let intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / ((yj - yi) + 0.0000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

let lastFakeGpsCheck = 0;
function shouldCheckFakeGPS() {
  const now = Date.now();
  if (now - lastFakeGpsCheck > 15000) {
    lastFakeGpsCheck = now;
    return true;
  }
  return false;
}

function detectPlatform() {
  // Check for Android app
  if (window.AndroidApp) {
    return 'android';
  }
  
  // Check for React Native WebView (cross-platform)
  if (window.ReactNativeWebView) {
    return 'react-native';
  }
  
  // Check for iOS app (React Native bridge)
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosApp) {
    return 'ios';
  }
  
  // Check user agent for mobile devices
  const userAgent = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios-web';
  } else if (/android/.test(userAgent)) {
    return 'android-web';
  }
  
  return 'web';
}

function updatePosition(lat, lng, akurasi) {
  currentLat = lat;
  currentLng = lng;
  currentAccuracy = akurasi;

  const userLatLng = L.latLng(lat, lng);

  if (userMarker) {
    userMarker.setLatLng(userLatLng);
  } else {
    userMarker = L.marker(userLatLng).addTo(map).bindPopup("Posisi Anda").openPopup();
  }

  detailBox.innerText = `📍 Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)} | Akurasi: ±${Math.round(akurasi)}m`;

  if (akurasi > 100) {
    statusBox.innerText = `⚠️ Akurasi rendah (${Math.round(akurasi)}m). Coba cari lokasi terbuka.`;
    absenMasukBtn.disabled = false;
    absenKeluarBtn.disabled = false;
    return;
  }

  insideArea = false;
  let areaName = '';

  areaPolygons.forEach(area => {
    if (pointInPolygon([lat, lng], area.koordinat)) {
      insideArea = true;
      areaName = area.nama;
    }
  });

  if (insideArea) {
    statusBox.innerText = `✅ Anda berada di dalam area kantor: ${areaName}`;
  } else {
    statusBox.innerText = "⚠️ Anda berada di luar area kantor";
  }

  absenMasukBtn.disabled = false;
  absenKeluarBtn.disabled = false;

 if (shouldCheckFakeGPS()) {
  fetch('api/check_fakegps.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: currentLat,
      lng: currentLng,
      accuracy: currentAccuracy,
      timestamp: Math.floor(Date.now() / 1000),
      client: detectPlatform()
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.status === 'fake') {
      statusBox.innerText = "🚨 Deteksi lokasi palsu (Fake GPS).";
      absenMasukBtn.disabled = true;
      absenKeluarBtn.disabled = true;
    } else if (data.status === 'suspicious') {
      statusBox.innerText = "⚠️ Pergerakan GPS mencurigakan.";
    } else {
      console.log("✅ Lokasi valid:", data);
    }
  })
  .catch(() => {
    console.warn("❌ Gagal memeriksa lokasi dengan server.");
  });
}}

function handleFakeGpsFromAndroid(isFake) {
    const statusBox = document.getElementById("status");
    const absenMasukBtn = document.getElementById("btn-absen-masuk");
    const absenKeluarBtn = document.getElementById("btn-absen-keluar");

    if (isFake) {
        statusBox.innerText = "🚨 Lokasi palsu terdeteksi dari sistem Android!";
        absenMasukBtn.disabled = true;
        absenKeluarBtn.disabled = true;
    } else {
        statusBox.innerText = "✅ Lokasi valid terdeteksi dari Android.";
        absenMasukBtn.disabled = false;
        absenKeluarBtn.disabled = false;
    }
}

function handleFakeGpsFromIOS(isFake) {
    const statusBox = document.getElementById("status");
    const absenMasukBtn = document.getElementById("btn-absen-masuk");
    const absenKeluarBtn = document.getElementById("btn-absen-keluar");

    if (isFake) {
        statusBox.innerText = "🚨 Lokasi palsu terdeteksi dari sistem iOS!";
        absenMasukBtn.disabled = true;
        absenKeluarBtn.disabled = true;
    } else {
        statusBox.innerText = "✅ Lokasi valid terdeteksi dari iOS.";
        absenMasukBtn.disabled = false;
        absenKeluarBtn.disabled = false;
    }
}

function handleFakeGpsFromApp(isFake, platform = 'mobile') {
    const statusBox = document.getElementById("status");
    const absenMasukBtn = document.getElementById("btn-absen-masuk");
    const absenKeluarBtn = document.getElementById("btn-absen-keluar");

    if (isFake) {
        statusBox.innerText = `🚨 Lokasi palsu terdeteksi dari sistem ${platform}!`;
        absenMasukBtn.disabled = true;
        absenKeluarBtn.disabled = true;
        
        // Send feedback to React Native
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'fakeGpsDetected',
            isFake: true,
            platform: platform,
            timestamp: new Date().toISOString()
          }));
        }
    } else {
        statusBox.innerText = `✅ Lokasi valid terdeteksi dari ${platform}.`;
        absenMasukBtn.disabled = false;
        absenKeluarBtn.disabled = false;
        
        // Send feedback to React Native
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'locationValid',
            isFake: false,
            platform: platform,
            timestamp: new Date().toISOString()
          }));
        }
    }
}



function updateLocationFromApp(lat, lng, accuracy = 5, isValid = true, platform = null) {
  // Check for Android app
  if (window.AndroidApp && AndroidApp.isLocationValid && !AndroidApp.isLocationValid()) {
    statusBox.innerText = "🚨 Lokasi palsu terdeteksi dari sistem Android!";
    alert("🚫 Lokasi tidak valid.");
    return;
  }
  
  // Check location validity from any platform
  if (!isValid) {
    const detectedPlatform = platform || detectPlatform();
    statusBox.innerText = `🚨 Lokasi palsu terdeteksi dari sistem ${detectedPlatform}!`;
    alert("🚫 Lokasi tidak valid.");
    return;
  }
  
  // Check for React Native bridge (cross-platform)
  if (window.ReactNativeWebView) {
    console.log("✅ React Native WebView detected");
    // Send location update confirmation back to React Native
    window.ReactNativeWebView.postMessage(JSON.stringify({
      action: 'locationUpdated',
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      isValid: isValid,
      timestamp: new Date().toISOString()
    }));
  }
  
  // Check for iOS app (React Native bridge)
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosApp) {
    console.log("✅ iOS app detected");
  }
  
  updatePosition(lat, lng, accuracy);
}

// Function for iOS to validate location and update position
function updateLocationFromIOS(lat, lng, accuracy = 5, isValid = true) {
  updateLocationFromApp(lat, lng, accuracy, isValid, 'iOS');
}

// Function for React Native to validate location and update position  
function updateLocationFromReactNative(lat, lng, accuracy = 5, isValid = true) {
  updateLocationFromApp(lat, lng, accuracy, isValid, 'React Native');
}

function startGPS() {
  navigator.geolocation.watchPosition(pos => {
    updatePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
  }, err => {
    statusBox.innerText = "❌ Gagal mendapatkan lokasi: " + err.message;
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

function refreshGPS() {
  navigator.geolocation.getCurrentPosition(pos => {
    updatePosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
  }, err => {
    statusBox.innerText = "❌ Gagal mendapatkan lokasi: " + err.message;
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

function submitAbsen(tipe) {
  if (!currentLat || !currentLng) {
    alert("❌ Lokasi belum tersedia.");
    return;
  }

  if (!confirm(`Yakin ingin absen ${tipe}?`)) return;

  const formData = new FormData();
  formData.append("latitude", currentLat);
  formData.append("longitude", currentLng);
  formData.append("accuracy", currentAccuracy);
  formData.append("tipe", tipe);
  formData.append("csrf_token", csrfToken);

  fetch('api/auto_absen.php', {
    method: 'POST',
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      const now = new Date().toLocaleTimeString('id-ID');
      alert(`✅ Absen berhasil!`);
      statusBox.innerText = `✅ Absen ${tipe} berhasil dikirim pukul ${now}`;

      // Handle Android app callbacks
      if (window.AndroidApp) {
        if (tipe === 'masuk') {
          AndroidApp.startTracking?.();
          AndroidApp.setReminderAlarm?.(17, 0);
        } else if (tipe === 'keluar') {
          AndroidApp.stopTracking?.();
          AndroidApp.cancelReminderAlarm?.();
        }
      }
      
      // Handle iOS app callbacks (React Native bridge)
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosApp) {
        const message = {
          action: tipe === 'masuk' ? 'startTracking' : 'stopTracking',
          type: tipe,
          timestamp: new Date().toISOString()
        };
        window.webkit.messageHandlers.iosApp.postMessage(message);
      }
      
      // Handle React Native WebView (cross-platform)
      if (window.ReactNativeWebView) {
        const message = {
          action: tipe === 'masuk' ? 'startTracking' : 'stopTracking',
          type: tipe,
          timestamp: new Date().toISOString(),
          success: true,
          attendanceId: data.id || null
        };
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
        
        // Set reminder alarm for React Native
        if (tipe === 'masuk') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'setReminderAlarm',
            hour: 17,
            minute: 0,
            timestamp: new Date().toISOString()
          }));
        } else if (tipe === 'keluar') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            action: 'cancelReminderAlarm',
            timestamp: new Date().toISOString()
          }));
        }
      }

      if (tipe === 'masuk') absenMasukBtn.disabled = true;
      if (tipe === 'keluar') absenKeluarBtn.disabled = true;
    } else {
      alert("❌ Gagal absen: " + data.message);
      
      // Send error to React Native
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          action: 'attendanceError',
          type: tipe,
          error: data.message,
          timestamp: new Date().toISOString()
        }));
      }
    }
  })
  .catch((error) => {
    alert("❌ Gagal mengirim data absen.");
    
    // Send network error to React Native
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        action: 'attendanceNetworkError',
        type: tipe,
        error: error.toString(),
        timestamp: new Date().toISOString()
      }));
    }
  });
}

function checkSession() {
  fetch('absen.php?api=1')
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        alert("⚠️ Sesi Anda telah habis. Silakan login ulang.");
        window.location.href = "index.php";
      }
    })
    .catch(() => {
      console.warn("⚠️ Gagal memeriksa sesi.");
    });
}

startGPS();
// setInterval(checkSession, 30000);

<?php if (isset($_SESSION['nik'], $_SESSION['device_id'])): ?>
// Set credentials for Android app
if (window.AndroidApp && AndroidApp.setCredentials) {
  AndroidApp.setCredentials(
    "<?= htmlspecialchars($_SESSION['nik']) ?>",
    "<?= htmlspecialchars($_SESSION['device_id']) ?>"
  );
  console.log("✅ AndroidApp.setCredentials dipanggil ulang");
}

// Set credentials for iOS app (React Native bridge)
if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.iosApp) {
  const credentials = {
    nik: "<?= htmlspecialchars($_SESSION['nik']) ?>",
    device_id: "<?= htmlspecialchars($_SESSION['device_id']) ?>",
    action: 'setCredentials'
  };
  window.webkit.messageHandlers.iosApp.postMessage(credentials);
  console.log("✅ iOS app credentials set");
}

// Set credentials for React Native WebView (cross-platform)
if (window.ReactNativeWebView) {
  const credentials = {
    nik: "<?= htmlspecialchars($_SESSION['nik']) ?>",
    device_id: "<?= htmlspecialchars($_SESSION['device_id']) ?>",
    action: 'setCredentials'
  };
  window.ReactNativeWebView.postMessage(JSON.stringify(credentials));
  console.log("✅ React Native WebView credentials set");
}
<?php endif; ?>
</script>


</body>
</html>