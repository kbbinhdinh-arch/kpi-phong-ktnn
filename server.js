/**
 * ============================================================================
 * HỆ THỐNG QUẢN LÝ & ĐÁNH GIÁ KPI THEO NGHỊ ĐỊNH 335 VÀ QUYẾT ĐỊNH 1253
 * BẢN QUYỀN PHẦN MỀM THUỘC VỀ: ÔNG TRẦN QUỐC HOÀNG
 * Chức vụ: Phó Trưởng phòng Kế toán Nhà nước - Kho bạc Nhà nước Khu vực XV
 * 
 * ĐIỀU KHOẢN BẢO HỘ & KHÓA THIẾT BỊ PHẦN CỨNG (HARDWARE LOCK):
 * - Phần mềm được bảo hộ quyền tác giả theo pháp luật Sở hữu trí tuệ Việt Nam.
 * - THIẾT BỊ DUY NHẤT ĐƯỢC PHÉP HIỆU CHỈNH & QUẢN TRỊ ỨNG DỤNG: kvxv-hoangtq
 * - Nghiêm cấm mọi hành vi tự ý can thiệp, chỉnh sửa cấu hình hệ thống trên các máy khác.
 * ============================================================================
 */

// BẢO VỆ CHỐNG CRASH TIẾN TRÌNH KHI CHẠY TRÊN INTERNET (ZERO CRASH PROTECTION)
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL PROTECTED] Lỗi Uncaught Exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL PROTECTED] Lỗi Unhandled Rejection:', reason);
});

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { MongoClient, ObjectId } = require('mongodb');

const BASE_DIR = __dirname;

// TỰ ĐỘNG ĐỌC BIẾN MÔI TRƯỜNG TỪ FILE .ENV (BẢO VỆ THÔNG TIN NHẠY CẢM)
function loadEnvFile() {
  const envPath = path.join(BASE_DIR, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.substring(0, idx).trim();
            const val = trimmed.substring(idx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    } catch (e) {}
  }
}
loadEnvFile();

// ============================================================================
// ĐỊNH DANH BẢN QUYỀN TÁC GIẢ & THIẾT BỊ PHẦN CỨNG ĐƯỢC CẤP PHÉP
// ============================================================================
const AUTHOR_INFO = {
  author: "Trần Quốc Hoàng",
  title: "Phó Trưởng phòng Kế toán Nhà nước",
  organization: "Kho bạc Nhà nước Khu vực XV",
  authorizedHostname: "kvxv-hoangtq",
  authorizedUsername: "hoangtq",
  authorizedMac: "a4:bb:6d:e3:ae:1a",
  copyright: "Bản quyền phần mềm thuộc về ông Trần Quốc Hoàng © 2026. Mọi quyền được bảo lưu.",
  legalBasis: "Nghị định số 335/2025/NĐ-CP và Quyết định số 1253/QĐ-BTC",
  notice: "Phần mềm chỉ được phép hiệu chỉnh và quản trị độc quyền trên thiết bị gốc của tác giả (kvxv-hoangtq)."
};

function isAuthorAuthorizedMachine() {
  if (process.env.AUTHOR_SERVER === 'true' || process.env.AUTHOR_SERVER === '1') return true;
  const currentHost = (os.hostname() || '').toLowerCase().trim();
  const currentUser = (os.userInfo ? (os.userInfo().username || '') : '').toLowerCase().trim();
  const isHostMatch = (currentHost === AUTHOR_INFO.authorizedHostname.toLowerCase());
  const isUserMatch = (currentUser === AUTHOR_INFO.authorizedUsername.toLowerCase());
  return isHostMatch || isUserMatch;
}

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const HTML_FILE = path.join(BASE_DIR, 'App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html');

// ============================================================================
// KẾT NỐI MONGODB ATLAS (LƯU TRỮ LÂU DÀI TRÊN CLOUD)
// ============================================================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://kbbinhdinh_db_user:ZvCQmfp24YwNudJS@kpi-ktnn-db.olx4piw.mongodb.net/?appName=kpi-ktnn-db";
let dbClient = null;
let kpiDb = null;

async function connectMongo() {
  if (!MONGODB_URI) {
    console.warn("[MongoDB] CẢNH BÁO: Chưa cấu hình biến môi trường MONGODB_URI! Hệ thống sẽ dùng bộ nhớ tạm.");
    return;
  }
  try {
    dbClient = new MongoClient(MONGODB_URI);
    await dbClient.connect();
    kpiDb = dbClient.db('kpi_ktnn_db');
    console.log("[MongoDB] Đã kết nối thành công tới MongoDB Atlas Cloud Database!");
    await initCloudSeedData();
    await syncOfficerRolesMigration();
  } catch (err) {
    console.error("[MongoDB] Lỗi kết nối MongoDB:", err);
  }
}

// Nạp dữ liệu seed ban đầu lên MongoDB nếu database trống
async function initCloudSeedData() {
  try {
    if (!kpiDb) return;
    const configCol = kpiDb.collection('officers_config');
    const count = await configCol.countDocuments();
    if (count === 0) {
      const gzPath = path.join(BASE_DIR, 'seed_data.json.gz');
      if (fs.existsSync(gzPath)) {
        console.log('[SEED] Đang nạp dữ liệu chuẩn ban đầu lên MongoDB...');
        const buf = fs.readFileSync(gzPath);
        const raw = zlib.gunzipSync(buf);
        const seed = JSON.parse(raw.toString('utf8'));

        if (seed.officers_config) {
          for (const [id, cfg] of Object.entries(seed.officers_config)) {
            await configCol.updateOne({ id }, { $set: cfg }, { upsert: true });
          }
        }
        if (seed.auth_passwords) {
          const authCol = kpiDb.collection('auth_passwords');
          for (const [id, auth] of Object.entries(seed.auth_passwords)) {
            await authCol.updateOne({ officerId: id }, { $set: auth }, { upsert: true });
          }
        }
        if (seed.sessions) {
          const sessionsCol = kpiDb.collection('sessions');
          for (const [fname, sessData] of Object.entries(seed.sessions)) {
            await sessionsCol.updateOne({ filename: fname }, { $set: { data: sessData } }, { upsert: true });
          }
        }
        console.log('[SEED] Đã đồng bộ dữ liệu mẫu lên MongoDB thành công!');
      }
    }
  } catch (e) {
    console.error('[SEED] Lỗi nạp seed data lên cloud:', e);
  }
}

