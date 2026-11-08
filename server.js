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
let MongoClient = null;
let ObjectId = null;
try {
  const mongoPkg = require('mongodb');
  MongoClient = mongoPkg.MongoClient;
  ObjectId = mongoPkg.ObjectId;
} catch (e) {
  // Khi chay offline hoac thieu node_modules, tu dong bo qua de su dung CSDL tep tin cuc bo
}

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
  if (process.env.AUTHOR_SERVER === 'true' || process.env.AUTHOR_SERVER === '1' || process.env.VERCEL === '1') return true;
  const currentHost = (os.hostname() || '').toLowerCase().trim();
  const currentUser = (os.userInfo ? (os.userInfo().username || '') : '').toLowerCase().trim();
  const isHostMatch = (currentHost === AUTHOR_INFO.authorizedHostname.toLowerCase());
  const isUserMatch = (currentUser === AUTHOR_INFO.authorizedUsername.toLowerCase());
  return isHostMatch || isUserMatch;
}

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const HTML_FILE = fs.existsSync(path.join(BASE_DIR, 'index.html'))
  ? path.join(BASE_DIR, 'index.html')
  : path.join(BASE_DIR, 'App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html');

// ============================================================================
// HỆ THỐNG CƠ SỞ DỮ LIỆU TẬP TIN CỤC BỘ (LOCAL FILE DATABASE SYSTEM)
// Cho phép chạy 100% Offline trên mạng nội bộ KBNN không cần Internet / MongoDB
// ============================================================================
const DATA_DIR = path.join(BASE_DIR, 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const SNAPSHOTS_DIR = path.join(DATA_DIR, 'snapshots');
const OFFICERS_FILE = path.join(DATA_DIR, 'officers_config.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth_passwords.json');

function ensureLocalDataDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });

    const hasSessions = fs.existsSync(SESSIONS_DIR) && fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')).length > 0;
    if (!hasSessions) {
      const gzPath = path.join(BASE_DIR, 'seed_data.json.gz');
      if (fs.existsSync(gzPath)) {
        try {
          const seed = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8'));
          if (!fs.existsSync(OFFICERS_FILE) && seed.officers_config) {
            fs.writeFileSync(OFFICERS_FILE, JSON.stringify(seed.officers_config, null, 2), 'utf8');
          }
          if (!fs.existsSync(AUTH_FILE) && seed.auth_passwords) {
            fs.writeFileSync(AUTH_FILE, JSON.stringify(seed.auth_passwords, null, 2), 'utf8');
          }
          if (seed.sessions) {
            for (const [fname, sData] of Object.entries(seed.sessions)) {
              const p = path.join(SESSIONS_DIR, fname);
              if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(sData, null, 2), 'utf8');
            }
          }
          console.log('[LOCAL CSDL] Đã tự động giải nén 53 hồ sơ KPI mẫu và danh bạ 35 cán bộ vào thư mục data/');
        } catch (e) {
          console.error('[LOCAL CSDL] Lỗi nạp seed_data cục bộ:', e.message);
        }
      }
    }
  } catch (err) {
    // Trong môi trường Serverless (Vercel) hệ thống file có thể là read-only, bỏ qua lỗi tạo thư mục
  }
}
ensureLocalDataDirs();

// Ghi đè an toàn (Atomic Write) tránh lỗi mất file khi mất điện đột ngột
function safeWriteJsonFile(filePath, data) {
  try {
    const tmpPath = filePath + '.tmp';
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    fs.writeFileSync(tmpPath, jsonStr, 'utf8');
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch (e) {
    try { 
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
      fs.writeFileSync(filePath, jsonStr, 'utf8'); 
      return true; 
    } catch (err2) { return false; }
  }
}

// ⚡ Ghi đè bất đồng bộ (Non-blocking Async Atomic Write) không gây nghẽn Event Loop khi nhiều người cùng lưu
async function safeWriteJsonFileAsync(filePath, data) {
  try {
    const tmpPath = filePath + '.tmp';
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
    await fs.promises.writeFile(tmpPath, jsonStr, 'utf8');
    await fs.promises.rename(tmpPath, filePath);
    return true;
  } catch (e) {
    try {
      const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
      await fs.promises.writeFile(filePath, jsonStr, 'utf8');
      return true;
    } catch (err2) {
      return false;
    }
  }
}

// Tinh gọn session data: loại bỏ các trường đệm trùng lặp (quartersData thừa) để giảm dung lượng từ 1.7MB xuống 200KB
function sanitizeSessionData(state) {
  if (!state || typeof state !== 'object') return state;
  const clean = { ...state };
  if (clean.quartersData) {
    delete clean.quartersData;
  }
  return clean;
}

// Đếm tổng số công việc có thực hiện ("Có") trong toàn bộ các tháng của phiên làm việc
function countSessionActiveTasks(sess) {
  if (!sess || !sess.months) return 0;
  const monthsArr = Array.isArray(sess.months) ? sess.months : Object.values(sess.months);
  let count = 0;
  monthsArr.forEach(m => {
    if (!m) return;
    const rows = (Array.isArray(m.rows) && m.rows.length > 0) ? m.rows : (Array.isArray(m.deltaRows) ? m.deltaRows : []);
    rows.forEach(r => {
      if (r && (r.co_thuchien === 'Có' || Number(r.soluong_tt) > 0 || Number(r.thuchien_thang) > 0)) {
        count++;
      }
    });
  });
  return count;
}

// Chọn phiên làm việc đầy đủ dữ liệu nhất giữa các nguồn (MongoDB không dấu, MongoDB có dấu, File gốc trên đĩa)
// Tuyệt đối không để bản ghi rỗng (0 công việc) che khuất bản ghi chính thức đã chấm điểm của cán bộ!
function pickBestSession(...candidates) {
  let best = null;
  let bestTasks = -1;
  let bestSubmitted = -1;
  let bestTime = -1;

  for (const cand of candidates) {
    if (!cand || typeof cand !== 'object' || (!cand.officer && !cand.months && !cand.status)) continue;
    const tasks = countSessionActiveTasks(cand);
    const isSub = (cand.isSubmitted || cand.status === 'da_nop' || cand.status === 'da_duyet') ? 1 : 0;
    const savedTime = cand.lastSaved ? (new Date(cand.lastSaved).getTime() || 0) : 0;

    if (
      tasks > bestTasks ||
      (tasks === bestTasks && isSub > bestSubmitted) ||
      (tasks === bestTasks && isSub === bestSubmitted && savedTime > bestTime)
    ) {
      best = cand;
      bestTasks = tasks;
      bestSubmitted = isSub;
      bestTime = savedTime;
    }
  }
  return best;
}

function getLocalOfficers() {
  try {
    if (fs.existsSync(OFFICERS_FILE)) {
      return JSON.parse(fs.readFileSync(OFFICERS_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveLocalOfficers(cfg) {
  return safeWriteJsonFile(OFFICERS_FILE, cfg);
}

function getLocalAuth() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveLocalAuth(data) {
  return safeWriteJsonFile(AUTH_FILE, data);
}

function getLocalSession(filename) {
  try {
    const p = path.join(SESSIONS_DIR, filename);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {}
  return null;
}

function saveLocalSession(filename, sessionData) {
  const p = path.join(SESSIONS_DIR, filename);
  return safeWriteJsonFile(p, sessionData);
}

async function saveLocalSessionAsync(filename, sessionData) {
  const p = path.join(SESSIONS_DIR, filename);
  return safeWriteJsonFileAsync(p, sessionData);
}

function getAllLocalSessions() {
  const map = {};
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      files.forEach(f => {
        try {
          map[f] = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
        } catch (e) {}
      });
    }
  } catch (e) {}
  return map;
}

function saveLocalSnapshot(filename, snapshotObj) {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
    const snapId = 'snap_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const snapFile = path.join(SNAPSHOTS_DIR, `${filename}__${snapId}.json`);
    const doc = {
      _id: snapId,
      filename,
      ...snapshotObj
    };
    const jsonStr = typeof doc === 'string' ? doc : JSON.stringify(doc);
    fs.writeFileSync(snapFile, jsonStr, 'utf8');

    const snaps = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.startsWith(filename + '__')).sort();
    if (snaps.length > 15) {
      const toDelete = snaps.slice(0, snaps.length - 15);
      toDelete.forEach(f => { try { fs.unlinkSync(path.join(SNAPSHOTS_DIR, f)); } catch(e){} });
    }
    return snapId;
  } catch (e) {
    return null;
  }
}

async function saveLocalSnapshotAsync(filename, snapshotObj) {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) await fs.promises.mkdir(SNAPSHOTS_DIR, { recursive: true });
    const snapId = 'snap_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const snapFile = path.join(SNAPSHOTS_DIR, `${filename}__${snapId}.json`);
    const doc = {
      _id: snapId,
      filename,
      ...snapshotObj
    };
    await fs.promises.writeFile(snapFile, JSON.stringify(doc), 'utf8');

    // Dọn dẹp snapshot cũ bất đồng bộ chạy nền không chặn Event Loop
    setImmediate(async () => {
      try {
        const files = await fs.promises.readdir(SNAPSHOTS_DIR);
        const snaps = files.filter(f => f.startsWith(filename + '__')).sort();
        if (snaps.length > 15) {
          const toDelete = snaps.slice(0, snaps.length - 15);
          for (const f of toDelete) {
            try { await fs.promises.unlink(path.join(SNAPSHOTS_DIR, f)); } catch(e){}
          }
        }
      } catch (e) {}
    });

    return snapId;
  } catch (e) {
    return null;
  }
}

function getLocalSnapshots(filename) {
  const list = [];
  try {
    if (fs.existsSync(SNAPSHOTS_DIR)) {
      const snaps = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.startsWith(filename + '__')).sort().reverse();
      snaps.slice(0, 20).forEach(f => {
        try {
          const doc = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), 'utf8'));
          list.push({
            id: doc._id || f,
            savedAt: doc.savedAt,
            clientIp: doc.clientIp || 'local',
            summary: doc.summary || ''
          });
        } catch(e){}
      });
    }
  } catch (e) {}
  return list;
}

function getLocalSnapshotById(snapshotId) {
  try {
    if (fs.existsSync(SNAPSHOTS_DIR)) {
      const files = fs.readdirSync(SNAPSHOTS_DIR);
      for (const f of files) {
        if (f.includes(snapshotId)) {
          return JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), 'utf8'));
        }
      }
    }
  } catch (e) {}
  return null;
}

// ============================================================================
// KẾT NỐI MONGODB ATLAS (LƯU TRỮ LÂU DÀI TRÊN CLOUD NẾU CÓ MẠNG)
// ============================================================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://kbbinhdinh_db_user:ZvCQmfp24YwNudJS@kpi-ktnn-db.olx4piw.mongodb.net/?appName=kpi-ktnn-db";
let dbClient = null;
let kpiDb = null;

