<?php
// absen.php
require_once 'includes/auth.php';
require_once 'includes/db.php';

$isApiRequest = false;

/**
 * Deteksi request "API-like"
 * - Ajax (X-Requested-With)
 * - Header Accept JSON
 * - Query ?api=1
 * - User-Agent React Native / okhttp
 * - Header X-Platform (kustom dari RN)
 * - Content-Type JSON
 */
if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && $_SERVER['HTTP_X_REQUESTED_WITH'] === 'XMLHttpRequest') {
    $isApiRequest = true;
}
if (isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
    $isApiRequest = true;
}
if (isset($_GET['api']) && $_GET['api'] == '1') {
    $isApiRequest = true;
}
// React Native / okhttp UA + header kustom
if (isset($_SERVER['HTTP_USER_AGENT'])) {
    $ua = $_SERVER['HTTP_USER_AGENT'];
    if (strpos($ua, 'ReactNativeWebView') !== false ||
        strpos($ua, 'ReactNative') !== false ||
        strpos($ua, 'okhttp') !== false) {
        $isApiRequest = true;
    }
}
if (isset($_SERVER['HTTP_X_PLATFORM'])) {
    $isApiRequest = true;
}
// Content-Type JSON (beberapa client set di header berbeda)
$contentType = $_SERVER['HTTP_CONTENT_TYPE'] ?? $_SERVER['CONTENT_TYPE'] ?? '';
if (strpos($contentType, 'application/json') !== false) {
    $isApiRequest = true;
}

// Validasi sesi
if (!isset($_SESSION['nik'])) {
    if ($isApiRequest) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
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

// CSRF token
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Konfigurasi batas jam absen via env (default 08:00)
$batas_jam_absen = getenv('ABSEN_END_TIME') ?: '08:00';

// Jika request API → response JSON ringkas
if ($isApiRequest) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
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
  <style>
    /* Safeguard kecil bila CSS eksternal gagal */
    #map { width: 100%; height: 320px; margin: 10px 0; }
    .info-box { background: #f5f7fb; padding: 10px 12px; border-radius: 10px; margin: 6px 0; }
    button { padding: 10px 14px; border-radius: 12px; border: 0; cursor: pointer; margin: 4px 2px; }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .laporan-btn { background: #fff; border: 1px solid #ddd; }
  </style>
</head>
<body>
<?php include 'menu.php'; ?>

<h2>Absen Masuk & Keluar</h2>

<div class="info-box" id="status">📱 Menunggu lokasi GPS...</div>
<div class="info-box" id="detail-posisi" style="font-size:14px; color:#555;"></div>
<div id="map"></div>

<div id="tanggal-container" style="max-width:100%;text-align:center;">
    <img src="api/absen_tanggal_image.php?v=<?php echo date('YmdHi'); ?>" 
         alt="Tanggal Hari Ini" 
         style="width:100%;height:auto;max-width:400px;">
    <div id="jam-realtime" style="font-family: Orbitron, sans-serif; font-size: 16px; margin-top: 1px;">
        Memuat jam...
    </div>
</div>

<button onclick="submitAbsen('masuk')" id="btn-absen-masuk" disabled>Absen Masuk</button>
<button onclick="submitAbsen('keluar')" id="btn-absen-keluar" disabled>Absen Keluar</button>
<button onclick="refreshGPS()">🔄 Refresh Lokasi</button>

<br>
<button class="laporan-btn" onclick="window.location.href='absen_saya.php'">📄 Lihat Laporan Absen Saya</button>

<script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
<script>
// ====== Konstanta & variabel global ======
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

// ====== Map Leaflet ======
const map = L.map('map').setView([-6.2, 106.816666], 17);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

// ====== Muat area kantor (polygon) ======
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
      statusBox.innerText = "❌ Gagal memuat area kantor: " + (data.message || 'unknown');
    }
  })
  .catch(() => {
    statusBox.innerText = "❌ Tidak dapat menghubungi server.";
  });

