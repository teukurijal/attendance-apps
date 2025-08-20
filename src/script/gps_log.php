<?php
// gps_log.php
declare(strict_types=1);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

require_once '../includes/auth.php';
require_once '../includes/db.php';
date_default_timezone_set('Asia/Jakarta');

// Debug logging (non-produksi)
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

$response = ['status' => 'error', 'message' => ''];

try {
    // Hanya izinkan POST
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception('Metode request tidak valid');
    }

    // Ambil data dari body
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if ($data === null) {
        $data = $_POST;
        if (empty($data)) {
            parse_str($input, $data);
        }
    }

    error_log("📥 Received data: " . print_r($data, true));

    // Validasi parameter wajib
    $required = ['nik', 'device_id', 'latitude', 'longitude'];
    foreach ($required as $key) {
        if (empty($data[$key])) {
            throw new Exception("Parameter '$key' tidak ditemukan atau kosong.");
        }
    }

    // Ambil dan validasi nilai
    $nik = is_numeric($data['nik']) ? (int)$data['nik'] : null;
    $device_id = trim((string)$data['device_id']);
    $latitude = is_numeric($data['latitude']) ? (float)$data['latitude'] : null;
    $longitude = is_numeric($data['longitude']) ? (float)$data['longitude'] : null;

    if ($nik === null || $latitude === null || $longitude === null) {
        throw new Exception("NIK, latitude, atau longitude tidak valid.");
    }

    // Validasi rentang koordinat (optional tapi disarankan)
    if ($latitude < -90 || $latitude > 90 || $longitude < -180 || $longitude > 180) {
        throw new Exception("Koordinat GPS berada di luar rentang yang valid.");
    }

    // Parameter opsional
    $accuracy = isset($data['accuracy']) && is_numeric($data['accuracy']) ? (float)$data['accuracy'] : null;
    $xposed = isset($data['xposed']) ? (int)$data['xposed'] : 0;
    $virtual = isset($data['virtual']) ? (int)$data['virtual'] : 0;
    $keterangan = isset($data['note']) ? trim((string)$data['note']) : 'auto log';

    // Status GPS
    $status_gps = 'AKTIF';
    if (isset($data['fake']) && (int)$data['fake'] === 1) {
        $status_gps = 'FAKE';
    }

    // Ambil usrid dari nik
    $usrid = null;
    try {
        $stmt = $pdo->prepare("SELECT usrid FROM tuser WHERE nik = ?");
        $stmt->execute([$nik]);
        $result = $stmt->fetch();
        $usrid = $result['usrid'] ?? null;
    } catch (PDOException $e) {
        error_log("⚠️ Failed to get usrid: " . $e->getMessage());
    }

    // Simpan ke tgps_log
   // Cek apakah data sudah ada berdasarkan nik dan device_id
$stmt = $pdo2->prepare("SELECT id FROM tgps_log WHERE nik = ? AND device_id = ? LIMIT 1");
$stmt->execute([$nik, $device_id]);
$existing = $stmt->fetch();

if ($existing) {
    // Jika ada, lakukan UPDATE
    $stmt = $pdo2->prepare("UPDATE tgps_log SET
        usrid = ?,
        waktu = NOW(),
        status_gps = ?,
        latitude = ?,
        longitude = ?,
        keterangan = ?,
        accuracy = ?,
        xposed = ?,
        virtual = ?
        WHERE id = ?
    ");

    $stmt->execute([
        $usrid,
        $status_gps,
        $latitude,
        $longitude,
        $keterangan,
        $accuracy,
        $xposed,
        $virtual,
        $existing['id']
    ]);

    $log_id = $existing['id'];
} else {
    // Jika belum ada, lakukan INSERT
    $stmt = $pdo2->prepare("INSERT INTO tgps_log (
        nik, usrid, device_id, waktu, status_gps,
        latitude, longitude, keterangan, accuracy, xposed, virtual
    ) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)");

    $stmt->execute([
        $nik,
        $usrid,
        $device_id,
        $status_gps,
        $latitude,
        $longitude,
        $keterangan,
        $accuracy,
        $xposed,
        $virtual
    ]);

    $log_id = $pdo2->lastInsertId();
}

    $response = [
        'status' => 'success',
        'message' => '✅ Data lokasi berhasil disimpan',
        'log_id' => $log_id,
        'debug' => [
            'nik' => $nik,
            'usrid' => $usrid,
            'device_id' => $device_id,
            'lat' => $latitude,
            'lng' => $longitude
        ]
    ];

} catch (Exception $e) {
    http_response_code(400);
    $response['message'] = $e->getMessage();
    error_log("❌ Error: " . $e->getMessage());
} catch (PDOException $e) {
    http_response_code(500);
    $response['message'] = 'Database error: ' . $e->getMessage();
    error_log("💥 PDOException: " . $e->getMessage());
}

echo json_encode($response);