async function connectMongo() {
  if (process.env.STORAGE_MODE === 'local') {
    console.log("============================================================================");
    console.log(" [CHẾ ĐỘ MÁY CHỦ NỘI BỘ] Đang chạy CSDL TỆP TIN CỤC BỘ (Offline Local Mode).");
    console.log(" [+] Không kết nối Internet/MongoDB Cloud - Toàn bộ dữ liệu lưu tại data/");
    console.log("============================================================================");
    return;
  }
  if (!MongoClient) {
    console.log("[CHẾ ĐỘ MÁY CHỦ NỘI BỘ] Không có module mongodb. Tự động sử dụng CSDL tệp tin cục bộ (data/).");
    return;
  }
  if (!MONGODB_URI) {
    console.warn("[MongoDB] Chưa cấu hình MONGODB_URI. Tự động sử dụng CSDL tệp tin cục bộ (data/).");
    return;
  }
  try {
    // Timeout 3.5 giây để không làm chậm khởi động khi mạng LAN không có internet
    dbClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3500, connectTimeoutMS: 3500 });
    await dbClient.connect();
    kpiDb = dbClient.db('kpi_ktnn_db');
    console.log("[MongoDB] Đã kết nối thành công tới MongoDB Atlas Cloud Database!");
    await initCloudSeedData();
    await syncOfficerRolesMigration();
  } catch (err) {
    if (dbClient) {
      try { dbClient.close(); } catch (e) {}
      dbClient = null;
      kpiDb = null;
    }
    console.warn(`[CHẾ ĐỘ MÁY CHỦ NỘI BỘ] Không thể kết nối MongoDB Cloud (${err.message}).`);
    console.log("[+] Tự động kích hoạt CSDL TỆP TIN CỤC BỘ (Offline Local Mode) trong thư mục data/!");
    console.log("[+] 53 hồ sơ KPI và 35 cán bộ đã sẵn sàng phục vụ 100% không cần Internet.");
  }
}

// ⚡ Đảm bảo kết nối MongoDB trong môi trường Serverless (Vercel) trước khi xử lý request
let mongoConnectingPromise = null;
async function ensureMongoConnected() {
  if (kpiDb) return kpiDb;
  if (!mongoConnectingPromise) {
    mongoConnectingPromise = connectMongo().then(() => {
      mongoConnectingPromise = null;
      return kpiDb;
    }).catch(err => {
      mongoConnectingPromise = null;
      console.warn('[MongoDB ensure] Connect failed:', err.message);
      return null;
    });
  }
  return mongoConnectingPromise;
}