// ====== Helper: pointInPolygon (ray casting) ======
function pointInPolygon(point, vs) {
  let [x, y] = point, inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let [xi, yi] = vs[i], [xj, yj] = vs[j];
    const denom = ((yj - yi) + 1e-7); // hindari div zero
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ====== Fake GPS throttling ======
let lastFakeGpsCheck = 0;
function shouldCheckFakeGPS() {
  const now = Date.now();
  if (now - lastFakeGpsCheck > 15000) {
    lastFakeGpsCheck = now;
    return true;
  }
  return false;
}

// ====== Update posisi di peta + status area ======
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
  // Quick bounding-box check untuk optimasi
  for (const area of areaPolygons) {
    if (area.polygon.getBounds().contains(userLatLng)) {
      if (pointInPolygon([lat, lng], area.koordinat)) {
        insideArea = true;
        areaName = area.nama;
        break;
      }
    }
  }

  if (insideArea) {
    statusBox.innerText = `✅ Anda berada di dalam area kantor: ${areaName}`;
  } else {
    statusBox.innerText = "⚠️ Anda berada di luar area kantor";
  }

  absenMasukBtn.disabled = false;
  absenKeluarBtn.disabled = false;

  // Periodik cek fake GPS ke server
  if (shouldCheckFakeGPS()) {
    fetch('api/check_fakegps.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: currentLat,
        lng: currentLng,
        accuracy: currentAccuracy,
        timestamp: Math.floor(Date.now() / 1000),
        client: 'web'
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'fake') {
        statusBox.innerText = "🚨 Deteksi lokasi palsu (Fake GPS).";
        absenMasukBtn.disabled = true;
        absenKeluarBtn.disabled = true;
        // Beri tahu RN bila ada
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            event: 'FAKE_GPS_DETECTED',
            platform: 'server-check',
            timestamp: new Date().toISOString()
          }));
        }
      } else if (data.status === 'suspicious') {
        statusBox.innerText = "⚠️ Pergerakan GPS mencurigakan.";
      }
    })
    .catch(() => {
      console.warn("❌ Gagal memeriksa lokasi dengan server.");
    });
  }
}

// ====== Integrasi Android native (opsional) ======
function handleFakeGpsFromAndroid(isFake) {
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

// ====== Integrasi React Native WebView ======
// Fungsi umum update lokasi dari aplikasi (Android native / RN)
function updateLocationFromApp(lat, lng, accuracy = 5, isValid = true, platform = null) {
  // Jika ada AndroidApp.isLocationValid untuk testing mode
  if (window.AndroidApp && AndroidApp.isLocationValid && !AndroidApp.isLocationValid()) {
    statusBox.innerText = "🚨 Lokasi palsu terdeteksi dari sistem Android! (Testing Mode)";
    alert("🚫 Lokasi tidak valid.");
    return;
  }

  // Validasi dari platform mana pun
  if (!isValid) {
    statusBox.innerText = "🚨 Lokasi palsu terdeteksi dari sistem!";
    alert("🚫 Lokasi tidak valid.");
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        event: 'FAKE_GPS_DETECTED',
        platform: platform || 'unknown',
        timestamp: new Date().toISOString()
      }));
    }
    return;
  }

  // Kirim feedback ke RN (jika ada)
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      event: 'LOCATION_UPDATED',
      latitude: lat,
      longitude: lng,
      accuracy: accuracy,
      isValid: isValid,
      platform: platform || 'web',
      timestamp: new Date().toISOString()
    }));
  }

  updatePosition(lat, lng, accuracy);
}

// API khusus dipanggil dari RN
function updateLocationFromReactNative(lat, lng, accuracy = 5, isValid = true) {
  console.log("📡 RN location:", lat, lng, accuracy, isValid);
  updateLocationFromApp(lat, lng, accuracy, isValid, 'React Native');
}