// Chuẩn hóa và chuyển giao chức danh Thủ kho tiền trên MongoDB Atlas
// Bảo toàn 100% dữ liệu, điểm số, mật khẩu và phiên làm việc
async function syncOfficerRolesMigration() {
  try {
    if (!kpiDb) return;
    const configCol = kpiDb.collection('officers_config');
    const sessionsCol = kpiDb.collection('sessions');

    const qnTrangTitle = "Giao dịch viên - Thủ kho tiền";
    const qnTrangSpecialty = "Thủ kho tiền, tổng hợp các báo cáo liên quan đến công tác kho quỹ; Kế toán hoàn thuế do Thuế tỉnh gửi; TK chuyên thu BHXH (TK 3743); Báo cáo xử phạt VPHC lĩnh vực Kế toán.";

    const qnThuyTitle = "Giao dịch viên";
    const qnThuySpecialty = "Hành chính, văn thư, lưu trữ của Phòng; Kế toán Liên kho bạc; Báo cáo công tác cải cách hành chính, TTHC (lĩnh vực kế toán); In, lưu trữ Bảng thanh toán tự động điện, nước, viễn thông.";

    // 1. Cập nhật bảng thông tin cán bộ (officers_config)
    await configCol.updateOne(
      { id: 'qn_trang' },
      { $set: { title: qnTrangTitle, specialty: qnTrangSpecialty } }
    );
    await configCol.updateOne(
      { id: 'qn_thuy_le' },
      { $set: { title: qnThuyTitle, specialty: qnThuySpecialty } }
    );

    // 2. Cập nhật chức danh trong các phiên làm việc của qn_trang mà không thay đổi điểm số/kết quả
    const trangSessions = await sessionsCol.find({ filename: { $regex: /^qn_trang/i } }).toArray();
    for (const s of trangSessions) {
      if (s.data && s.data.officer) {
        if (s.data.officer.title !== qnTrangTitle || s.data.officer.specialty !== qnTrangSpecialty) {
          await sessionsCol.updateOne(
            { _id: s._id },
            { $set: { "data.officer.title": qnTrangTitle, "data.officer.specialty": qnTrangSpecialty } }
          );
        }
      }
    }

    // 3. Cập nhật chức danh trong các phiên làm việc của qn_thuy_le mà không thay đổi điểm số/kết quả
    const thuySessions = await sessionsCol.find({ filename: { $regex: /^qn_thuy_le/i } }).toArray();
    for (const s of thuySessions) {
      if (s.data && s.data.officer) {
        if (s.data.officer.title !== qnThuyTitle || s.data.officer.specialty !== qnThuySpecialty) {
          await sessionsCol.updateOne(
            { _id: s._id },
            { $set: { "data.officer.title": qnThuyTitle, "data.officer.specialty": qnThuySpecialty } }
          );
        }
      }
    }

    console.log("[MIGRATION] Đã hoàn tất đồng bộ chức danh: Nguyễn Thị Thu Trang (Thủ kho tiền) và Võ Thị Lệ Thuỷ (GDV) trên Cloud!");
  } catch (err) {
    console.error("[MIGRATION] Lỗi đồng bộ chức danh MongoDB:", err);
  }
}

connectMongo();