// Nạp dữ liệu seed ban đầu lên MongoDB nếu database trống
async function initCloudSeedData() {
  try {
    if (!kpiDb) return;
    // [AUTH_SYNC] Đồng bộ danh mục mật khẩu từ data/auth_passwords.json lên MongoDB Atlas bằng bulkWrite (<100ms)
    try {
      if (fs.existsSync(AUTH_FILE)) {
        const localAuth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
        const authCol = kpiDb.collection('auth_passwords');
        const bulkOps = [];
        for (const [id, item] of Object.entries(localAuth)) {
          if (item && item.hash) {
            bulkOps.push({
              updateOne: {
                filter: { officerId: id },
                update: { $set: { officerId: id, hash: item.hash, salt: item.salt || '', updatedAt: item.updatedAt || new Date().toISOString() } },
                upsert: true
              }
            });
          }
        }
        if (bulkOps.length > 0) {
          await authCol.bulkWrite(bulkOps, { ordered: false });
        }
      }
    } catch (authSyncErr) {
      console.warn('[AUTH_SYNC] Lỗi đồng bộ mật khẩu lên MongoDB:', authSyncErr.message);
    }

    // [DATA_INTEGRITY] Đảm bảo dữ liệu Quý III của Trần Quốc Hoàng luôn trọn vẹn 100% trên Cloud
    try {
      const sessionsCol = kpiDb.collection('sessions');
      const hoangAccentFile = path.join(SESSIONS_DIR, 'hoang_QuýIII_2026.json');
      const hoangUnaccentFile = path.join(SESSIONS_DIR, 'hoang_QuyIII_2026.json');
      let fullHoangData = null;
      if (fs.existsSync(hoangAccentFile)) {
        fullHoangData = JSON.parse(fs.readFileSync(hoangAccentFile, 'utf8'));
      } else if (fs.existsSync(hoangUnaccentFile)) {
        fullHoangData = JSON.parse(fs.readFileSync(hoangUnaccentFile, 'utf8'));
      }
      if (fullHoangData) {
        await sessionsCol.updateOne({ filename: 'hoang_QuyIII_2026.json' }, { $set: { filename: 'hoang_QuyIII_2026.json', data: fullHoangData } }, { upsert: true });
        await sessionsCol.updateOne({ filename: 'hoang_QuýIII_2026.json' }, { $set: { filename: 'hoang_QuýIII_2026.json', data: fullHoangData } }, { upsert: true });
      }
    } catch (hErr) {}

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

// Chuẩn hóa và chuyển giao chức danh Thủ kho tiền trên MongoDB Atlas / Local
async function syncOfficerRolesMigration() {
  const qnTrangTitle = "Giao dịch viên - Thủ kho tiền";
  const qnTrangSpecialty = "Thủ kho tiền, tổng hợp các báo cáo liên quan đến công tác kho quỹ; Kế toán hoàn thuế do Thuế tỉnh gửi; TK chuyên thu BHXH (TK 3743); Báo cáo xử phạt VPHC lĩnh vực Kế toán.";

  const qnThuyTitle = "Giao dịch viên";
  const qnThuySpecialty = "Hành chính, văn thư, lưu trữ của Phòng; Kế toán Liên kho bạc; Báo cáo công tác cải cách hành chính, TTHC (lĩnh vực kế toán); In, lưu trữ Bảng thanh toán tự động điện, nước, viễn thông.";

  // Đồng bộ cấu hình cục bộ (Local data)
  const localOfficers = getLocalOfficers();
  if (localOfficers.qn_trang) {
    localOfficers.qn_trang.title = qnTrangTitle;
    localOfficers.qn_trang.specialty = qnTrangSpecialty;
  }
  if (localOfficers.qn_thuy_le) {
    localOfficers.qn_thuy_le.title = qnThuyTitle;
    localOfficers.qn_thuy_le.specialty = qnThuySpecialty;
  }
  saveLocalOfficers(localOfficers);

  try {
    if (!kpiDb) return;
    const configCol = kpiDb.collection('officers_config');
    const sessionsCol = kpiDb.collection('sessions');

    await configCol.updateOne(
      { id: 'qn_trang' },
      { $set: { title: qnTrangTitle, specialty: qnTrangSpecialty } }
    );
    await configCol.updateOne(
      { id: 'qn_thuy_le' },
      { $set: { title: qnThuyTitle, specialty: qnThuySpecialty } }
    );

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
  } catch (err) {}
}

connectMongo();

// ============================================================================
// 🛡️ TỰ ĐỘNG SAO LƯU DỰ PHÒNG TOÀN HỆ THỐNG ĐỊNH KỲ (DAILY AUTO-BACKUP)
// ============================================================================
function scheduleDailyAutoBackup() {
  if (process.env.VERCEL || process.env.AUTO_BACKUP_ENABLED === 'false') return;

  const BACKUP_DIR = path.join(BASE_DIR, 'backups');
  if (!fs.existsSync(BACKUP_DIR)) {
    try { fs.mkdirSync(BACKUP_DIR, { recursive: true }); } catch (e) {}
  }

  async function performBackup() {
    try {
      console.log('[AUTO-BACKUP] Đang thực hiện sao lưu an toàn toàn bộ hệ thống...');
      let sessionDocs = [];
      let configDocs = [];
      let authDocs = [];

      if (kpiDb) {
        try {
          sessionDocs = await kpiDb.collection('sessions').find({}).toArray();
          configDocs = await kpiDb.collection('officers_config').find({}).toArray();
          authDocs = await kpiDb.collection('auth_passwords').find({}).toArray();
        } catch (e) {}
      }

      const backupObj = {
        timestamp: new Date().toISOString(),
        backupType: 'DAILY_AUTO_SNAPSHOT',
        author: AUTHOR_INFO.author,
        sessions: {},
        officers_config: {},
        auth_passwords: {}
      };

      if (kpiDb && sessionDocs.length > 0) {
        sessionDocs.forEach(d => { if (d.filename) backupObj.sessions[d.filename] = d.data; });
        configDocs.forEach(d => { const id = d.id || d._id; backupObj.officers_config[id] = d; });
        authDocs.forEach(d => { if (d.officerId) backupObj.auth_passwords[d.officerId] = d; });
      } else {
        backupObj.sessions = getAllLocalSessions();
        backupObj.officers_config = getLocalOfficers();
        backupObj.auth_passwords = getLocalAuth();
      }

      const rawJson = Buffer.from(JSON.stringify(backupObj), 'utf8');
      const gzipped = zlib.gzipSync(rawJson, { level: 6 });
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

if (require.main === module) {
  scheduleDailyAutoBackup();
}

// Lấy IP mạng LAN

// ============================================================================
// ⚡ BỘ ĐỆM BỘ NHỚ RAM TỐC ĐỘ CAO (HIGH-SPEED RAM CACHING)
// ============================================================================
let officersConfigCache = null;
let officersConfigCacheTime = 0;

let summaryCache = {};
let summaryCacheTimer = null;
const lastSnapshotTimeMap = new Map();

function invalidateSummaryCache() {
  summaryCache = {};
}

function invalidateSummaryCacheDebounced() {
  if (summaryCacheTimer) return;
  summaryCacheTimer = setTimeout(() => {
    summaryCache = {};
    summaryCacheTimer = null;
  }, 2500);
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
  const cfgLocal = getLocalOfficers();
  if (cfgLocal && Object.keys(cfgLocal).length > 0) {
    if (cfgLocal.qn_trang) {
      cfgLocal.qn_trang.title = qnTrangTitle;
      cfgLocal.qn_trang.specialty = qnTrangSpecialty;
    }
    if (cfgLocal.qn_thuy_le) {
      cfgLocal.qn_thuy_le.title = qnThuyTitle;
      cfgLocal.qn_thuy_le.specialty = qnThuySpecialty;
    }
    officersConfigCache = cfgLocal;
    officersConfigCacheTime = Date.now();
    return cfgLocal;
  }
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
if (!process.env.VERCEL) {
  try {
    fs.watch(HTML_FILE, () => { setTimeout(refreshHtmlCache, 300); });
  } catch (e) {}
}

function sendJson(res, statusCode, data) {
  const jsonStr = (typeof data === 'string') ? data : JSON.stringify(data);
  const req = res._req;
  const acceptEncoding = (req && req.headers && req.headers['accept-encoding']) || '';

  // Tự động nén Gzip cho JSON lớn (> 2KB) để tăng tốc độ truyền qua mạng Internet gấp 10 lần
  if (acceptEncoding.includes('gzip') && jsonStr.length > 2048) {
    zlib.gzip(Buffer.from(jsonStr, 'utf8'), { level: 6 }, (err, gzipped) => {
      if (!err && gzipped) {
        res.writeHead(statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Content-Length': gzipped.length,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Vary': 'Accept-Encoding'
        });
        return res.end(gzipped);
      }
      sendJsonDirect(res, statusCode, jsonStr);
    });
    return;
  }
  sendJsonDirect(res, statusCode, jsonStr);
}

function sendJsonDirect(res, statusCode, jsonStr) {
  const buf = Buffer.from(jsonStr, 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(buf);
}

// ⚡ Hỗ trợ phân tích dữ liệu POST đa môi trường (Tương thích cả Vercel Serverless lẫn Node Native Stream)
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'object') return resolve(req.body);
      if (typeof req.body === 'string') {
        try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve({}); }
      }
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === 'string') return resolve(Buffer.from(req.body));
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
      return resolve(Buffer.from(JSON.stringify(req.body)));
    }
    let chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function getAuthPasswords() {
  if (kpiDb) {
    try {
      const docs = await kpiDb.collection('auth_passwords').find({}).toArray();
      if (docs && docs.length > 0) {
        const map = {};
        docs.forEach(d => {
          map[d.officerId] = { 
            hash: d.hash, 
            salt: d.salt || '', 
            createdAt: d.createdAt, 
            updatedAt: d.updatedAt 
          };
        });
        return map;
      }
    } catch (e) {}
  }
  return getLocalAuth();
}

async function saveAuthPasswords(data) {
  saveLocalAuth(data);
  if (kpiDb) {
    try {
      const col = kpiDb.collection('auth_passwords');
      for (const [id, item] of Object.entries(data)) {
        await col.updateOne({ officerId: id }, { $set: { officerId: id, ...item } }, { upsert: true });
      }
      return true;
    } catch (e) {}
  }
  return true;
}

function hashPassword(password, salt) {
  if (!salt) {
    return crypto.createHash('sha256').update(String(password).trim()).digest('hex');
  }
  return crypto.createHash('sha256').update(String(salt) + ':' + String(password).trim()).digest('hex');
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

// ==========================================
// CÁC HÀM TIỆN ÍCH KẾ THỪA SỐ LIỆU QUÝ TRƯỚC
// ==========================================
function getPreviousQuarterInfo(quarterStr, year) {
  const qNorm = normalizeQuarter(quarterStr);
  const y = Number(year) || 2026;
  if (qNorm === 'QuyI') {
    return {
      quarter: 'Quý IV',
      quarterNorm: 'QuyIV',
      year: y - 1,
      lastMonthNum: 12,
      lastMonthName: `Tháng 12/${y - 1}`,
      lastMonthShort: 'T12'
    };
  } else if (qNorm === 'QuyII') {
    return {
      quarter: 'Quý I',
      quarterNorm: 'QuyI',
      year: y,
      lastMonthNum: 3,
      lastMonthName: `Tháng 3/${y}`,
      lastMonthShort: 'T3'
    };
  } else if (qNorm === 'QuyIII') {
    return {
      quarter: 'Quý II',
      quarterNorm: 'QuyII',
      year: y,
      lastMonthNum: 6,
      lastMonthName: `Tháng 6/${y}`,
      lastMonthShort: 'T6'
    };
  } else {
    return {
      quarter: 'Quý III',
      quarterNorm: 'QuyIII',
      year: y,
      lastMonthNum: 9,
      lastMonthName: `Tháng 9/${y}`,
      lastMonthShort: 'T9'
    };
  }
}

function getQuarterMonthsInfoServer(quarterStr, year) {
  const y = Number(year) || 2026;
  const qNorm = normalizeQuarter(quarterStr);
  let startMonth = 7;
  if (qNorm === 'QuyI') startMonth = 1;
  else if (qNorm === 'QuyII') startMonth = 4;
  else if (qNorm === 'QuyIII') startMonth = 7;
  else if (qNorm === 'QuyIV') startMonth = 10;

  const m1Num = startMonth;
  const m2Num = startMonth + 1;
  const m3Num = startMonth + 2;

  return [
    { monthNum: m1Num, name: `Tháng ${m1Num}/${y}`, shortName: `T${m1Num}` },
    { monthNum: m2Num, name: `Tháng ${m2Num}/${y}`, shortName: `T${m2Num}` },
    { monthNum: m3Num, name: `Tháng ${m3Num}/${y}`, shortName: `T${m3Num}` }
  ];
}

async function getPreviousQuarterLastMonthData(officerId, quarter, year) {
  const prevInfo = getPreviousQuarterInfo(quarter, year);
  const prevFilename = getSessionFilename(officerId, prevInfo.quarter, prevInfo.year);
  const prevFilenameAlt = `${officerId}_${prevInfo.quarter}_${prevInfo.year}.json`;

  let prevSess = null;
  if (kpiDb) {
    try {
      const doc = await kpiDb.collection('sessions').findOne({
        $or: [
          { filename: prevFilename },
          { filename: prevFilenameAlt },
          { "data.officer.officerId": officerId, "data.officer.quarter": prevInfo.quarter, "data.officer.year": Number(prevInfo.year) },
          { "data.officer.officerId": officerId, "data.officer.quarter": prevInfo.quarterNorm, "data.officer.year": Number(prevInfo.year) }
        ]
      });
      if (doc && doc.data) prevSess = doc.data;
    } catch(e) {}
  }
  if (!prevSess) {
    prevSess = getLocalSession(prevFilename);
    if (!prevSess) prevSess = getLocalSession(prevFilenameAlt);
    if (!prevSess) {
      const all = getAllLocalSessions();
      for (const [fn, sData] of Object.entries(all)) {
        if (sData && sData.officer && sData.officer.officerId === officerId) {
          const sQ = normalizeQuarter(sData.officer.quarter);
          const sY = Number(sData.officer.year);
          if (sQ === prevInfo.quarterNorm && sY === prevInfo.year) {
            prevSess = sData;
            break;
          }
        }
      }
    }
  }

  if (prevSess && prevSess.months && Array.isArray(prevSess.months) && prevSess.months.length > 0) {
    const lastMonth = prevSess.months[2] || prevSess.months[prevSess.months.length - 1];
    if (lastMonth && lastMonth.rows && lastMonth.rows.length > 0) {
      return {
        found: true,
        prevInfo,
        lastMonth,
        prevFilename
      };
    }
  }

  return { found: false, prevInfo };
}

async function handleKpiRequest(req, res) {
  res._req = req;
  await ensureMongoConnected();
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
  let pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  // Hỗ trợ Vercel Serverless: giải mã đường dẫn gốc khi được rewrite qua _raw_path hoặc slug
  if (searchParams.has('_raw_path')) {
    const raw = searchParams.get('_raw_path');
    pathname = raw.startsWith('/') ? raw : ('/api/' + raw);
  } else if (req.query && req.query.slug) {
    const slugArr = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug];
    pathname = '/api/' + slugArr.join('/');
  }

  // Chuẩn hóa tiền tố khi được phục vụ dưới cổng hợp nhất 8090
  if (pathname === '/kpi' || pathname === '/kpi/' || pathname === '/kpi-ktnn' || pathname === '/kpi-ktnn/') {
    pathname = '/';
  } else if (pathname.startsWith('/kpi/')) {
    pathname = pathname.substring('/kpi'.length);
  } else if (pathname.startsWith('/kpi-ktnn/')) {
    pathname = pathname.substring('/kpi-ktnn'.length);
  }

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

  // API Set Password (Thiết lập mật khẩu lần đầu)
  if (pathname === '/api/auth/set-password' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { officerId, password } = payload;
      if (!officerId || !password || String(password).trim().length < 4) {
        return sendJson(res, 400, { success: false, error: "Mật khẩu phải có ít nhất 4 ký tự" });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(password, salt);
      const nowIso = new Date().toISOString();

      // Cập nhật TRỰC TIẾP lên MongoDB Atlas (<50ms)
      if (kpiDb) {
        try {
          await kpiDb.collection('auth_passwords').updateOne(
            { officerId },
            { $set: { officerId, hash, salt, updatedAt: nowIso } },
            { upsert: true }
          );
        } catch (dbErr) {
          console.error('[API Set Password] Lỗi cập nhật MongoDB:', dbErr);
        }
      }

      // Cập nhật local file nếu môi trường hỗ trợ ghi
      try {
        const localAuth = getLocalAuth();
        localAuth[officerId] = { hash, salt, updatedAt: nowIso };
        saveLocalAuth(localAuth);
      } catch (e) {}

      return sendJson(res, 200, { success: true, message: "Đã thiết lập mật khẩu thành công" });
    } catch (err) {
      return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ: " + err.message });
    }
  }

  // API Verify Password (Xác thực mật khẩu đăng nhập với Lá chắn Reset 123456)
  if (pathname === '/api/auth/verify' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { officerId, password } = payload;
      const defaultHash = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
      const pwd = String(password || '').trim();

      // Lấy thông tin xác thực từ Cloud và Local
      const authData = await getAuthPasswords();
      const localAuth = getLocalAuth();
      const userAuth = authData[officerId] || localAuth[officerId];

      let matched = false;

      // 1. So khớp mật khẩu có salt (chuẩn bảo mật cao nhất)
      if (userAuth && userAuth.salt && userAuth.hash) {
        const calculatedHash = hashPassword(pwd, userAuth.salt);
        if (calculatedHash === userAuth.hash) {
          matched = true;
        }
      }

      // 2. So khớp mật khẩu không có salt (chuẩn trực tiếp / legacy)
      if (!matched && userAuth && userAuth.hash) {
        const plainHash = hashPassword(pwd);
        if (plainHash === userAuth.hash) {
          matched = true;
        }
      }

      // 3. Fallback kiểm tra file auth_passwords.json trong repository (khi admin commit git hoặc đồng bộ offline)
      if (!matched && localAuth[officerId] && localAuth[officerId].hash) {
        const localUserAuth = localAuth[officerId];
        if (localUserAuth.salt) {
          if (hashPassword(pwd, localUserAuth.salt) === localUserAuth.hash) matched = true;
        }
        if (!matched && hashPassword(pwd) === localUserAuth.hash) {
          matched = true;
        }
      }

      // 4. LÁ CHẮN RESET MẬT KHẨU MẶC ĐỊNH (123456 UNIVERSAL RESET SHIELD):
      // Khi cán bộ nhập 123456:
      // - Hoặc tài khoản đã được admin đặt về 123456 trên Cloud/Local
      // - Hoặc tài khoản chưa có mật khẩu / đã bị admin xóa mật khẩu (auth/reset)
      // - Hoặc hash của cán bộ trong localAuth trùng defaultHash
      if (!matched && pwd === '123456') {
        const isDefaultInCloud = (userAuth && userAuth.hash === defaultHash);
        const isDefaultInLocal = (localAuth[officerId] && localAuth[officerId].hash === defaultHash);
        const isUnsetPassword = (!userAuth || !userAuth.hash);

        if (isDefaultInCloud || isDefaultInLocal || isUnsetPassword) {
          matched = true;
        }
      }

      if (matched) {
        // Tự động đồng bộ chuẩn hóa lên MongoDB Atlas nếu chưa khớp trên Cloud
        if (kpiDb) {
          try {
            const currentHash = (pwd === '123456' && (!userAuth || userAuth.hash === defaultHash)) ? defaultHash : ((userAuth && userAuth.hash) || hashPassword(pwd));
            const currentSalt = (pwd === '123456' && (!userAuth || userAuth.hash === defaultHash)) ? '' : ((userAuth && userAuth.salt) || '');
            await kpiDb.collection('auth_passwords').updateOne(
              { officerId },
              { $set: { officerId, hash: currentHash, salt: currentSalt, updatedAt: new Date().toISOString() } },
              { upsert: true }
            );
          } catch (e) {}
        }
        return sendJson(res, 200, { success: true, message: "Xác thực thành công" });
      }

      // Nếu không khớp và tài khoản chưa từng thiết lập mật khẩu
      if (!userAuth || !userAuth.hash) {
        return sendJson(res, 200, { success: false, error: "Tài khoản chưa thiết lập mật khẩu hoặc đã được đặt lại. Vui lòng thiết lập mật khẩu mới!", notSet: true });
      }

      return sendJson(res, 200, { success: false, error: "Mật khẩu không chính xác. Vui lòng kiểm tra lại!" });
    } catch (err) {
      return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ: " + err.message });
    }
  }

  // API Change Password (Cán bộ tự đổi mật khẩu)
  if (pathname === '/api/auth/change-password' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { officerId, oldPassword, newPassword } = payload;
      if (!officerId || !newPassword || String(newPassword).trim().length < 4) {
        return sendJson(res, 400, { success: false, error: "Mật khẩu mới phải có ít nhất 4 ký tự" });
      }
      const authData = await getAuthPasswords();
      const userAuth = authData[officerId] || getLocalAuth()[officerId];
      if (userAuth && userAuth.hash) {
        const oldTrimmed = String(oldPassword || '').trim();
        const currentValid = (userAuth.salt && hashPassword(oldTrimmed, userAuth.salt) === userAuth.hash) ||
                             (hashPassword(oldTrimmed) === userAuth.hash) ||
                             (oldTrimmed === '123456' && userAuth.hash === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92');
        if (!currentValid && payload.adminOfficerId !== 'hoang') {
          return sendJson(res, 400, { success: false, error: "Mật khẩu hiện tại không chính xác" });
        }
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(newPassword, salt);
      const nowIso = new Date().toISOString();

      // Cập nhật TRỰC TIẾP lên MongoDB Atlas (<50ms)
      if (kpiDb) {
        try {
          await kpiDb.collection('auth_passwords').updateOne(
            { officerId },
            { $set: { officerId, hash, salt, updatedAt: nowIso } },
            { upsert: true }
          );
        } catch (dbErr) {
          console.error('[API Change Password] Lỗi cập nhật MongoDB:', dbErr);
        }
      }

      try {
        const localAuth = getLocalAuth();
        localAuth[officerId] = { hash, salt, updatedAt: nowIso };
        saveLocalAuth(localAuth);
      } catch (e) {}

      return sendJson(res, 200, { success: true, message: "Đã đổi mật khẩu thành công" });
    } catch (err) {
      return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ: " + err.message });
    }
  }

  // API Admin Set Password (Quản trị viên đặt / đổi trực tiếp mật khẩu cho bất kỳ cán bộ nào)
  if (pathname === '/api/auth/admin-set-password' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { adminOfficerId, targetOfficerId, newPassword } = payload;
      const isAuthorized = isAuthorAuthorizedMachine() || adminOfficerId === 'hoang';
      if (!isAuthorized) {
        return sendJson(res, 403, { success: false, error: "Quyền quản trị bị từ chối!" });
      }
      if (!targetOfficerId) {
        return sendJson(res, 400, { success: false, error: "Thiếu mã cán bộ cần đặt mật khẩu" });
      }
      const trimmed = String(newPassword).trim();
      let salt = '';
      let hash = '';
      if (trimmed === '123456') {
        hash = hashPassword('123456');
        salt = '';
      } else {
        salt = crypto.randomBytes(16).toString('hex');
        hash = hashPassword(trimmed, salt);
      }
      const nowIso = new Date().toISOString();

      // 1. Cập nhật TRỰC TIẾP và NGAY LẬP TỨC lên MongoDB Atlas (Single fast operation < 50ms)
      if (kpiDb) {
        try {
          await kpiDb.collection('auth_passwords').updateOne(
            { officerId: targetOfficerId },
            { $set: { officerId: targetOfficerId, hash, salt, updatedAt: nowIso } },
            { upsert: true }
          );
        } catch (dbErr) {
          console.error('[API Admin Set Password] Lỗi cập nhật MongoDB:', dbErr);
          return sendJson(res, 500, { success: false, error: "Lỗi kết nối cơ sở dữ liệu Cloud: " + dbErr.message });
        }
      }

      // 2. Cập nhật file cục bộ (nếu môi trường cho phép ghi)
      try {
        const localAuth = getLocalAuth();
        localAuth[targetOfficerId] = {
          hash,
          salt,
          updatedAt: nowIso
        };
        saveLocalAuth(localAuth);
      } catch (e) {}

      return sendJson(res, 200, { 
        success: true, 
        message: `Đã đặt mật khẩu thành công cho cán bộ: ${targetOfficerId}` 
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ: " + err.message });
    }
  }

  // API Reset Password (Quản trị viên xóa / đặt lại mật khẩu để cán bộ tự đặt mới)
  if (pathname === '/api/auth/reset' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { adminOfficerId, targetOfficerId } = payload;
      const isAuthorized = isAuthorAuthorizedMachine() || adminOfficerId === 'hoang';
      if (!isAuthorized) {
        return sendJson(res, 403, { success: false, error: "Quyền quản trị bị từ chối!" });
      }
      if (!targetOfficerId) {
        return sendJson(res, 400, { success: false, error: "Thiếu mã cán bộ cần đặt lại" });
      }

      if (kpiDb) {
        try {
          await kpiDb.collection('auth_passwords').deleteOne({ officerId: targetOfficerId });
        } catch (e) {
          console.error('[API Auth Reset] Lỗi xóa MongoDB:', e);
        }
      }

      try {
        const localData = getLocalAuth();
        if (localData[targetOfficerId]) {
          delete localData[targetOfficerId];
          saveLocalAuth(localData);
        }
      } catch (e) {}

      return sendJson(res, 200, { 
        success: true, 
        message: `Đã đặt lại mật khẩu thành công cho cán bộ: ${targetOfficerId}` 
      });
    } catch (err) {
      return sendJson(res, 400, { success: false, error: "Dữ liệu không hợp lệ: " + err.message });
    }
  }

  // API Status
  if (pathname === '/api/status' && req.method === 'GET') {
    let sessionsCount = 0;
    if (kpiDb) {
      try {
        sessionsCount = await kpiDb.collection('sessions').countDocuments();
      } catch(e) {
        sessionsCount = Object.keys(getAllLocalSessions()).length;
      }
    } else {
      sessionsCount = Object.keys(getAllLocalSessions()).length;
    }
    return sendJson(res, 200, {
      status: "ok",
      storageMode: kpiDb ? "mongodb_cloud" : "local_file_storage",
      serverTime: new Date().toISOString(),
      hostIp: getLanIp(),
      port: PORT,
      sessionsCount,
      version: "V18_Hybrid_Local_Cloud"
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

  // API Get Previous Quarter Last Month (Phục vụ kế thừa KPI)
  if (pathname === '/api/session/previous-month' && req.method === 'GET') {
    const officerId = searchParams.get('officerId');
    const quarter = searchParams.get('quarter') || 'Quý IV';
    const year = searchParams.get('year') || 2026;

    if (!officerId) {
      return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
    }

    try {
      const result = await getPreviousQuarterLastMonthData(officerId, quarter, year);
      if (result.found && result.lastMonth) {
        return sendJson(res, 200, {
          success: true,
          found: true,
          prevQuarter: result.prevInfo.quarter,
          prevYear: result.prevInfo.year,
          lastMonthNum: result.prevInfo.lastMonthNum,
          lastMonthName: result.prevInfo.lastMonthName,
          lastMonthShort: result.prevInfo.lastMonthShort,
          lastMonthData: result.lastMonth,
          sourceFilename: result.prevFilename
        });
      } else {
        return sendJson(res, 200, {
          success: true,
          found: false,
          prevQuarter: result.prevInfo.quarter,
          prevYear: result.prevInfo.year,
          lastMonthNum: result.prevInfo.lastMonthNum,
          lastMonthName: result.prevInfo.lastMonthName,
          lastMonthShort: result.prevInfo.lastMonthShort,
          message: `Không tìm thấy số liệu tháng cuối quý trước (${result.prevInfo.lastMonthName} - ${result.prevInfo.quarter}/${result.prevInfo.year})`
        });
      }
    } catch(err) {
      return sendJson(res, 500, { success: false, error: "Lỗi xử lý kế thừa tháng: " + err.message });
    }
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
    const altFilename = filename.includes('Quy') ? filename.replace(/Quy/g, 'Quý') : filename.replace(/Quý/g, 'Quy');

    let mongoPrimary = null;
    let mongoAlt = null;
    if (kpiDb) {
      try {
        const docs = await kpiDb.collection('sessions').find({
          $or: [
            { filename },
            { filename: altFilename },
            { "data.officer.officerId": officerId, "data.officer.quarter": quarter, "data.officer.year": Number(year) }
          ]
        }).toArray();
        for (const d of docs) {
          if (d && d.data) {
            if (d.filename === filename) mongoPrimary = d.data;
            else mongoAlt = pickBestSession(mongoAlt, d.data);
          }
        }
      } catch (e) {}
    }

    // Luôn kiểm tra cả file local (có dấu & không dấu) và chọn bản ghi có nhiều công việc hoàn thành nhất
    // Chống tuyệt đối trường hợp bản ghi rỗng (0 công việc, 50%) trên Cloud che khuất bản ghi gốc đã chấm của cán bộ!
    const localPrimary = getLocalSession(filename);
    const localAlt = getLocalSession(altFilename);
    const bestData = pickBestSession(mongoPrimary, mongoAlt, localPrimary, localAlt);

    if (bestData) {
      if (kpiDb && countSessionActiveTasks(bestData) > countSessionActiveTasks(mongoPrimary)) {
        try {
          await kpiDb.collection('sessions').updateOne(
            { filename },
            { $set: { filename, data: sanitizeSessionData(bestData) } },
            { upsert: true }
          );
        } catch (e) {}
      }
      return sendJson(res, 200, { success: true, isNew: false, filename, data: bestData });
    }

    const cfg = await getOfficersConfig();
    const defaultData = createDefaultSession(officerId, quarter, year, cfg[officerId]);

    // Lưu ý: Đối với quý mới chưa từng nhập dữ liệu, giữ nguyên defaultData.months = null
    // để phía Client khởi tạo bảng tính Mẫu 02a hoàn toàn mới (sạch sẽ, tỷ lệ 0%, chưa chọn Có).
    // Nếu người dùng có nhu cầu kế thừa, họ sẽ chủ động bấm nút "Kế thừa từ quý trước".
    return sendJson(res, 200, { success: true, isNew: true, filename, data: defaultData });
  }

  // API Save Session (CÓ LƯU TRỮ LỊCH SỬ PHIÊN BẢN - SNAPSHOT VERSIONING)
  if (pathname === '/api/session' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
        const officerId = payload.officerId || (payload.officer && payload.officer.officerId) || (payload.state && payload.state.officer && payload.state.officer.officerId);
        const quarter = payload.quarter || (payload.officer && payload.officer.quarter) || (payload.state && payload.state.officer && payload.state.officer.quarter);
        const year = payload.year || (payload.officer && payload.officer.year) || (payload.state && payload.state.officer && payload.state.officer.year);
        const state = payload.state || payload;

        if (!officerId) {
          return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        const altFilename = filename.includes('Quy') ? filename.replace(/Quy/g, 'Quý') : filename.replace(/Quý/g, 'Quy');
        state.lastSaved = new Date().toISOString();

        let existingSession = null;
        if (kpiDb) {
          try {
            const docs = await kpiDb.collection('sessions').find({
              $or: [{ filename }, { filename: altFilename }]
            }).toArray();
            for (const d of docs) {
              if (d && d.data) existingSession = pickBestSession(existingSession, d.data);
            }
          } catch(e) {}
        }
        existingSession = pickBestSession(existingSession, getLocalSession(filename), getLocalSession(altFilename));

        if (existingSession) {
          const currentStatus = existingSession.status;
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

          if (existingSession.leaderRatingProposal && !state.leaderRatingProposal) {
            state.leaderRatingProposal = existingSession.leaderRatingProposal;
          }
          if (existingSession.leaderRatingNote && !state.leaderRatingNote) {
            state.leaderRatingNote = existingSession.leaderRatingNote;
          }
          if (existingSession.status && !state.status) {
            state.status = existingSession.status;
          }
        }

        // Tinh gọn state: loại bỏ dữ liệu rác/trùng lặp để giảm từ 1.7MB xuống 200KB
        const cleanState = sanitizeSessionData(state);
        cleanState.lastSaved = state.lastSaved;

        // 🛡️ LÁ CHẮN BẢO TOÀN DỮ LIỆU (ANTI DATA-LOSS SHIELD):
        // Nếu hồ sơ hiện tại trên máy chủ đã có số liệu hoàn thành (đã chấm tháng, có điểm, hoặc có >= 5 công việc),
        // mà bản tin gửi lên lại là bản rỗng (0 công việc thực hiện, 0 điểm) do client vừa khởi tạo nhầm,
        // TUYỆT ĐỐI TỪ CHỐI GHI ĐÈ để bảo vệ 100% dữ liệu gốc của cán bộ!
        if (existingSession && payload.action !== 'force_clear') {
          const countExistingActive = (existingSession.months && Array.isArray(existingSession.months)) ?
            existingSession.months.reduce((acc, m) => acc + (m.rows ? m.rows.filter(r => r.co_thuchien === 'Có' || (Number(r.thuchien_thang) || 0) > 0).length : 0), 0) : 0;
          const countIncomingActive = (cleanState.months && Array.isArray(cleanState.months)) ?
            cleanState.months.reduce((acc, m) => acc + (m.rows ? m.rows.filter(r => r.co_thuchien === 'Có' || (Number(r.thuchien_thang) || 0) > 0).length : 0), 0) : 0;

          if (countExistingActive >= 5 && countIncomingActive === 0) {
            console.warn(`[DATA-LOSS SHIELD] Chặn yêu cầu ghi đè rỗng lên hồ sơ ${filename} (gốc: ${countExistingActive} việc, mới: 0 việc).`);
            return sendJson(res, 200, {
              success: true,
              message: "Lá chắn dữ liệu đã bảo vệ hồ sơ gốc của đồng chí an toàn!",
              filename,
              data: existingSession
            });
          }
        }

        // BẢO VỆ CHẶT CHẼ TRẠNG THÁI:
        // Nếu hồ sơ chưa từng nộp chính thức trên máy chủ, một lệnh lưu thông thường
        // TUYỆT ĐỐI KHÔNG ĐƯỢC gán trạng thái 'da_nop' (tránh rò rỉ cờ isSubmitted từ phiên cũ).
        // Chỉ có thao tác nộp bài chính thức (/api/session/submit hoặc action: 'submit') mới được mang trạng thái 'da_nop'.
        const isOfficiallySubmitted = existingSession && (existingSession.isSubmitted || existingSession.status === 'da_nop' || existingSession.status === 'da_duyet');
        if (!isOfficiallySubmitted && payload.action !== 'submit') {
          cleanState.status = 'da_luu';
          cleanState.isSubmitted = false;
          cleanState.submittedAt = null;
        }

        // 1. Luôn ghi đè an toàn vào ổ đĩa máy chủ bất đồng bộ (Non-blocking I/O)
        await saveLocalSessionAsync(filename, cleanState);

        // Kiểm tra xem có cần chụp Snapshot hay không (tránh bão snapshot khi 35 người gõ phím liên tục)
        const isActionSnapshot = (payload.action === 'submit' || payload.action === 'approve' || payload.action === 'reject' || payload.forceSnapshot);
        const lastSnapTime = lastSnapshotTimeMap.get(filename) || 0;
        const isTimeForSnapshot = (Date.now() - lastSnapTime > 15 * 60 * 1000); // 15 phút một lần
        const shouldTakeSnapshot = isActionSnapshot || !lastSnapshotTimeMap.has(filename) || isTimeForSnapshot;

        const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
        let snapshotSummary = "";
        if (cleanState.months && Array.isArray(cleanState.months)) {
          let mPct = cleanState.months.map(m => m.completionPercent || 0).join(' - ');
          snapshotSummary = `Tháng: [${mPct}]% - TT: ${cleanState.status || 'da_luu'}`;
        }

        if (shouldTakeSnapshot) {
          lastSnapshotTimeMap.set(filename, Date.now());
          saveLocalSnapshotAsync(filename, {
            officerId,
            quarter: normalizeQuarter(quarter),
            year: Number(year) || 2026,
            savedAt: cleanState.lastSaved,
            clientIp,
            summary: snapshotSummary,
            data: cleanState
          }).catch(() => {});
        }

        if (kpiDb) {
          try {
            const sessionsCol = kpiDb.collection('sessions');
            await sessionsCol.updateOne({ filename }, { $set: { filename, data: cleanState, updatedAt: cleanState.lastSaved } }, { upsert: true });

            if (shouldTakeSnapshot) {
              setImmediate(async () => {
                try {
                  const snapshotsCol = kpiDb.collection('session_snapshots');
                  await snapshotsCol.insertOne({
                    filename,
                    officerId,
                    quarter: normalizeQuarter(quarter),
                    year: Number(year) || 2026,
                    savedAt: cleanState.lastSaved,
                    clientIp,
                    summary: snapshotSummary,
                    data: cleanState
                  });

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
                } catch (e) {}
              });
            }
          } catch (snapErr) {
            console.warn('[MongoDB WARNING] Lỗi ghi lên Cloud, đã lưu cục bộ an toàn:', snapErr.message);
          }
        }
        invalidateSummaryCache();

        return sendJson(res, 200, {
          success: true,
          message: `Đã lưu thành công phiên làm việc cho cán bộ ${officerId}`,
          filename,
          savedAt: cleanState.lastSaved
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: "Lỗi ghi dữ liệu: " + err.message });
      }
  }

  // --- API NỘP BÁO CÁO KPI (SUBMIT KPI) ---
  if (pathname === '/api/session/submit' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
        const { officerId, quarter, year, state } = payload;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        const filename = getSessionFilename(officerId, quarter, year);
        const submitTime = new Date().toISOString();
        let targetState = state;

        if (!targetState) {
          if (kpiDb) {
            try {
              const existing = await kpiDb.collection('sessions').findOne({ filename });
              targetState = existing && existing.data;
            } catch(e) {}
          }
          if (!targetState) targetState = getLocalSession(filename);
        }
        if (!targetState) return sendJson(res, 404, { success: false, error: "Không tìm thấy dữ liệu phiên" });

        const isTP = (officerId === 'son' || (targetState.officer && targetState.officer.role === 'TP'));
        if (isTP) {
          // Trưởng phòng là người đứng đầu đơn vị: Tự xác nhận chính thức, không cần người khác duyệt
          targetState.status = "da_duyet";
          targetState.isSubmitted = true;
          targetState.isApproved = true;
          targetState.approvedAt = submitTime;
          targetState.approvedBy = "Hoàng Anh Sơn (Trưởng phòng)";
          targetState.rejectReason = null;
        } else {
          targetState.status = "da_nop";
          targetState.isSubmitted = true;
          targetState.rejectReason = null;
        }
        targetState.submittedAt = submitTime;
        targetState.lastSaved = submitTime;

        // Lưu CSDL cục bộ
        saveLocalSession(filename, targetState);
        saveLocalSnapshot(filename, {
          officerId,
          quarter: normalizeQuarter(quarter),
          year: Number(year) || 2026,
          savedAt: submitTime,
          clientIp: req.socket.remoteAddress || 'client',
          summary: '📤 [NỘP KPI QUÝ] Chốt số liệu cá nhân',
          data: targetState
        });

        if (kpiDb) {
          try {
            const sessionsCol = kpiDb.collection('sessions');
            await sessionsCol.updateOne({ filename }, { $set: { filename, data: targetState, updatedAt: submitTime } }, { upsert: true });
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
        invalidateSummaryCache();

        return sendJson(res, 200, {
          success: true,
          message: `Đã nộp thành công KPI Quý cho cán bộ ${officerId}. Dữ liệu đã được khóa an toàn!`,
          submittedAt: submitTime
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
  }

  // --- API LÃNH ĐẠO PHÊ DUYỆT KPI (APPROVE KPI) ---
  if (pathname === '/api/session/approve' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
        const { officerId, quarter, year, leaderOfficerId, leaderRatingProposal, leaderRatingNote } = payload;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        // PHÂN QUYỀN CHẶT CHẼ: Chỉ có Trưởng phòng (Sơn) và Phó Trưởng phòng (Hoàng) mới có quyền duyệt
        if (leaderOfficerId !== 'son' && leaderOfficerId !== 'hoang') {
          return sendJson(res, 403, { success: false, error: "Chỉ có Trưởng phòng (đ/c Hoàng Anh Sơn) và Phó Trưởng phòng (đ/c Trần Quốc Hoàng) mới có thẩm quyền phê duyệt kết quả KPI." });
        }
        // Trưởng phòng Hoàng Anh Sơn là cấp cao nhất phòng, hồ sơ tự xác nhận chính thức
        if (officerId === 'son') {
          return sendJson(res, 400, { success: false, error: "Đồng chí Hoàng Anh Sơn là Trưởng phòng KTNN - Cán bộ đứng đầu đơn vị, hồ sơ tự xác nhận chính thức, không chịu sự phê duyệt trong nội bộ phòng." });
        }
        if (officerId === leaderOfficerId) {
          return sendJson(res, 400, { success: false, error: "Lãnh đạo không được tự phê duyệt hồ sơ cá nhân của mình." });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        const approveTime = new Date().toISOString();

        let docData = null;
        if (kpiDb) {
          try {
            const doc = await kpiDb.collection('sessions').findOne({ filename });
            docData = doc && doc.data;
          } catch(e) {}
        }
        if (!docData) docData = getLocalSession(filename);
        if (!docData) return sendJson(res, 404, { success: false, error: "Không tìm thấy hồ sơ cán bộ" });

        docData.status = "da_duyet";
        docData.isApproved = true;
        docData.approvedAt = approveTime;
        docData.approvedBy = leaderOfficerId || "Lãnh đạo phòng";
        if (leaderRatingProposal) docData.leaderRatingProposal = leaderRatingProposal;
        if (leaderRatingNote !== undefined) docData.leaderRatingNote = leaderRatingNote;
        docData.lastSaved = approveTime;

        // Lưu CSDL cục bộ
        saveLocalSession(filename, docData);
        saveLocalSnapshot(filename, {
          officerId,
          quarter: normalizeQuarter(quarter),
          year: Number(year) || 2026,
          savedAt: approveTime,
          clientIp: req.socket.remoteAddress || 'leader',
          summary: `✅ [LÃNH ĐẠO DUYỆT] Xếp loại: ${leaderRatingProposal || docData.rating || 'Đạt'}`,
          data: docData
        });

        if (kpiDb) {
          try {
            const sessionsCol = kpiDb.collection('sessions');
            await sessionsCol.updateOne({ filename }, { $set: { data: docData, updatedAt: approveTime } });
            await kpiDb.collection('session_snapshots').insertOne({
              filename,
              officerId,
              quarter: normalizeQuarter(quarter),
              year: Number(year) || 2026,
              savedAt: approveTime,
              clientIp: req.socket.remoteAddress || 'leader',
              summary: `✅ [LÃNH ĐẠO DUYỆT] Xếp loại: ${leaderRatingProposal || docData.rating || 'Đạt'}`,
              data: docData
            });
          } catch (e) {}
        }
        invalidateSummaryCache();

        return sendJson(res, 200, {
          success: true,
          message: `Đã phê duyệt chính thức kết quả KPI cho ${officerId}! Hồ sơ đã khóa vĩnh viễn.`,
          approvedAt: approveTime
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
  }

  // --- API LÃNH ĐẠO TRẢ LẠI ĐỂ SỬA ĐỔI / GIẢI TRÌNH (REJECT & RETURN) ---
  if (pathname === '/api/session/reject' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
        const { officerId, quarter, year, leaderOfficerId, rejectReason } = payload;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        // PHÂN QUYỀN CHẶT CHẼ: Chỉ có Trưởng phòng (Sơn) và Phó Trưởng phòng (Hoàng) mới có quyền trả lại
        if (leaderOfficerId !== 'son' && leaderOfficerId !== 'hoang') {
          return sendJson(res, 403, { success: false, error: "Chỉ có Trưởng phòng (đ/c Hoàng Anh Sơn) và Phó Trưởng phòng (đ/c Trần Quốc Hoàng) mới có thẩm quyền trả lại hồ sơ KPI." });
        }
        // Không thể trả lại hồ sơ của Trưởng phòng Hoàng Anh Sơn
        if (officerId === 'son') {
          return sendJson(res, 400, { success: false, error: "Đồng chí Hoàng Anh Sơn là Trưởng phòng KTNN - Cán bộ đứng đầu đơn vị, không thể trả lại hồ sơ của Trưởng phòng." });
        }
        if (officerId === leaderOfficerId) {
          return sendJson(res, 400, { success: false, error: "Lãnh đạo không được tự trả lại hồ sơ cá nhân của mình." });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        const rejectTime = new Date().toISOString();

        let docData = null;
        if (kpiDb) {
          try {
            const doc = await kpiDb.collection('sessions').findOne({ filename });
            docData = doc && doc.data;
          } catch(e) {}
        }
        if (!docData) docData = getLocalSession(filename);
        if (!docData) return sendJson(res, 404, { success: false, error: "Không tìm thấy hồ sơ cán bộ" });

        docData.status = "tra_lai";
        docData.isSubmitted = false;
        docData.isApproved = false;
        docData.rejectedAt = rejectTime;
        docData.rejectedBy = leaderOfficerId || "Lãnh đạo phòng";
        docData.rejectReason = rejectReason || "Yêu cầu rà soát, giải trình lại số liệu";
        docData.lastSaved = rejectTime;

        // Lưu CSDL cục bộ
        saveLocalSession(filename, docData);
        saveLocalSnapshot(filename, {
          officerId,
          quarter: normalizeQuarter(quarter),
          year: Number(year) || 2026,
          savedAt: rejectTime,
          clientIp: req.socket.remoteAddress || 'leader',
          summary: `↩️ [TRẢ LẠI SỬA] Lý do: ${rejectReason || 'Yêu cầu rà soát'}`,
          data: docData
        });

        if (kpiDb) {
          try {
            const sessionsCol = kpiDb.collection('sessions');
            await sessionsCol.updateOne({ filename }, { $set: { data: docData, updatedAt: rejectTime } });
            await kpiDb.collection('session_snapshots').insertOne({
              filename,
              officerId,
              quarter: normalizeQuarter(quarter),
              year: Number(year) || 2026,
              savedAt: rejectTime,
              clientIp: req.socket.remoteAddress || 'leader',
              summary: `↩️ [TRẢ LẠI SỬA] Lý do: ${rejectReason || 'Yêu cầu rà soát'}`,
              data: docData
            });
          } catch (e) {}
        }
        invalidateSummaryCache();

        return sendJson(res, 200, {
          success: true,
          message: `Đã trả lại hồ sơ cho cán bộ ${officerId}. Hồ sơ đã được mở khóa để cán bộ chỉnh sửa!`,
          rejectedAt: rejectTime
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
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
    let history = [];

    if (kpiDb) {
      try {
        const snapshotsCol = kpiDb.collection('session_snapshots');
        const list = await snapshotsCol.find({ filename })
          .sort({ savedAt: -1 })
          .limit(20)
          .project({ _id: 1, savedAt: 1, clientIp: 1, summary: 1, "data.lastSaved": 1, "data.officer.name": 1 })
          .toArray();

        history = list.map(item => ({
          id: item._id.toString(),
          savedAt: item.savedAt,
          clientIp: item.clientIp || 'client',
          summary: item.summary || ''
        }));
      } catch (err) {}
    }
    if (history.length === 0) {
      history = getLocalSnapshots(filename);
    }

    return sendJson(res, 200, { success: true, filename, history });
  }

  // --- API KHÔI PHỤC DỮ LIỆU TỪ BẢN SAO LƯU (ROLLBACK TO SNAPSHOT) ---
  if (pathname === '/api/session/rollback' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
        const { snapshotId, officerId, quarter, year } = payload;

        if (!snapshotId) {
          return sendJson(res, 400, { success: false, error: "Thiếu snapshotId" });
        }

        let snapDoc = null;
        if (kpiDb) {
          try {
            const snapshotsCol = kpiDb.collection('session_snapshots');
            snapDoc = await snapshotsCol.findOne({ _id: new ObjectId(snapshotId) });
          } catch(e) {}
        }
        if (!snapDoc) {
          snapDoc = getLocalSnapshotById(snapshotId);
        }

        if (!snapDoc || !snapDoc.data) {
          return sendJson(res, 404, { success: false, error: "Không tìm thấy bản ghi snapshot này!" });
        }

        const filename = getSessionFilename(officerId || snapDoc.officerId, quarter || snapDoc.quarter, year || snapDoc.year);
        const restoredData = snapDoc.data;
        restoredData.lastSaved = new Date().toISOString();
        restoredData._restoredFrom = snapDoc.savedAt;

        // Lưu CSDL cục bộ
        saveLocalSession(filename, restoredData);

        if (kpiDb) {
          try {
            await kpiDb.collection('sessions').updateOne(
              { filename },
              { $set: { filename, data: restoredData, updatedAt: restoredData.lastSaved } },
              { upsert: true }
            );
          } catch(e) {}
        }
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
  }

  // API Leader Proposal
  if (pathname === '/api/leader-proposal' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { officerId, quarter, year, leaderRatingProposal, leaderRatingNote } = payload;
      if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

      const filename = getSessionFilename(officerId, quarter, year);
      let docData = null;
      if (kpiDb) {
        try {
          const col = kpiDb.collection('sessions');
          const doc = await col.findOne({ filename });
          docData = doc && doc.data;
        } catch(e) {}
      }
      if (!docData) docData = getLocalSession(filename);

      if (docData) {
        docData.leaderRatingProposal = leaderRatingProposal;
        if (leaderRatingNote !== undefined) docData.leaderRatingNote = leaderRatingNote;
        docData.lastSaved = new Date().toISOString();
        saveLocalSession(filename, docData);

        if (kpiDb) {
          try {
            await kpiDb.collection('sessions').updateOne({ filename }, { $set: { data: docData } });
          } catch(e) {}
        }
        invalidateSummaryCache();
      }
      return sendJson(res, 200, { success: true, message: "Đã lưu đánh giá của Lãnh đạo" });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
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
        try {
          const sessionDocs = await kpiDb.collection('sessions').find({}).toArray();
          sessionDocs.forEach(doc => {
            if (doc.filename && doc.data) {
              exportData.sessions[doc.filename] = sanitizeSessionData(doc.data);
            }
          });
        } catch(e) {}
      }
      if (Object.keys(exportData.sessions).length === 0) {
        const local = getAllLocalSessions();
        for (const [k, v] of Object.entries(local)) {
          exportData.sessions[k] = sanitizeSessionData(v);
        }
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

  // --- API Nạp toàn bộ dữ liệu từ tệp cục bộ lên MongoDB Cloud / Local (Import All) ---
  if (pathname === '/api/backup/import-all' && req.method === 'POST') {
    const adminOfficerId = searchParams.get('adminOfficerId');
    const adminKey = req.headers['x-admin-key'] || searchParams.get('adminKey');
    const configuredKey = process.env.ADMIN_SECRET_KEY || 'kbxv_ktnn_admin_secret_2026_secure';
    const isAuthorized = isAuthorAuthorizedMachine() || (adminKey === configuredKey && adminOfficerId === 'hoang');
    if (!isAuthorized) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Thao tác nạp dữ liệu bị từ chối do thiếu khóa Admin Key bảo vệ!" });
    }
    try {
      let importData = null;
      if (req.body && typeof req.body === 'object' && (req.body.sessions || req.body.officers_config)) {
        importData = req.body;
      } else {
        const buffer = await parseRawBody(req);
        let jsonStr = '';
        try {
          jsonStr = zlib.gunzipSync(buffer).toString('utf8');
        } catch(e) {
          jsonStr = buffer.toString('utf8');
        }
        importData = JSON.parse(jsonStr);
      }
      if (!importData.sessions) {
        return sendJson(res, 400, { success: false, error: "Tệp dữ liệu không hợp lệ" });
      }

      let count = 0;
      // Luôn ghi đè vào thư mục cục bộ data/
      for (const [fname, sess] of Object.entries(importData.sessions)) {
        const cleanSess = sanitizeSessionData(sess);
        saveLocalSession(fname, cleanSess);
        count++;
      }
      if (importData.officers_config) {
        saveLocalOfficers(importData.officers_config);
      }
      if (importData.auth_passwords) {
        saveLocalAuth(importData.auth_passwords);
      }

      if (kpiDb) {
        try {
          const sessionsCol = kpiDb.collection('sessions');
          for (const [fname, sess] of Object.entries(importData.sessions)) {
            const cleanSess = sanitizeSessionData(sess);
            await sessionsCol.updateOne({ filename: fname }, { $set: { filename: fname, data: cleanSess } }, { upsert: true });
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
        } catch (e) {}
      }

      invalidateSummaryCache();
      console.log(`[IMPORT CLOUD] Đã nạp thành công ${count} phiên dữ liệu lên MongoDB từ file máy tính.`);
      return sendJson(res, 200, { success: true, count, message: `Đã nạp thành công dữ liệu ${count} cán bộ lên hệ thống Cloud từ file máy tính!` });
    } catch(err) {
      return sendJson(res, 500, { success: false, error: "Lỗi nạp dữ liệu: " + err.message });
    }
  }

  // --- API Nạp phân đoạn dữ liệu (Import Chunk) tối ưu cho Vercel Serverless (< 4.5MB) ---
  if (pathname === '/api/backup/import-chunk' && req.method === 'POST') {
    const adminOfficerId = searchParams.get('adminOfficerId');
    const adminKey = req.headers['x-admin-key'] || searchParams.get('adminKey');
    const configuredKey = process.env.ADMIN_SECRET_KEY || 'kbxv_ktnn_admin_secret_2026_secure';
    const isAuthorized = isAuthorAuthorizedMachine() || (adminKey === configuredKey && adminOfficerId === 'hoang');
    if (!isAuthorized) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Thao tác nạp dữ liệu bị từ chối do thiếu khóa Admin Key bảo vệ!" });
    }
    try {
      const payload = await parseJsonBody(req);
      const { chunkType, officers_config, auth_passwords, sessions } = payload;
      let count = 0;

      // 1. Nạp cấu hình cán bộ và mật khẩu (nếu có)
      if (officers_config && typeof officers_config === 'object') {
        saveLocalOfficers(officers_config);
        if (kpiDb) {
          try {
            const configCol = kpiDb.collection('officers_config');
            for (const [id, cfg] of Object.entries(officers_config)) {
              await configCol.updateOne({ id }, { $set: cfg }, { upsert: true });
            }
          } catch (e) {}
        }
      }
      if (auth_passwords && typeof auth_passwords === 'object') {
        saveLocalAuth(auth_passwords);
        if (kpiDb) {
          try {
            await saveAuthPasswords(auth_passwords);
          } catch (e) {}
        }
      }

      // 2. Nạp lô hồ sơ cán bộ (sessions chunk)
      if (sessions && typeof sessions === 'object') {
        const entries = Object.entries(sessions);
        for (const [fname, sess] of entries) {
          const cleanSess = sanitizeSessionData(sess);
          saveLocalSession(fname, cleanSess);
          count++;
        }
        if (kpiDb) {
          try {
            const sessionsCol = kpiDb.collection('sessions');
            for (const [fname, sess] of entries) {
              const cleanSess = sanitizeSessionData(sess);
              await sessionsCol.updateOne({ filename: fname }, { $set: { filename: fname, data: cleanSess } }, { upsert: true });
            }
          } catch (e) {}
        }
      }

      invalidateSummaryCache();
      return sendJson(res, 200, {
        success: true,
        count,
        message: `Đã nạp thành công ${count} hồ sơ cán bộ!`
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: "Lỗi nạp phân đoạn: " + err.message });
    }
  }

  // --- API Kiểm tra thống kê dung lượng MongoDB Atlas ---
  if (pathname === '/api/admin/db-stats' && req.method === 'GET') {
    const adminOfficerId = searchParams.get('adminOfficerId');
    if (adminOfficerId !== 'hoang') {
      return sendJson(res, 403, { success: false, error: "Chỉ quản trị viên mới có quyền tra cứu!" });
    }
    try {
      if (!dbClient) {
        return sendJson(res, 500, { success: false, error: "Chưa kết nối CSDL MongoDB" });
      }
      const adminDb = dbClient.db().admin();
      const connStatus = await adminDb.command({ connectionStatus: 1 });
      const dbsList = await adminDb.listDatabases();
      
      const candidateNames = [
        'kpi_ktnn_db', 'vtvl_ktnn', 'chibo', 'chibo_db', 'qltk', 'qltk_db', 'kpi_kbnn_kvxv', 'test',
        'sample_mflix', 'sample_airbnb', 'sample_weatherdata', 'sample_restaurants', 
        'sample_training', 'sample_supplies', 'sample_analytics', 'sample_geospatial', 'sample_guides'
      ];
      const allFoundDbs = new Set(dbsList.databases.map(d => d.name));
      for (const cand of candidateNames) {
        try {
          const testCols = await dbClient.db(cand).listCollections().toArray();
          if (testCols && testCols.length > 0) {
            allFoundDbs.add(cand);
          }
        } catch (e) {}
      }

      const report = {
        authenticatedUser: connStatus.authInfo,
        totalSizeOnDiskMB: (dbsList.totalSize / (1024 * 1024)).toFixed(2),
        databases: []
      };
      for (const dbName of allFoundDbs) {
        const curDb = dbClient.db(dbName);
        let dbStats = null;
        try { dbStats = await curDb.command({ dbStats: 1 }); } catch (e) {}

        const colList = await curDb.listCollections().toArray();
        const collections = [];
        for (const col of colList) {
          try {
            const stats = await curDb.command({ collStats: col.name });
            collections.push({
              name: col.name,
              count: stats.count,
              sizeMB: Number((stats.size / (1024 * 1024)).toFixed(2)),
              storageSizeMB: Number((stats.storageSize / (1024 * 1024)).toFixed(2)),
              avgObjSizeKB: Number((stats.avgObjSize / 1024).toFixed(2))
            });
          } catch (e) {
            const count = await curDb.collection(col.name).countDocuments();
            collections.push({ name: col.name, count, error: e.message });
          }
        }
        report.databases.push({
          name: dbName,
          dataSizeMB: dbStats ? Number((dbStats.dataSize / (1024 * 1024)).toFixed(2)) : null,
          storageSizeMB: dbStats ? Number((dbStats.storageSize / (1024 * 1024)).toFixed(2)) : null,
          collections
        });
      }
      // Kiểm tra xem CSDL có đang bị chặn ghi (Write Quota Exceeded) hay không
      let writeStatus = { canWrite: false };
      try {
        const testCol = kpiDb.collection('_test_quota');
        await testCol.insertOne({ test: 1, at: new Date() });
        await testCol.deleteOne({ test: 1 });
        writeStatus = { canWrite: true, message: "MongoDB Atlas vẫn cho phép ghi dữ liệu bình thường, chưa bị khóa!" };
      } catch (wErr) {
        writeStatus = { canWrite: false, error: wErr.message };
      }

      return sendJson(res, 200, { success: true, writeStatus, report });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- API Tối ưu hóa & Thu gọn CSDL MongoDB Atlas (Giải phóng vùng đệm WiredTiger) ---
  if (pathname === '/api/admin/reclaim-storage' && (req.method === 'POST' || req.method === 'GET')) {
    const adminOfficerId = searchParams.get('adminOfficerId');
    if (adminOfficerId !== 'hoang') {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên (Hoàng) mới có quyền thực hiện!" });
    }
    if (!kpiDb) {
      return sendJson(res, 500, { success: false, error: "Chưa kết nối CSDL MongoDB" });
    }
    try {
      console.log("[RECLAIM STORAGE] Bắt đầu quá trình tối ưu và làm sạch bộ nhớ đệm WiredTiger...");
      
      // 1. Sao lưu toàn bộ dữ liệu hiện thời vào RAM
      const oldSessions = await kpiDb.collection('sessions').find({}).toArray();
      const oldConfigs = await kpiDb.collection('officers_config').find({}).toArray();
      const oldAuth = await kpiDb.collection('auth_passwords').find({}).toArray();

      if (!oldSessions || oldSessions.length === 0) {
        return sendJson(res, 400, { success: false, error: "Không tìm thấy dữ liệu sessions để làm sạch!" });
      }

      // Tinh gọn dữ liệu sessions (loại bỏ trường đệm quartersData thừa)
      const cleanSessions = oldSessions.map(doc => {
        return {
          filename: doc.filename,
          data: sanitizeSessionData(doc.data),
          updatedAt: doc.updatedAt || new Date().toISOString()
        };
      });

      // 2. Drop collections cũ để WiredTiger giải phóng các file .wt phình to trên đĩa AWS
      try { await kpiDb.collection('session_snapshots').drop(); } catch (e) {}
      try { await kpiDb.collection('sessions').drop(); } catch (e) {}

      // 3. Tái tạo collection và index chuẩn
      const newSessionsCol = kpiDb.collection('sessions');
      await newSessionsCol.createIndex({ filename: 1 }, { unique: true });

      // Nạp lại dữ liệu tinh gọn vào sessions
      if (cleanSessions.length > 0) {
        await newSessionsCol.insertMany(cleanSessions);
      }

      // Tái tạo index cho snapshots
      const newSnapCol = kpiDb.collection('session_snapshots');
      await newSnapCol.createIndex({ filename: 1, savedAt: -1 });

      // 4. Xóa bộ đệm RAM
      invalidateSummaryCache();

      // 5. Lấy thống kê sau khi làm sạch
      const dbStats = await kpiDb.command({ dbStats: 1 });

      const result = {
        success: true,
        message: `ĐÃ TỐI ƯU HÓA THÀNH CÔNG! Đã giải phóng hoàn toàn vùng đệm thừa trên MongoDB Atlas cho ${cleanSessions.length} hồ sơ cán bộ.`,
        restoredCount: cleanSessions.length,
        newDataSizeMB: Number((dbStats.dataSize / (1024 * 1024)).toFixed(2)),
        newStorageSizeMB: Number((dbStats.storageSize / (1024 * 1024)).toFixed(2))
      };

      console.log(`[RECLAIM STORAGE SUCCESS] Hoàn tất! Dung lượng mới: ${result.newStorageSizeMB} MB`);
      return sendJson(res, 200, result);
    } catch (err) {
      console.error("[RECLAIM STORAGE ERROR]", err);
      return sendJson(res, 500, { success: false, error: "Lỗi thu gọn CSDL: " + err.message });
    }
  }

  // --- API Dọn dẹp các phiên ảo Quý I, Quý II, Quý IV sinh ra do mở nhầm / lưu tự động mẫu cũ ---
  if (pathname === '/api/admin/clean-dummy-quarters' && (req.method === 'POST' || req.method === 'GET')) {
    const adminOfficerId = searchParams.get('adminOfficerId');
    if (adminOfficerId !== 'hoang') {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên (Hoàng) mới có quyền thực hiện!" });
    }
    if (!kpiDb) {
      return sendJson(res, 500, { success: false, error: "Chưa kết nối CSDL MongoDB" });
    }
    try {
      console.log("[CLEAN DUMMY QUARTERS] Bắt đầu rà soát các phiên ảo phi-Quý III...");
      
      // 1. Lấy danh sách tất cả sessions hiện tại
      const allSessions = await kpiDb.collection('sessions').find({}).toArray();
      const totalBefore = allSessions.length;

      // 2. Phân loại: Giữ lại TUYỆT ĐỐI 100% các file Quý III (bất kể định dạng chữ hoa/thường, có/không dấu)
      const q3Docs = [];
      const dummyDocs = [];

      for (const s of allSessions) {
        const fn = (s.filename || '').toLowerCase();
        if (fn.includes('quyiii') || fn.includes('quýiii') || fn.includes('quý iii') || fn.includes('quy iii')) {
          q3Docs.push(s.filename);
        } else {
          dummyDocs.push(s.filename);
        }
      }

      console.log(`[CLEAN DUMMY QUARTERS] Tìm thấy ${q3Docs.length} hồ sơ Quý III cần BẢO TOÀN TUYỆT ĐỐI, và ${dummyDocs.length} hồ sơ ảo cần dọn dẹp.`);

      // 3. Xóa các dummy sessions khỏi collection 'sessions' và 'session_snapshots'
      let deletedSessionsCount = 0;
      let deletedSnapshotsCount = 0;

      if (dummyDocs.length > 0) {
        const delRes = await kpiDb.collection('sessions').deleteMany({ filename: { $in: dummyDocs } });
        deletedSessionsCount = delRes.deletedCount || 0;

        try {
          const snapDelRes = await kpiDb.collection('session_snapshots').deleteMany({ filename: { $in: dummyDocs } });
          deletedSnapshotsCount = snapDelRes.deletedCount || 0;
        } catch (e) {
          console.warn("[CLEAN DUMMY QUARTERS] Lỗi xóa snapshots:", e.message);
        }
      }

      // 4. Xóa các file ảo tương ứng trên ổ đĩa local (data/sessions) nếu có
      let localDeletedCount = 0;
      try {
        const sessionsDir = path.join(__dirname, 'data', 'sessions');
        if (fs.existsSync(sessionsDir)) {
          const localFiles = fs.readdirSync(sessionsDir);
          for (const lf of localFiles) {
            const lfn = lf.toLowerCase();
            if (!lfn.includes('quyiii') && !lfn.includes('quýiii') && !lfn.includes('quý iii') && !lfn.includes('quy iii') && lf.endsWith('.json')) {
              try { fs.unlinkSync(path.join(sessionsDir, lf)); localDeletedCount++; } catch (e) {}
            }
          }
        }
      } catch (e) {
        console.warn("[CLEAN DUMMY QUARTERS] Lỗi dọn file local:", e.message);
      }

      // 5. Làm mới bộ đệm RAM để API Summary phản ánh ngay lập tức
      invalidateSummaryCache();

      // 6. Kiểm tra lại số lượng còn lại
      const totalAfter = await kpiDb.collection('sessions').countDocuments();

      return sendJson(res, 200, {
        success: true,
        message: `ĐÃ DỌN DẸP SẠCH TOÀN BỘ ${deletedSessionsCount} PHIÊN ẢO KHÔNG PHẢI QUÝ III! Dữ liệu Quý III (${totalAfter} bản ghi) được bảo toàn 100%.`,
        totalBefore,
        deletedSessionsCount,
        deletedSnapshotsCount,
        localDeletedCount,
        deletedFilenames: dummyDocs,
        remainingQ3Count: totalAfter,
        protectedQ3FilenamesCount: q3Docs.length
      });
    } catch (err) {
      console.error("[CLEAN DUMMY QUARTERS ERROR]", err);
      return sendJson(res, 500, { success: false, error: "Lỗi dọn dẹp phiên ảo: " + err.message });
    }
  }

  // --- API Đặt lại (Reset) trạng thái hồ sơ của cán bộ về Chưa nộp / Bảng trắng ---
  if (pathname === '/api/admin/reset-officer-quarter' && (req.method === 'POST' || req.method === 'GET')) {
    const adminOfficerId = searchParams.get('adminOfficerId');
    const targetOfficerId = searchParams.get('officerId');
    const targetQuarter = searchParams.get('quarter') || "Quý I";
    const targetYear = searchParams.get('year') || "2026";

    if (adminOfficerId !== 'hoang') {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên (Hoàng) mới có quyền thực hiện!" });
    }
    if (!targetOfficerId) {
      return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
    }

    const filename = getSessionFilename(targetOfficerId, targetQuarter, targetYear);
    try {
      if (kpiDb) {
        await kpiDb.collection('sessions').deleteOne({ filename });
        await kpiDb.collection('session_snapshots').deleteMany({ filename });
      }
      try {
        const localPath = path.join(SESSIONS_DIR, filename);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch(e) {}
      
      invalidateSummaryCache();
      return sendJson(res, 200, {
        success: true,
        message: `Đã reset thành công trạng thái của cán bộ [${targetOfficerId}] ${targetQuarter}/${targetYear} về Chưa nộp (0%).`,
        filename
      });
    } catch(err) {
      return sendJson(res, 500, { success: false, error: "Lỗi reset: " + err.message });
    }
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
      try {
        const docs = await kpiDb.collection('sessions').find({}, {
          projection: {
            filename: 1,
            "data.officer": 1,
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
        docs.forEach(d => {
          allSessionsMap[d.filename] = pickBestSession(allSessionsMap[d.filename], d.data);
        });
      } catch (e) {
        allSessionsMap = getAllLocalSessions();
      }
    }
    // HỢP NHẤT THÔNG MINH: Luôn chọn phiên có nhiều công việc hoàn thành nhất giữa MongoDB và Local
    const localSessions = getAllLocalSessions();
    for (const [fn, lData] of Object.entries(localSessions)) {
      allSessionsMap[fn] = pickBestSession(allSessionsMap[fn], lData);
    }

    for (const off of officersList) {
      const filename = getSessionFilename(off.id, quarter, year);
      const safeQNoSpace = String(quarter).replace(/\s+/g, '');
      const altFilename = `${off.id}_${safeQNoSpace}_${year}.json`;
      const altFilename2 = `${off.id}_${normalizeQuarter(quarter)}_${year}.json`;

      let sess = pickBestSession(allSessionsMap[filename], allSessionsMap[altFilename], allSessionsMap[altFilename2]);

      // Fallback: Tìm theo metadata bên trong session nếu filename không khớp hoặc bản ghi rỗng
      if (countSessionActiveTasks(sess) === 0) {
        const normQ = normalizeQuarter(quarter);
        for (const [fn, sData] of Object.entries(allSessionsMap)) {
          if (fn.startsWith(off.id + '_') && sData && sData.officer) {
            const sQ = normalizeQuarter(sData.officer.quarter);
            const sY = String(sData.officer.year || 2026);
            if (sQ === normQ && sY === String(year)) {
              sess = pickBestSession(sess, sData);
            }
          }
        }
      }

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
        taskScore: 0, generalScore: 0, totalScore: 0,
        rating: "Chưa đánh giá",
        leaderRatingProposal: "",
        lastSaved: null
      };

      const activeTaskCountInSess = sess ? countSessionActiveTasks(sess) : 0;
      const isSessSubmitted = !!(sess && (sess.isSubmitted || sess.status === 'da_nop' || sess.status === 'da_duyet'));

      if (sess && (activeTaskCountInSess > 0 || isSessSubmitted)) {
        item.isSubmitted = isSessSubmitted;
        item.submittedAt = sess.submittedAt || null;
        item.approvedAt = sess.approvedAt || null;
        item.approvedBy = sess.approvedBy || null;
        item.rejectReason = sess.rejectReason || null;
        const isOfficerTP = (off.id === 'son' || off.role === 'TP');
        if (isOfficerTP) {
          // Trưởng phòng luôn là hồ sơ chính thức hoàn thành, không bao giờ là 'tra_lai' hay 'cho_duyet'
          item.isSubmitted = true;
          item.isApproved = true;
          item.status = "da_duyet";
          item.approvedBy = "Trưởng phòng (Chính thức)";
          item.rejectReason = null;
        } else {
          item.status = sess.status || (item.isSubmitted ? "da_nop" : "da_luu");
        }
        item.lastSaved = sess.lastSaved || null;

        let monthsArr = [];
        if (Array.isArray(sess.months)) {
          monthsArr = sess.months;
        } else if (sess.months && typeof sess.months === 'object') {
          monthsArr = Object.values(sess.months);
        }

        if (monthsArr.length > 0) {
          let sumPct = 0;
          let mCount = 0;
          monthsArr.forEach((m, idx) => {
            const hasRows = m && Array.isArray(m.rows) && m.rows.length > 0;
            const monthHasActive = hasRows
              ? m.rows.some(r => r && (r.co_thuchien === 'Có' || Number(r.soluong_tt) > 0 || Number(r.thuchien_thang) > 0))
              : true;
            let pct = monthHasActive ? Number(m.completionPercent) : 0;
            if (monthHasActive && (isNaN(pct) || pct === 0)) {
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
          item.avgPct = mCount > 0 ? Math.round((sumPct / monthsArr.length) * 10) / 10 : 0;
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
}

const server = http.createServer(handleKpiRequest);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log("============================================================================");
    if (process.env.STORAGE_MODE === 'local') {
      const displayIp = process.env.SERVER_IP || '10.41.96.41';
      console.log(" KBNN KHU VUC XV - HE THONG KPI PHONG KTNN (CHAY OFFLINE 100%)");
      console.log(` [+] Truy cap may chu noi bo: http://${displayIp}:${PORT}`);
    } else {
      console.log(" KBNN KHU VUC XV - KHO MONGODB CLOUD ĐÃ SẴN SÀNG");
      console.log(` [+] Truy cập trực tuyến: http://localhost:${PORT}`);
    }
    console.log("============================================================================");
  });
}

module.exports = handleKpiRequest;
module.exports.handleKpiRequest = handleKpiRequest;
module.exports.ensureMongoConnected = ensureMongoConnected;
module.exports.server = server;
module.exports.ensureLocalDataDirs = ensureLocalDataDirs;
module.exports.DATA_DIR = DATA_DIR;
module.exports.SESSIONS_DIR = SESSIONS_DIR;
module.exports.HTML_FILE = HTML_FILE;