// Tanggapi flag fake-GPS dari RN
function handleFakeGpsFromReactNative(isFake) {
  if (isFake) {
    statusBox.innerText = "🚨 Lokasi palsu terdeteksi dari React Native!";
    absenMasukBtn.disabled = true;
    absenKeluarBtn.disabled = true;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        event: 'FAKE_GPS_DETECTED',
        platform: 'React Native',
        timestamp: new Date().toISOString()
      }));
    }
  } else {
    statusBox.innerText = "✅ Lokasi valid (React Native)";
    absenMasukBtn.disabled = false;
    absenKeluarBtn.disabled = false;
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        event: 'LOCATION_VALID',
        platform: 'React Native',
        timestamp: new Date().toISOString()
      }));
    }
  }
}

// ====== Geolocation browser ======
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

// ====== Submit absen ======
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

      // Android native hooks (opsional)
      if (window.AndroidApp) {
        if (tipe === 'masuk') {
          AndroidApp.startTracking?.();
          AndroidApp.setReminderAlarm?.(17, 0);
        } else if (tipe === 'keluar') {
          AndroidApp.stopTracking?.();
          AndroidApp.cancelReminderAlarm?.();
        }
      }

      // React Native WebView callbacks (event konsisten)
      if (window.ReactNativeWebView) {
        const message = {
          event: (tipe === 'masuk') ? 'START_TRACKING' : 'STOP_TRACKING',
          tipe: tipe,
          success: true,
          timestamp: new Date().toISOString(),
          attendanceId: data.id || null
        };
        window.ReactNativeWebView.postMessage(JSON.stringify(message));

        if (tipe === 'masuk') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            event: 'SET_REMINDER_ALARM',
            hour: 17,
            minute: 0,
            timestamp: new Date().toISOString()
          }));
        } else if (tipe === 'keluar') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            event: 'CANCEL_REMINDER_ALARM',
            timestamp: new Date().toISOString()
          }));
        }
      }

      if (tipe === 'masuk') absenMasukBtn.disabled = true;
      if (tipe === 'keluar') absenKeluarBtn.disabled = true;
    } else {
      alert("❌ Gagal absen: " + data.message);

      // Kirim error ke RN
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          event: 'ATTENDANCE_ERROR',
          tipe: tipe,
          error: data.message,
          timestamp: new Date().toISOString()
        }));
      }
    }
  })
  .catch((error) => {
    alert("❌ Gagal mengirim data absen.");

    // Network error ke RN
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        event: 'ATTENDANCE_NETWORK_ERROR',
        tipe: tipe,
        error: (error && error.toString) ? error.toString() : 'network_error',
        timestamp: new Date().toISOString()
      }));
    }
  });
}

// ====== Session keep-alive (opsional) ======
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

// Start GPS
startGPS();
// setInterval(checkSession, 30000);

// ====== Kirim kredensial ke Android native & React Native ======
<?php if (isset($_SESSION['nik'], $_SESSION['device_id'])): ?>
if (window.AndroidApp && AndroidApp.setCredentials) {
  AndroidApp.setCredentials(
    "<?= htmlspecialchars($_SESSION['nik']) ?>",
    "<?= htmlspecialchars($_SESSION['device_id']) ?>"
  );
  console.log("✅ AndroidApp.setCredentials dipanggil ulang");
}

if (window.ReactNativeWebView) {
  const credentials = {
    event: 'SET_CREDENTIALS',
    nik: "<?= htmlspecialchars($_SESSION['nik']) ?>",
    device_id: "<?= htmlspecialchars($_SESSION['device_id']) ?>"
  };
  window.ReactNativeWebView.postMessage(JSON.stringify(credentials));
  console.log("✅ React Native WebView credentials set");
}
<?php endif; ?>

// ====== Jam realtime ======
function updateJam() {
  const now = new Date();
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('jam-realtime').textContent = jam;
}
setInterval(updateJam, 1000);
updateJam();
</script>
</body>
</html>