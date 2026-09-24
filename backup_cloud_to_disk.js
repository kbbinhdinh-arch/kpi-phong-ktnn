/**
 * ============================================================================
 * CÔNG CỤ SAO LƯU DỮ LIỆU TỪ MONGODB ATLAS CLOUD VỀ Ổ ĐĨA CỤC BỘ
 * Tác giả: Trần Quốc Hoàng - KBNN Khu vực XV
 * Chạy bằng Node.js (không cần cài thêm Python)
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { MongoClient } = require('mongodb');

// Đọc file .env nếu có
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx > 0) {
          const k = trimmed.substring(0, idx).trim();
          const v = trimmed.substring(idx + 1).trim();
          if (!process.env[k]) process.env[k] = v;
        }
      }
    });
  }
}
loadEnv();

const mongoUri = process.env.MONGODB_URI || "mongodb+srv://kbbinhdinh_db_user:ZvCQmfp24YwNudJS@kpi-ktnn-db.olx4piw.mongodb.net/?appName=kpi-ktnn-db";

function formatDate(d) {
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const HH = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}_${MM}_${dd}_${HH}h${mm}m${ss}s`;
}

async function backupCloud() {
  console.log("=".repeat(70));
  console.log("🚀 ĐANG KẾT NỐI TỚI MONGODB ATLAS CLOUD ĐỂ SAO LƯU DỮ LIỆU...");
  console.log("=".repeat(70));

  let client = null;
  try {
    client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
    const db = client.db('kpi_ktnn_db');

    await db.command({ ping: 1 });
    console.log("✅ Kết nối tới MongoDB Atlas thành công!");

    const collections = await db.listCollections().toArray();
    const colNames = collections.map(c => c.name);
    console.log(`📦 Các bảng dữ liệu hiện có trên Cloud: [${colNames.join(', ')}]`);

    const now = new Date();
    const backupData = {
      backup_info: {
        source: "MongoDB Atlas Cloud (kpi_ktnn_db)",
        created_at: now.toISOString(),
        target_office: "Phòng Kế toán Nhà nước - KBNN Khu vực XV",
        author: "Trần Quốc Hoàng",
        runtime: "Node.js Portable / System"
      },
      collections: {}
    };

    let totalRecords = 0;
    for (const name of colNames) {
      const docs = await db.collection(name).find({}).toArray();
      backupData.collections[name] = docs;
      totalRecords += docs.length;
      console.log(`  🔹 Bảng [${name}]: ${docs.length} bản ghi`);
    }

    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestampStr = formatDate(now);
    const jsonPath = path.join(backupDir, `KPI_Cloud_Backup_${timestampStr}.json`);
    const gzPath = path.join(backupDir, `KPI_Cloud_Backup_${timestampStr}.json.gz`);

    const jsonStr = JSON.stringify(backupData, null, 2);
    fs.writeFileSync(jsonPath, jsonStr, 'utf8');

    const gzipped = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 9 });
    fs.writeFileSync(gzPath, gzipped);

    const jsonSizeKb = (fs.statSync(jsonPath).size / 1024).toFixed(1);
    const gzSizeKb = (gzipped.length / 1024).toFixed(1);

    console.log("=".repeat(70));
    console.log("🎉 SAO LƯU THÀNH CÔNG 100% TOÀN BỘ DỮ LIỆU CLOUD VỀ MÁY TÍNH!");
    console.log(`📍 Tổng số bản ghi đã sao lưu: ${totalRecords}`);
    console.log(`📁 File JSON rõ ràng: ${jsonPath} (${jsonSizeKb} KB)`);
    console.log(`📦 File nén an toàn: ${gzPath} (${gzSizeKb} KB)`);
    console.log("=".repeat(70));
  } catch (err) {
    console.error(`❌ Lỗi sao lưu: ${err.message}`);
    console.log("💡 Lưu ý: Nếu chạy trong mạng LAN cơ quan có Proxy, cần kiểm tra kết nối SRV tới Atlas.");
    process.exit(1);
  } finally {
    if (client) {
      try { await client.close(); } catch (e) {}
    }
  }
}

backupCloud();