// ============================================================================
// 🛡️ TỰ ĐỘNG SAO LƯU DỰ PHÒNG TOÀN HỆ THỐNG ĐỊNH KỲ (DAILY AUTO-BACKUP)
// ============================================================================
function scheduleDailyAutoBackup() {
  if (process.env.AUTO_BACKUP_ENABLED === 'false') return;

  const BACKUP_DIR = path.join(BASE_DIR, 'backups');
  if (!fs.existsSync(BACKUP_DIR)) {
    try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
  }

  async function performBackup() {
    try {
      if (!kpiDb) return;
      console.log('[AUTO-BACKUP] Đang thực hiện sao lưu an toàn toàn bộ hệ thống...');
      const sessionDocs = await kpiDb.collection('sessions').find({}).toArray();
      const configDocs = await kpiDb.collection('officers_config').find({}).toArray();
      const authDocs = await kpiDb.collection('auth_passwords').find({}).toArray();

      const backupObj = {
        timestamp: new Date().toISOString(),
        backupType: 'DAILY_AUTO_SNAPSHOT',
        author: AUTHOR_INFO.author,
        sessions: {},
        officers_config: {},
        auth_passwords: {}
      };
      sessionDocs.forEach(d => { if (d.filename) backupObj.sessions[d.filename] = d.data; });
      configDocs.forEach(d => { const id = d.id || d._id; backupObj.officers_config[id] = d; });
      authDocs.forEach(d => { if (d.officerId) backupObj.auth_passwords[d.officerId] = d; });

      const rawJson = Buffer.from(JSON.stringify(backupObj, null, 2), 'utf8');
      const gzipped = zlib.gzipSync(rawJson, { level: 9 });
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}h`;
      const backupPath = path.join(BACKUP_DIR, `KPI_AutoBackup_${dateStr}.json.gz`);
      fs.writeFileSync(backupPath, gzipped);
      console.log(`[AUTO-BACKUP] Đã tạo bản sao lưu thành công tại: ${backupPath} (${Math.round(gzipped.length/1024)} KB)`);

      // Giữ lại 30 bản sao lưu gần nhất
      const allFiles = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('KPI_AutoBackup_') && f.endsWith('.json.gz'))
        .sort();
      if (allFiles.length > 30) {
        const toDelete = allFiles.slice(0, allFiles.length - 30);
        toDelete.forEach(f => {
          try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch(e) {}
        });
      }
    } catch (e) {
      console.error('[AUTO-BACKUP] Lỗi thực hiện sao lưu tự động:', e.message);
    }
  }

  // Chạy lần đầu sau khi khởi động 2 phút, sau đó lặp lại mỗi 12 giờ
  setTimeout(performBackup, 2 * 60 * 1000);
  setInterval(performBackup, 12 * 60 * 60 * 1000);
}

scheduleDailyAutoBackup();

// Lấy IP mạng LAN

// ============================================================================
// ⚡ BỘ ĐỆM BỘ NHỚ RAM TỐC ĐỘ CAO (HIGH-SPEED RAM CACHING)
// ============================================================================
let officersConfigCache = null;
let officersConfigCacheTime = 0;

let summaryCache = {};
function invalidateSummaryCache() {
  summaryCache = {};
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// Đọc danh sách cán bộ từ MongoDB hoặc file JSON dự phòng
async function getOfficersConfig() {
  if (officersConfigCache && (Date.now() - officersConfigCacheTime < 10 * 60 * 1000)) {
    return officersConfigCache;
  }
  const qnTrangTitle = "Giao dịch viên - Thủ kho tiền";
  const qnTrangSpecialty = "Thủ kho tiền, tổng hợp các báo cáo liên quan đến công tác kho quỹ; Kế toán hoàn thuế do Thuế tỉnh gửi; TK chuyên thu BHXH (TK 3743); Báo cáo xử phạt VPHC lĩnh vực Kế toán.";
  const qnThuyTitle = "Giao dịch viên";
  const qnThuySpecialty = "Hành chính, văn thư, lưu trữ của Phòng; Kế toán Liên kho bạc; Báo cáo công tác cải cách hành chính, TTHC (lĩnh vực kế toán); In, lưu trữ Bảng thanh toán tự động điện, nước, viễn thông.";

  if (kpiDb) {
    try {
      const docs = await kpiDb.collection('officers_config').find({}).toArray();
      if (docs && docs.length > 0) {
        const cfg = {};
        docs.forEach(d => {
          const key = d.id || d._id;
          cfg[key] = d;
          delete cfg[key]._id;
        });
        if (cfg.qn_trang) {
          cfg.qn_trang.title = qnTrangTitle;
          cfg.qn_trang.specialty = qnTrangSpecialty;
        }
        if (cfg.qn_thuy_le) {
          cfg.qn_thuy_le.title = qnThuyTitle;
          cfg.qn_thuy_le.specialty = qnThuySpecialty;
        }
        officersConfigCache = cfg;
        officersConfigCacheTime = Date.now();
        return cfg;
      }
    } catch (e) {
      console.error("Lỗi đọc officers từ MongoDB:", e);
    }
  }
  const fallbackFile = path.join(BASE_DIR, 'kpi_data', 'officers_config.json');
  try {
    if (fs.existsSync(fallbackFile)) {
      const cfg = JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
      if (cfg.qn_trang) {
        cfg.qn_trang.title = qnTrangTitle;
        cfg.qn_trang.specialty = qnTrangSpecialty;
      }
      if (cfg.qn_thuy_le) {
        cfg.qn_thuy_le.title = qnThuyTitle;
        cfg.qn_thuy_le.specialty = qnThuySpecialty;
      }
      return cfg;
    }
  } catch (err) {}
  return {};
}

function normalizeQuarter(qStr) {
  if (!qStr) return 'QuyIII';
  const s = String(qStr).toLowerCase().replace(/\s+/g, '');
  if (s.includes('iv') || s.includes('4')) return 'QuyIV';
  if (s.includes('iii') || s.includes('3')) return 'QuyIII';
  if (s.includes('ii') || s.includes('2')) return 'QuyII';
  if (s.includes('i') || s.includes('1')) return 'QuyI';
  return 'QuyIII';
}

function getSessionFilename(officerId, quarter, year) {
  const safeOfficer = (officerId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeQ = normalizeQuarter(quarter);
  const safeY = String(year || 2026).replace(/[^0-9]/g, '');
  return `${safeOfficer}_${safeQ}_${safeY}.json`;
}

// HTML Cache RAM & Gzip
let cachedHtml = {
  rawBuffer: null,
  gzipBuffer: null,
  etag: null,
  mtimeMs: 0
};

function refreshHtmlCache() {
  try {
    if (fs.existsSync(HTML_FILE)) {
      const stat = fs.statSync(HTML_FILE);
      if (stat.mtimeMs !== cachedHtml.mtimeMs || !cachedHtml.rawBuffer) {
        const raw = fs.readFileSync(HTML_FILE);
        const gzipped = zlib.gzipSync(raw, { level: 9 });
        const etag = '"' + crypto.createHash('md5').update(raw).digest('hex') + '"';
        cachedHtml = {
          rawBuffer: raw,
          gzipBuffer: gzipped,
          etag: etag,
          mtimeMs: stat.mtimeMs
        };
      }
    }
  } catch (err) {}
}

refreshHtmlCache();
try {
  fs.watch(HTML_FILE, () => { setTimeout(refreshHtmlCache, 300); });
} catch (e) {}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

async function getAuthPasswords() {
  if (kpiDb) {
    try {
      const docs = await kpiDb.collection('auth_passwords').find({}).toArray();
      if (docs && docs.length > 0) {
        const map = {};
        docs.forEach(d => {
          map[d.officerId] = { hash: d.hash, createdAt: d.createdAt, updatedAt: d.updatedAt };
        });
        return map;
      }
    } catch (e) {}
  }
  const fallbackFile = path.join(BASE_DIR, 'kpi_data', 'auth_passwords.json');
  try {
    if (fs.existsSync(fallbackFile)) {
      return JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
    }
  } catch (err) {}
  return {};
}

async function saveAuthPasswords(data) {
  if (kpiDb) {
    try {
      const col = kpiDb.collection('auth_passwords');
      for (const [id, item] of Object.entries(data)) {
        await col.updateOne({ officerId: id }, { $set: { officerId: id, ...item } }, { upsert: true });
      }
      return true;
    } catch (e) {}
  }
  return false;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password).trim()).digest('hex');
}

function calculateMonthPctFromRows(monthObj, role) {
  if (!monthObj) return 0;
  if (monthObj.completionPercent !== undefined && Number(monthObj.completionPercent) > 0) {
    return Number(monthObj.completionPercent);
  }
  if (!monthObj.rows || !Array.isArray(monthObj.rows)) return 0;

  const mult = role === 'TP' ? 1.2 : (role === 'PTP' ? 1.1 : 1.0);
  let totalAllocated = 0;
  let totalDone = 0;
  let totalClDiem = 0;
  let totalTdDiem = 0;
  let colU = 100, colV = 100, colW = 100;
  let hasActiveTask = false;

  monthObj.rows.forEach(r => {
    if (r.isTask && r.co_thuchien === "Có") {
      hasActiveTask = true;
      const diem_tc = Number(r.diem_tc) || 0;
      const soluong_tt = Number(r.soluong_tt) || 0;
      const diem_thang_chua_hs = soluong_tt * diem_tc;
      const diem_thang_da_hs = Math.round((diem_thang_chua_hs * mult) * 10) / 10;
      const hoanthanh = diem_thang_da_hs;
      const cl_loi = parseInt(r.cl_loi) || 0;
      const cl_penalty = Math.max(0, 100 - (cl_loi * 25));
      const cl_diem = Math.round(((hoanthanh * cl_penalty) / 100) * 10) / 10;
      const td_cham = parseInt(r.td_cham) || 0;
      const td_penalty = Math.max(0, 100 - (td_cham * 25));
      const td_diem = Math.round(((hoanthanh * td_penalty) / 100) * 10) / 10;

      totalAllocated += diem_thang_da_hs;
      totalDone += hoanthanh;
      totalClDiem += cl_diem;
      totalTdDiem += td_diem;

      if (r.col_u) colU = Number(r.col_u) || 100;
      if (r.col_v) colV = Number(r.col_v) || 100;
      if (r.col_w) colW = Number(r.col_w) || 100;
    }
  });

  if (!hasActiveTask || totalAllocated === 0) return 0;

  const quantityPct = (totalDone / totalAllocated * 100);
  const qualityPct = (totalClDiem / totalAllocated * 100);
  const progressPct = (totalTdDiem / totalAllocated * 100);

  const isLeader = (role === "TP" || role === "PTP");
  let finalMonthPct = 0;
  if (!isLeader) {
    finalMonthPct = (quantityPct * 0.4) + (qualityPct * 0.3) + (progressPct * 0.3);
  } else {
    finalMonthPct = (quantityPct * 0.3) + (qualityPct * 0.2) + (progressPct * 0.2) +
                    (colU * 0.1) + (colV * 0.1) + (colW * 0.1);
  }
  return Math.round(finalMonthPct * 10) / 10;
}

function createDefaultSession(officerId, quarter, year, offConfig) {
  const off = offConfig || {
    id: officerId,
    name: officerId,
    role: "KTV",
    group: "Giao dịch viên",
    title: "Giao dịch viên",
    specialty: "",
    isLeader: false,
    approverTitle: "TRƯỞNG PHÒNG",
    approverName: "Hoàng Anh Sơn"
  };

  const isTP = (off.role === 'TP');
  const defaultQuarterPlan = (off.defaultPlan && off.defaultPlan.length > 0)
    ? off.defaultPlan.map((p, idx) => ({
        id: "P" + (idx + 1),
        name: p.name,
        type: p.type || "AII_REGULAR",
        deadline: p.deadline || "Hằng ngày",
        isNQ57: !!p.isNQ57,
        isKey: !!p.isKey
      }))
    : [];

  return {
    officer: {
      name: off.name,
      role: off.role,
      officerId: off.id,
      quarter: quarter || "Quý III",
      year: Number(year) || 2026,
      specialty: off.specialty || "",
      leaderTitle: off.approverTitle || (isTP ? "PHÓ GIÁM ĐỐC" : "TRƯỞNG PHÒNG"),
      leaderName: off.approverName || (isTP ? "Trịnh Khắc Chính" : "Hoàng Anh Sơn"),
      managedUnits: off.managedUnits || []
    },
    quarterPlan: defaultQuarterPlan,
    unitCompletionPercent: 100,
    generalCriteria: {
      c1: 5.0, c2: 5.0,
      c3: 2.5, c4: 2.5, c5: 2.5, c6: 2.5,
      c7: 2.5, c8: 2.5, c9: 2.5, c10: 2.5
    },
    selfRatingNote: "",
    leaderRatingProposal: "",
    status: "draft",
    lastSaved: new Date().toISOString()
  };
}

// Tạo HTTP Server
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  // API 0: License
  if (pathname === '/api/license' && req.method === 'GET') {
    const isAuthorized = isAuthorAuthorizedMachine();
    return sendJson(res, 200, {
      success: true,
      author: AUTHOR_INFO.author,
      title: AUTHOR_INFO.title,
      organization: AUTHOR_INFO.organization,
      copyright: AUTHOR_INFO.copyright,
      legalBasis: AUTHOR_INFO.legalBasis,
      authorizedDevice: AUTHOR_INFO.authorizedHostname,
      currentDevice: os.hostname(),
      isAuthorizedDevice: isAuthorized,
      canEditApp: isAuthorized,
      mode: isAuthorized ? "AUTHOR_ADMIN_MODE" : "PROTECTED_USER_MODE"
    });
  }

  // API Auth Status
  if (pathname === '/api/auth/status' && req.method === 'GET') {
    const officerId = searchParams.get('officerId');
    const authData = await getAuthPasswords();
    if (!officerId) {
      const statusMap = {};
      for (const [id, item] of Object.entries(authData)) {
        statusMap[id] = !!(item && item.hash);
      }
      return sendJson(res, 200, { success: true, statusMap });
    }
    const hasPassword = !!(authData[officerId] && authData[officerId].hash);
    return sendJson(res, 200, { success: true, officerId, hasPassword });
  }

  // API Set Password
  if (pathname === '/api/auth/set-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { officerId, password } = payload;
        if (!officerId || !password || String(password).trim().length < 4) {
          return sendJson(res, 400, { success: false, error: "Mật khẩu phải có ít nhất 4 ký tự" });
        }
        const authData = await getAuthPasswords();
        authData[officerId] = {
          hash: hashPassword(password),
          createdAt: authData[officerId] ? authData[officerId].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await saveAuthPasswords(authData);
        return sendJson(res, 200, { success: true, message: "Đã thiết lập mật khẩu thành công" });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ" });
      }
    });
    return;
  }

  // API Verify Password
  if (pathname === '/api/auth/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { officerId, password } = payload;
        const authData = await getAuthPasswords();
        const userAuth = authData[officerId];
        if (!userAuth || !userAuth.hash) {
          return sendJson(res, 200, { success: false, error: "Tài khoản chưa thiết lập mật khẩu", notSet: true });
        }
        if (hashPassword(password) === userAuth.hash) {
          return sendJson(res, 200, { success: true, message: "Xác thực thành công" });
        } else {
          return sendJson(res, 200, { success: false, error: "Mật khẩu không chính xác" });
        }
      } catch (err) {
        return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ" });
      }
    });
    return;
  }

  // API Change Password
  if (pathname === '/api/auth/change-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { officerId, oldPassword, newPassword } = payload;
        if (!officerId || !newPassword || String(newPassword).trim().length < 4) {
          return sendJson(res, 400, { success: false, error: "Mật khẩu mới phải có ít nhất 4 ký tự" });
        }
        const authData = await getAuthPasswords();
        const userAuth = authData[officerId];
        if (userAuth && userAuth.hash) {
          if (hashPassword(oldPassword || '') !== userAuth.hash && payload.adminOfficerId !== 'hoang') {
            return sendJson(res, 400, { success: false, error: "Mật khẩu hiện tại không chính xác" });
          }
        }
        authData[officerId] = {
          hash: hashPassword(newPassword),
          createdAt: userAuth ? userAuth.createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await saveAuthPasswords(authData);
        return sendJson(res, 200, { success: true, message: "Đã đổi mật khẩu thành công" });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ" });
      }
    });
    return;
  }

  // API Admin Set Password
  if (pathname === '/api/auth/admin-set-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { adminOfficerId, targetOfficerId, newPassword } = payload;
        const isAuthorized = isAuthorAuthorizedMachine() || adminOfficerId === 'hoang';
        if (!isAuthorized) {
          return sendJson(res, 403, { success: false, error: "Quyền quản trị bị từ chối!" });
        }
        const authData = await getAuthPasswords();
        authData[targetOfficerId] = {
          hash: hashPassword(newPassword),
          createdAt: authData[targetOfficerId] ? authData[targetOfficerId].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await saveAuthPasswords(authData);
        return sendJson(res, 200, { success: true, message: `Đã đặt mật khẩu cho cán bộ: ${targetOfficerId}` });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ" });
      }
    });
    return;
  }

  // API Status
  if (pathname === '/api/status' && req.method === 'GET') {
    let sessionsCount = 0;
    if (kpiDb) {
      sessionsCount = await kpiDb.collection('sessions').countDocuments();
    }
    return sendJson(res, 200, {
      status: "ok",
      serverTime: new Date().toISOString(),
      hostIp: getLanIp(),
      port: PORT,
      sessionsCount,
      version: "V18_MongoDB_Cloud"
    });
  }

  // API Officers
  if (pathname === '/api/officers' && req.method === 'GET') {
    const cfg = await getOfficersConfig();
    return sendJson(res, 200, {
      success: true,
      officers: cfg,
      officersList: Object.values(cfg)
    });
  }

  // API Get Session
  if (pathname === '/api/session' && req.method === 'GET') {
    const officerId = searchParams.get('officerId');
    const quarter = searchParams.get('quarter');
    const year = searchParams.get('year');

    if (!officerId) {
      return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
    }

    const filename = getSessionFilename(officerId, quarter, year);

    if (kpiDb) {
      try {
        const doc = await kpiDb.collection('sessions').findOne({ filename });
        if (doc && doc.data) {
          return sendJson(res, 200, { success: true, isNew: false, filename, data: doc.data });
        }
      } catch (e) {}
    }

    const cfg = await getOfficersConfig();
    const defaultData = createDefaultSession(officerId, quarter, year, cfg[officerId]);
    return sendJson(res, 200, { success: true, isNew: true, filename, data: defaultData });
  }

  // API Save Session (CÓ LƯU TRỮ LỊCH SỬ PHIÊN BẢN - SNAPSHOT VERSIONING)
  if (pathname === '/api/session' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const officerId = payload.officerId || (payload.officer && payload.officer.officerId) || (payload.state && payload.state.officer && payload.state.officer.officerId);
        const quarter = payload.quarter || (payload.officer && payload.officer.quarter) || (payload.state && payload.state.officer && payload.state.officer.quarter);
        const year = payload.year || (payload.officer && payload.officer.year) || (payload.state && payload.state.officer && payload.state.officer.year);
        const state = payload.state || payload;

        if (!officerId) {
          return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        state.lastSaved = new Date().toISOString();

        if (kpiDb) {
          const sessionsCol = kpiDb.collection('sessions');
          const existing = await sessionsCol.findOne({ filename });
          if (existing && existing.data) {
            const currentStatus = existing.data.status;
            const senderId = payload.senderId || officerId;
            const isLeaderOrAdmin = (senderId === 'son' || senderId === 'hoang' || senderId === 'tuan' || senderId === 'anh');

            // 🔒 KIỂM TRA KHÓA DỮ LIỆU: Nếu đã nộp hoặc đã duyệt, cán bộ thường không được sửa
            if ((currentStatus === 'da_nop' || currentStatus === 'da_duyet') && !isLeaderOrAdmin && payload.action !== 'submit') {
              return sendJson(res, 403, {
                success: false,
                error: "BÁO CÁO ĐÃ NỘP HOẶC ĐÃ ĐƯỢC PHÊ DUYỆT! Dữ liệu đã bị khóa và không thể tự ý sửa đổi.",
                isLocked: true,
                status: currentStatus
              });
            }

            if (existing.data.leaderRatingProposal && !state.leaderRatingProposal) {
              state.leaderRatingProposal = existing.data.leaderRatingProposal;
            }
            if (existing.data.leaderRatingNote && !state.leaderRatingNote) {
              state.leaderRatingNote = existing.data.leaderRatingNote;
            }
            if (existing.data.status && !state.status) {
              state.status = existing.data.status;
            }
          }
          await sessionsCol.updateOne({ filename }, { $set: { filename, data: state, updatedAt: state.lastSaved } }, { upsert: true });
          invalidateSummaryCache();

          // --- 🛡️ BẢO VỆ DỮ LIỆU: CẤT BẢN SAO LỊCH SỬ (SNAPSHOT) ---
          try {
            const snapshotsCol = kpiDb.collection('session_snapshots');
            const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
            
            // Tính điểm tóm tắt để hiển thị trong lịch sử
            let snapshotSummary = "";
            if (state.months && Array.isArray(state.months)) {
              let mPct = state.months.map(m => m.completionPercent || 0).join(' - ');
              snapshotSummary = `Tháng: [${mPct}]% - TT: ${state.status || 'da_luu'}`;
            }

            await snapshotsCol.insertOne({
              filename,
              officerId,
              quarter: normalizeQuarter(quarter),
              year: Number(year) || 2026,
              savedAt: state.lastSaved,
              clientIp,
              summary: snapshotSummary,
              data: state
            });

            // Giới hạn số lượng snapshot tối đa (mặc định 15) cho mỗi phiên để bảo vệ dung lượng
            const maxSnapshots = parseInt(process.env.MAX_SNAPSHOTS_PER_OFFICER, 10) || 15;
            const snapCount = await snapshotsCol.countDocuments({ filename });
            if (snapCount > maxSnapshots) {
              const overflow = await snapshotsCol.find({ filename })
                .sort({ savedAt: 1 })
                .limit(snapCount - maxSnapshots)
                .project({ _id: 1 })
                .toArray();
              if (overflow.length > 0) {
                await snapshotsCol.deleteMany({ _id: { $in: overflow.map(d => d._id) } });
              }
            }
          } catch (snapErr) {
            console.error('[SNAPSHOT WARNING] Lỗi tạo bản sao lưu snapshot:', snapErr.message);
          }
        }

        return sendJson(res, 200, {
          success: true,
          message: `Đã lưu phiên làm việc lên Cloud cho ${officerId}`,
          filename,
          savedAt: state.lastSaved
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: "Lỗi ghi dữ liệu: " + err.message });
      }
    });
    return;
  }

  // --- API NỘP BÁO CÁO KPI (SUBMIT KPI) ---
  if (pathname === '/api/session/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { officerId, quarter, year, state } = payload;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        const filename = getSessionFilename(officerId, quarter, year);
        const submitTime = new Date().toISOString();
        let targetState = state;

        if (kpiDb) {
          const sessionsCol = kpiDb.collection('sessions');
          if (!targetState) {
            const existing = await sessionsCol.findOne({ filename });
            targetState = existing && existing.data;
          }
          if (!targetState) return sendJson(res, 404, { success: false, error: "Không tìm thấy dữ liệu phiên" });

          targetState.status = "da_nop";
          targetState.isSubmitted = true;
          targetState.submittedAt = submitTime;
          targetState.lastSaved = submitTime;

          await sessionsCol.updateOne({ filename }, { $set: { filename, data: targetState, updatedAt: submitTime } }, { upsert: true });
          invalidateSummaryCache();

          // Lưu snapshot đánh dấu sự kiện nộp bài
          try {
            await kpiDb.collection('session_snapshots').insertOne({
              filename,
              officerId,
              quarter: normalizeQuarter(quarter),
              year: Number(year) || 2026,
              savedAt: submitTime,
              clientIp: req.socket.remoteAddress || 'client',
              summary: '📤 [NỘP KPI QUÝ] Chốt số liệu cá nhân',
              data: targetState
            });
          } catch (e) {}
        }

        return sendJson(res, 200, {
          success: true,
          message: `Đã nộp thành công KPI Quý cho cán bộ ${officerId}. Dữ liệu đã được khóa an toàn!`,
          submittedAt: submitTime
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- API LÃNH ĐẠO PHÊ DUYỆT KPI (APPROVE KPI) ---
  if (pathname === '/api/session/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { officerId, quarter, year, leaderOfficerId, leaderRatingProposal, leaderRatingNote } = payload;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        // PHÂN QUYỀN CHẶT CHẼ: Chỉ có Trưởng phòng (Sơn) và Phó Trưởng phòng (Hoàng) mới có quyền duyệt
        if (leaderOfficerId !== 'son' && leaderOfficerId !== 'hoang') {
          return sendJson(res, 403, { success: false, error: "Chỉ có Trưởng phòng (đ/c Hoàng Anh Sơn) và Phó Trưởng phòng (đ/c Trần Quốc Hoàng) mới có thẩm quyền phê duyệt kết quả KPI." });
        }
        if (officerId === leaderOfficerId) {
          return sendJson(res, 400, { success: false, error: "Lãnh đạo không được tự phê duyệt hồ sơ cá nhân của mình." });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        const approveTime = new Date().toISOString();

        if (kpiDb) {
          const sessionsCol = kpiDb.collection('sessions');
          const doc = await sessionsCol.findOne({ filename });
          if (!doc || !doc.data) return sendJson(res, 404, { success: false, error: "Không tìm thấy hồ sơ cán bộ" });

          doc.data.status = "da_duyet";
          doc.data.isApproved = true;
          doc.data.approvedAt = approveTime;
          doc.data.approvedBy = leaderOfficerId || "Lãnh đạo phòng";
          if (leaderRatingProposal) doc.data.leaderRatingProposal = leaderRatingProposal;
          if (leaderRatingNote !== undefined) doc.data.leaderRatingNote = leaderRatingNote;
          doc.data.lastSaved = approveTime;

          await sessionsCol.updateOne({ filename }, { $set: { data: doc.data, updatedAt: approveTime } });
          invalidateSummaryCache();

          // Lưu snapshot đánh dấu phê duyệt
          try {
            await kpiDb.collection('session_snapshots').insertOne({
              filename,
              officerId,
              quarter: normalizeQuarter(quarter),
              year: Number(year) || 2026,
              savedAt: approveTime,
              clientIp: req.socket.remoteAddress || 'leader',
              summary: `✅ [LÃNH ĐẠO DUYỆT] Xếp loại: ${leaderRatingProposal || doc.data.rating}`,
              data: doc.data
            });
          } catch (e) {}
        }

        return sendJson(res, 200, {
          success: true,
          message: `Đã phê duyệt chính thức kết quả KPI cho ${officerId}! Hồ sơ đã khóa vĩnh viễn.`,
          approvedAt: approveTime
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- API LÃNH ĐẠO TRẢ LẠI ĐỂ SỬA ĐỔI / GIẢI TRÌNH (REJECT & RETURN) ---
  if (pathname === '/api/session/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { officerId, quarter, year, leaderOfficerId, rejectReason } = payload;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        // PHÂN QUYỀN CHẶT CHẼ: Chỉ có Trưởng phòng (Sơn) và Phó Trưởng phòng (Hoàng) mới có quyền trả lại
        if (leaderOfficerId !== 'son' && leaderOfficerId !== 'hoang') {
          return sendJson(res, 403, { success: false, error: "Chỉ có Trưởng phòng (đ/c Hoàng Anh Sơn) và Phó Trưởng phòng (đ/c Trần Quốc Hoàng) mới có thẩm quyền trả lại hồ sơ KPI." });
        }
        if (officerId === leaderOfficerId) {
          return sendJson(res, 400, { success: false, error: "Lãnh đạo không được tự trả lại hồ sơ cá nhân của mình." });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        const rejectTime = new Date().toISOString();

        if (kpiDb) {
          const sessionsCol = kpiDb.collection('sessions');
          const doc = await sessionsCol.findOne({ filename });
          if (!doc || !doc.data) return sendJson(res, 404, { success: false, error: "Không tìm thấy hồ sơ cán bộ" });

          doc.data.status = "tra_lai";
          doc.data.isSubmitted = false;
          doc.data.isApproved = false;
          doc.data.rejectedAt = rejectTime;
          doc.data.rejectedBy = leaderOfficerId || "Lãnh đạo phòng";
          doc.data.rejectReason = rejectReason || "Yêu cầu rà soát, giải trình lại số liệu";
          doc.data.lastSaved = rejectTime;

          await sessionsCol.updateOne({ filename }, { $set: { data: doc.data, updatedAt: rejectTime } });
          invalidateSummaryCache();

          // Lưu snapshot đánh dấu trả lại
          try {
            await kpiDb.collection('session_snapshots').insertOne({
              filename,
              officerId,
              quarter: normalizeQuarter(quarter),
              year: Number(year) || 2026,
              savedAt: rejectTime,
              clientIp: req.socket.remoteAddress || 'leader',
              summary: `↩️ [TRẢ LẠI SỬA] Lý do: ${rejectReason || 'Yêu cầu rà soát'}`,
              data: doc.data
            });
          } catch (e) {}
        }

        return sendJson(res, 200, {
          success: true,
          message: `Đã trả lại hồ sơ cho cán bộ ${officerId}. Hồ sơ đã được mở khóa để cán bộ chỉnh sửa!`,
          rejectedAt: rejectTime
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- API LẤY LỊCH SỬ CÁC BẢN SAO LƯU (SNAPSHOT HISTORY) ---
  if (pathname === '/api/session/history' && req.method === 'GET') {
    const officerId = searchParams.get('officerId');
    const quarter = searchParams.get('quarter');
    const year = searchParams.get('year');

    if (!officerId) {
      return sendJson(res, 400, { success: false, error: "Thiếu officerId" });
    }

    const filename = getSessionFilename(officerId, quarter, year);
    if (!kpiDb) {
      return sendJson(res, 200, { success: true, history: [] });
    }

    try {
      const snapshotsCol = kpiDb.collection('session_snapshots');
      const list = await snapshotsCol.find({ filename })
        .sort({ savedAt: -1 })
        .limit(20)
        .project({ _id: 1, savedAt: 1, clientIp: 1, summary: 1, "data.lastSaved": 1, "data.officer.name": 1 })
        .toArray();

      const history = list.map(item => ({
        id: item._id.toString(),
        savedAt: item.savedAt,
        clientIp: item.clientIp || 'client',
        summary: item.summary || ''
      }));

      return sendJson(res, 200, { success: true, filename, history });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: "Lỗi đọc lịch sử: " + err.message });
    }
  }

  // --- API KHÔI PHỤC DỮ LIỆU TỪ BẢN SAO LƯU (ROLLBACK TO SNAPSHOT) ---
  if (pathname === '/api/session/rollback' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { snapshotId, officerId, quarter, year } = payload;

        if (!snapshotId || !kpiDb) {
          return sendJson(res, 400, { success: false, error: "Thiếu snapshotId hoặc DB chưa kết nối" });
        }

        const snapshotsCol = kpiDb.collection('session_snapshots');
        const snapDoc = await snapshotsCol.findOne({ _id: new ObjectId(snapshotId) });

        if (!snapDoc || !snapDoc.data) {
          return sendJson(res, 404, { success: false, error: "Không tìm thấy bản ghi snapshot này!" });
        }

        const filename = getSessionFilename(officerId || snapDoc.officerId, quarter || snapDoc.quarter, year || snapDoc.year);
        const restoredData = snapDoc.data;
        restoredData.lastSaved = new Date().toISOString();
        restoredData._restoredFrom = snapDoc.savedAt;

        await kpiDb.collection('sessions').updateOne(
          { filename },
          { $set: { filename, data: restoredData, updatedAt: restoredData.lastSaved } },
          { upsert: true }
        );
        invalidateSummaryCache();

        console.log(`[ROLLBACK SUCCESS] Đã khôi phục thành công dữ liệu cho ${filename} từ snapshot lúc ${snapDoc.savedAt}`);

        return sendJson(res, 200, {
          success: true,
          message: `Đã khôi phục thành công dữ liệu từ bản sao lưu lúc ${snapDoc.savedAt}!`,
          filename,
          data: restoredData
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: "Lỗi khôi phục: " + err.message });
      }
    });
    return;
  }

  // API Leader Proposal
  if (pathname === '/api/leader-proposal' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { officerId, quarter, year, leaderRatingProposal, leaderRatingNote } = payload;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        const filename = getSessionFilename(officerId, quarter, year);
        if (kpiDb) {
          const col = kpiDb.collection('sessions');
          const doc = await col.findOne({ filename });
          if (doc && doc.data) {
            doc.data.leaderRatingProposal = leaderRatingProposal;
            if (leaderRatingNote !== undefined) doc.data.leaderRatingNote = leaderRatingNote;
            doc.data.lastSaved = new Date().toISOString();
            await col.updateOne({ filename }, { $set: { data: doc.data } });
            invalidateSummaryCache();
          }
        }
        return sendJson(res, 200, { success: true, message: "Đã lưu đánh giá của Lãnh đạo" });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- API Xuất toàn bộ dữ liệu ra tệp JSON trực tiếp ---
  if (pathname === '/api/backup/export-all' && req.method === 'GET') {
    const adminOfficerId = searchParams.get('adminOfficerId');
    const adminKey = req.headers['x-admin-key'] || searchParams.get('adminKey');
    const configuredKey = process.env.ADMIN_SECRET_KEY || 'kbxv_ktnn_admin_secret_2026_secure';
    const isAuthorized = isAuthorAuthorizedMachine() || (adminKey === configuredKey && adminOfficerId === 'hoang');
    if (!isAuthorized) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Thao tác xuất toàn bộ dữ liệu yêu cầu khóa Admin Key bảo vệ!" });
    }
    try {
      let exportData = {
        exportedAt: new Date().toISOString(),
        author: AUTHOR_INFO.author,
        officers_config: await getOfficersConfig(),
        auth_passwords: await getAuthPasswords(),
        sessions: {}
      };
      
      if (kpiDb) {
        const sessionDocs = await kpiDb.collection('sessions').find({}).toArray();
        sessionDocs.forEach(doc => {
          if (doc.filename && doc.data) {
            exportData.sessions[doc.filename] = doc.data;
          }
        });
      }

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="KPI_PhongKTNN_Backup_${new Date().toISOString().slice(0,10)}.json"`
      });
      return res.end(JSON.stringify(exportData));
    } catch(err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- API Nạp toàn bộ dữ liệu từ tệp cục bộ lên MongoDB Cloud (Import All) ---
  if (pathname === '/api/backup/import-all' && req.method === 'POST') {
    const adminOfficerId = searchParams.get('adminOfficerId');
    const adminKey = req.headers['x-admin-key'] || searchParams.get('adminKey');
    const configuredKey = process.env.ADMIN_SECRET_KEY || 'kbxv_ktnn_admin_secret_2026_secure';
    const isAuthorized = isAuthorAuthorizedMachine() || (adminKey === configuredKey && adminOfficerId === 'hoang');
    if (!isAuthorized) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Thao tác nạp dữ liệu bị từ chối do thiếu khóa Admin Key bảo vệ!" });
    }
    let chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        let jsonStr = '';
        try {
          jsonStr = zlib.gunzipSync(buffer).toString('utf8');
        } catch(e) {
          jsonStr = buffer.toString('utf8');
        }
        const importData = JSON.parse(jsonStr);
        if (!importData.sessions) {
          return sendJson(res, 400, { success: false, error: "Tệp dữ liệu không hợp lệ" });
        }

        let count = 0;
        if (kpiDb) {
          const sessionsCol = kpiDb.collection('sessions');
          for (const [fname, sess] of Object.entries(importData.sessions)) {
            await sessionsCol.updateOne({ filename: fname }, { $set: { filename: fname, data: sess } }, { upsert: true });
            count++;
          }

          if (importData.officers_config) {
            const configCol = kpiDb.collection('officers_config');
            for (const [id, cfg] of Object.entries(importData.officers_config)) {
              await configCol.updateOne({ id }, { $set: cfg }, { upsert: true });
            }
          }

          if (importData.auth_passwords) {
            await saveAuthPasswords(importData.auth_passwords);
          }
          await syncOfficerRolesMigration();
        }

        console.log(`[IMPORT CLOUD] Đã nạp thành công ${count} phiên dữ liệu lên MongoDB từ file máy tính.`);
        sendJson(res, 200, { success: true, count, message: `Đã nạp thành công dữ liệu ${count} cán bộ lên hệ thống Cloud từ file máy tính!` });
      } catch(err) {
        sendJson(res, 500, { success: false, error: "Lỗi nạp dữ liệu: " + err.message });
      }
    });
    return;
  }

  // --- API Chuẩn hóa Chức danh trên Cloud (Thủ kho tiền: Thu Trang, GDV: Lệ Thủy) ---
  if (pathname === '/api/sync-roles' && (req.method === 'GET' || req.method === 'POST')) {
    await syncOfficerRolesMigration();
    return sendJson(res, 200, {
      success: true,
      message: "Đã chuẩn hóa và đồng bộ chính xác chức danh: Nguyễn Thị Thu Trang (GDV - Thủ kho tiền) và Võ Thị Lệ Thuỷ (GDV) trên MongoDB Cloud!"
    });
  }

  // API Summary Toàn phòng (CÓ BỘ ĐỆM RAM TỐC ĐỘ CAO - SUB-MILLISECOND CACHING)
  if (pathname === '/api/summary' && req.method === 'GET') {
    const quarter = searchParams.get('quarter') || "Quý III";
    const year = searchParams.get('year') || "2026";
    const cacheKey = `${quarter}_${year}`;
    const forceRefresh = (searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true');

    if (!forceRefresh && summaryCache[cacheKey] && (Date.now() - summaryCache[cacheKey].timestamp < 60000)) {
      return sendJson(res, 200, summaryCache[cacheKey].data);
    }

    const cfg = await getOfficersConfig();
    const officersList = Object.values(cfg);

    const summaryList = [];
    let submittedCount = 0;
    let excellentCount = 0;
    let goodCount = 0;
    let completedCount = 0;
    let notCompletedCount = 0;

    let allSessionsMap = {};
    if (kpiDb) {
      const docs = await kpiDb.collection('sessions').find({}, {
        projection: {
          filename: 1,
          "data.status": 1,
          "data.isSubmitted": 1,
          "data.submittedAt": 1,
          "data.approvedAt": 1,
          "data.approvedBy": 1,
          "data.rejectReason": 1,
          "data.lastSaved": 1,
          "data.months.completionPercent": 1,
          "data.months.rows": 1,
          "data.generalCriteria": 1,
          "data.proposedRating": 1,
          "data.selfRating": 1,
          "data.selfRatingProposal": 1,
          "data.leaderRatingProposal": 1,
          "data.leaderRatingNote": 1
        }
      }).toArray();
      docs.forEach(d => { allSessionsMap[d.filename] = d.data; });
    }

    for (const off of officersList) {
      const filename = getSessionFilename(off.id, quarter, year);
      const sess = allSessionsMap[filename];

      let item = {
        id: off.id,
        name: off.name,
        role: off.role,
        group: off.group,
        title: off.title,
        specialty: off.specialty || "",
        managedUnits: off.managedUnits || [],
        isLeader: off.isLeader,
        isKPIAggregator: !!off.isKPIAggregator,
        status: "chua_tao",
        m1Pct: 0, m2Pct: 0, m3Pct: 0, avgPct: 0,
        taskScore: 0, generalScore: 30, totalScore: 0,
        rating: "Chưa đánh giá",
        leaderRatingProposal: "",
        lastSaved: null
      };

      if (sess) {
        item.isSubmitted = !!(sess.isSubmitted || sess.status === 'da_nop' || sess.status === 'da_duyet');
        item.submittedAt = sess.submittedAt || null;
        item.approvedAt = sess.approvedAt || null;
        item.approvedBy = sess.approvedBy || null;
        item.rejectReason = sess.rejectReason || null;
        item.status = sess.status || (item.isSubmitted ? "da_nop" : "da_luu");
        item.lastSaved = sess.lastSaved || null;

        if (sess.months && Array.isArray(sess.months) && sess.months.length > 0) {
          let sumPct = 0;
          let mCount = 0;
          sess.months.forEach((m, idx) => {
            let pct = Number(m.completionPercent);
            if (isNaN(pct) || pct === 0) {
              pct = calculateMonthPctFromRows(m, off.role);
            }
            if (idx === 0) item.m1Pct = pct;
            if (idx === 1) item.m2Pct = pct;
            if (idx === 2) item.m3Pct = pct;
            if (pct > 0) {
              sumPct += pct;
              mCount++;
            }
          });
          item.avgPct = mCount > 0 ? Math.round((sumPct / sess.months.length) * 10) / 10 : 0;
        }

        if (sess.generalCriteria) {
          let gSum = 0;
          for (const k of Object.keys(sess.generalCriteria)) {
            gSum += Number(sess.generalCriteria[k] || 0);
          }
          item.generalScore = Math.min(30, Math.round(gSum * 10) / 10);
        }

        item.taskScore = Math.round((item.avgPct * 0.7) * 10) / 10;
        item.totalScore = Math.round((item.taskScore + item.generalScore) * 10) / 10;

        let calculatedRating = "Chưa đánh giá";
        if (item.totalScore >= 90 && item.avgPct >= 90) {
          calculatedRating = "Hoàn thành xuất sắc nhiệm vụ";
        } else if (item.totalScore >= 75 && item.avgPct >= 75) {
          calculatedRating = "Hoàn thành tốt nhiệm vụ";
        } else if (item.totalScore >= 50 && item.avgPct >= 50) {
          calculatedRating = "Hoàn thành nhiệm vụ";
        } else if (item.totalScore > 0) {
          calculatedRating = "Không hoàn thành nhiệm vụ";
        }

        const chosenSelfRating = sess.proposedRating || sess.selfRating || sess.selfRatingProposal;
        item.formulaRating = calculatedRating;
        item.proposedRating = chosenSelfRating || calculatedRating;
        item.rating = item.proposedRating;
        item.leaderRatingProposal = sess.leaderRatingProposal || item.rating;

        if (item.isSubmitted) submittedCount++;
        if (item.rating.includes("xuất sắc")) excellentCount++;
        else if (item.rating.includes("tốt")) goodCount++;
        else if (item.rating.includes("Không hoàn thành")) notCompletedCount++;
        else if (item.rating.includes("Hoàn thành")) completedCount++;
      }

      summaryList.push(item);
    }

    const totalOfficers = summaryList.length;
    const maxExcellentAllowed = Math.round(totalOfficers * 0.2); // Khống chế trần 20% (7/35 người)

    // 🏆 TỰ ĐỘNG XẾP HẠNG & PHÂN BỔ CHỈ TIÊU TOP 20% XUẤT SẮC
    const rankedOfficers = JSON.parse(JSON.stringify(summaryList));
    rankedOfficers.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.avgPct !== a.avgPct) return b.avgPct - a.avgPct;
      return a.name.localeCompare(b.name, 'vi');
    });

    let assignedExcellent = 0;
    rankedOfficers.forEach((off, idx) => {
      off.rank = idx + 1;
      const qualifiesForExcellent = (off.totalScore >= 90 && off.avgPct >= 90);
      if (qualifiesForExcellent && assignedExcellent < maxExcellentAllowed) {
        off.isTop20Excellent = true;
        off.recommendedRating = "Hoàn thành xuất sắc nhiệm vụ (Top 20%)";
        assignedExcellent++;
      } else if (qualifiesForExcellent) {
        off.isTop20Excellent = false;
        off.recommendedRating = "Hoàn thành tốt nhiệm vụ (Đã hết chỉ tiêu 20% Xuất sắc)";
      } else if (off.totalScore >= 75 && off.avgPct >= 75) {
        off.isTop20Excellent = false;
        off.recommendedRating = "Hoàn thành tốt nhiệm vụ";
      } else if (off.totalScore >= 50 && off.avgPct >= 50) {
        off.isTop20Excellent = false;
        off.recommendedRating = "Hoàn thành nhiệm vụ";
      } else if (off.totalScore > 0) {
        off.isTop20Excellent = false;
        off.recommendedRating = "Không hoàn thành nhiệm vụ";
      } else {
        off.isTop20Excellent = false;
        off.recommendedRating = "Chưa đánh giá";
      }
    });

    // Cập nhật lại rank và recommendedRating vào summaryList gốc
    const rankMap = {};
    rankedOfficers.forEach(r => { rankMap[r.id] = r; });
    summaryList.forEach(off => {
      const r = rankMap[off.id];
      if (r) {
        off.rank = r.rank;
        off.isTop20Excellent = r.isTop20Excellent;
        off.recommendedRating = r.recommendedRating;
      }
    });

    const responsePayload = {
      success: true,
      quarter,
      year,
      officers: summaryList,
      rankedOfficers,
      stats: {
        totalOfficers,
        submittedCount,
        excellentCount,
        maxExcellentAllowed,
        isExcellentExceeded: excellentCount > maxExcellentAllowed,
        goodCount,
        completedCount,
        notCompletedCount
      }
    };

    summaryCache[cacheKey] = {
      timestamp: Date.now(),
      data: responsePayload
    };

    return sendJson(res, 200, responsePayload);
  }

  // Serve Frontend HTML
  if (pathname === '/' || pathname === '/index.html' || pathname === '/app') {
    refreshHtmlCache();
    if (cachedHtml.rawBuffer) {
      if (req.headers['if-none-match'] === cachedHtml.etag) {
        res.writeHead(304, { 'ETag': cachedHtml.etag });
        return res.end();
      }
      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (acceptEncoding.includes('gzip')) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Content-Length': cachedHtml.gzipBuffer.length,
          'ETag': cachedHtml.etag,
          'Cache-Control': 'no-cache, must-revalidate',
          'Vary': 'Accept-Encoding'
        });
        return res.end(cachedHtml.gzipBuffer);
      } else {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': cachedHtml.rawBuffer.length,
          'ETag': cachedHtml.etag,
          'Cache-Control': 'no-cache, must-revalidate',
          'Vary': 'Accept-Encoding'
        });
        return res.end(cachedHtml.rawBuffer);
      }
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end("404 Not Found");
});

server.listen(PORT, HOST, () => {
  console.log("============================================================================");
  console.log(" KBNN KHU VUC XV - KHO MONGODB CLOUD ĐÃ SẴN SÀNG");
  console.log(` [+] Truy cập trực tuyến: http://localhost:${PORT}`);
  console.log("============================================================================");
});
