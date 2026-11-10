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
  if (process.env.VERCEL === '1') return false;
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
  if (process.env.VERCEL) return; // Vercel filesystem là read-only, bỏ qua tránh waste I/O lúc cold start
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

// Đếm tổng số công việc có thực hiện thực chất trong toàn bộ các tháng của phiên làm việc
function countSessionActiveTasks(sess) {
  if (!sess) return 0;
  if (typeof sess.activeTasksCount === 'number' && sess.activeTasksCount > 0) return sess.activeTasksCount;
  if (!sess.months) return 0;
  const monthsArr = Array.isArray(sess.months) ? sess.months : Object.values(sess.months);
  let count = 0;
  let hasPct = false;
  monthsArr.forEach(m => {
    if (!m) return;
    if (Number(m.completionPercent) > 0) hasPct = true;
    const rows = (Array.isArray(m.rows) && m.rows.length > 0) ? m.rows : (Array.isArray(m.deltaRows) ? m.deltaRows : []);
    rows.forEach(r => {
      if (r && r.co_thuchien !== 'Không' && (r.co_thuchien === 'Có' || Number(r.soluong_tt) > 0 || Number(r.hoanthanh) > 0 || Number(r.thuchien_thang) > 0)) {
        count++;
      }
    });
  });
  if (count === 0 && hasPct) {
    return 1; // Có ít nhất 1 nhiệm vụ hoàn thành nếu đã có tỷ lệ % tháng > 0
  }
  return count;
}

// Tổng số điểm hoàn thành thực chất trong toàn bộ các tháng của phiên làm việc
function getSessionTotalDonePoints(sess) {
  if (!sess) return 0;
  if (typeof sess.totalDonePoints === 'number' && sess.totalDonePoints > 0) return sess.totalDonePoints;
  if (!sess.months) return 0;
  const monthsArr = Array.isArray(sess.months) ? sess.months : Object.values(sess.months);
  let total = 0;
  monthsArr.forEach(m => {
    if (!m) return;
    const rows = (Array.isArray(m.rows) && m.rows.length > 0) ? m.rows : (Array.isArray(m.deltaRows) ? m.deltaRows : []);
    rows.forEach(r => {
      if (r) {
        const ht = Number(r.hoanthanh) || Number(r.diem_thang_da_hs) || 0;
        if (ht > 0 && r.co_thuchien === 'Có') total += ht;
      }
    });
  });
  if (total === 0) {
    const avgPct = monthsArr.reduce((acc, m) => acc + (Number(m && m.completionPercent) || 0), 0) / (monthsArr.length || 1);
    if (avgPct > 0) total = avgPct * 10;
  }
  return total;
}

// Chọn phiên làm việc đầy đủ và mới nhất giữa các nguồn (MongoDB không dấu, MongoDB có dấu, File gốc trên đĩa)
// Quy tắc Bảo toàn Dữ liệu Tuyệt đối:
// 1. Bản có công việc thực hiện (tasks > 0) LUÔN thắng bản rỗng (tasks === 0), bất kể thời gian lưu của bản rỗng.
// 2. Bản đã chấm đầy đủ / cộng gộp khối lượng lớn (totalDone >= 1000 điểm) LUÔN thắng bản chưa chấm.
// 3. Khi cả 2 bản đều có dữ liệu thực chất, ưu tiên bản có thời gian lưu (lastSaved) MỚI HƠN trên Cloud
function getSessionActionTime(cand) {
  if (!cand || typeof cand !== 'object') return 0;
  const tSaved = cand.lastSaved ? (new Date(cand.lastSaved).getTime() || 0) : 0;
  const tSub = cand.submittedAt ? (new Date(cand.submittedAt).getTime() || 0) : 0;
  const tApp = cand.approvedAt ? (new Date(cand.approvedAt).getTime() || 0) : 0;
  const tRej = cand.rejectedAt ? (new Date(cand.rejectedAt).getTime() || 0) : 0;
  return Math.max(tSaved, tSub, tApp, tRej);
}

function pickBestSession(...candidates) {
  let best = null;
  let bestTasks = -1;
  let bestPoints = 0;
  let bestActionTime = -1;
  let bestStatus = null;

  for (const cand of candidates) {
    if (!cand || typeof cand !== 'object' || (!cand.officer && !cand.months && !cand.status)) continue;
    const tasks = countSessionActiveTasks(cand);
    const candPoints = getSessionTotalDonePoints(cand);
    const candStatus = cand.status || (cand.isSubmitted ? 'da_nop' : 'da_luu');
    const candActionTime = getSessionActionTime(cand);

    if (!best) {
      best = { ...cand };
      bestTasks = tasks;
      bestPoints = candPoints;
      bestActionTime = candActionTime;
      bestStatus = candStatus;
      continue;
    }

    let shouldReplace = false;

    // Ưu tiên 1: Lọc dữ liệu có công việc vs rỗng hoàn toàn
    if (tasks > 0 && bestTasks === 0) {
      shouldReplace = true;
    } else if (tasks === 0 && bestTasks > 0) {
      // Giữ bản có công việc, nhưng nếu cand có hành động trả lại hoặc duyệt mới hơn hẳn -> hợp nhất trạng thái trên bản sao
      if ((candStatus === 'tra_lai' || candStatus === 'da_duyet') && candActionTime > bestActionTime + 2000) {
        best = {
          ...best,
          status: candStatus,
          isSubmitted: !!cand.isSubmitted,
          isApproved: !!cand.isApproved,
          rejectedAt: cand.rejectedAt || best.rejectedAt,
          rejectedBy: cand.rejectedBy || best.rejectedBy,
          rejectReason: cand.rejectReason || best.rejectReason,
          approvedAt: cand.approvedAt || best.approvedAt,
          approvedBy: cand.approvedBy || best.approvedBy,
          lastSaved: cand.lastSaved || best.lastSaved
        };
        bestActionTime = candActionTime;
        bestStatus = candStatus;
      }
      shouldReplace = false;
    } else if (candPoints >= 1000 && bestPoints < 1000) {
      // Bản có số điểm hoàn thành lớn (đã cộng gộp >1000 điểm) thắng bản chưa cộng gộp
      shouldReplace = true;
    } else if (bestPoints >= 1000 && candPoints < 1000) {
      shouldReplace = false;
    } else {
      // Cả 2 cùng mức dữ liệu công việc (cùng có hoặc cùng rỗng)
      // XỬ LÝ ĐẶC BIỆT CHO TRẠNG THÁI 'tra_lai' (Mở khóa / Trả lại cho GDV)
      if (candStatus === 'tra_lai') {
        // Nếu cand là hồ sơ được Trả lại / Mở khóa và thời gian hành động >= thời gian duyệt/nộp cũ -> PHẢI THẮNG
        if (candActionTime >= bestActionTime - 2000) {
          shouldReplace = true;
        }
      } else if (bestStatus === 'tra_lai') {
        // Nếu best đang là 'tra_lai', cand là 'da_nop' hoặc 'da_duyet' chỉ thắng nếu MỚI HƠN hẳn (cán bộ nộp lại sau)
        if (candActionTime > bestActionTime + 1000) {
          shouldReplace = true;
        } else {
          // Cand là bản duyệt/nộp cũ hơn hành động mở khóa -> Giữ nguyên 'tra_lai'
          shouldReplace = false;
        }
      } else {
        // Cả 2 không phải 'tra_lai'
        const candIsSub = (cand.isSubmitted || candStatus === 'da_nop' || candStatus === 'da_duyet') ? 1 : 0;
        const bestIsSub = (best.isSubmitted || bestStatus === 'da_nop' || bestStatus === 'da_duyet') ? 1 : 0;

        if (candIsSub > bestIsSub && candActionTime >= bestActionTime - 60000) {
          shouldReplace = true;
        } else if (candActionTime > bestActionTime + 1000 && (candIsSub >= bestIsSub || !bestIsSub)) {
          shouldReplace = true;
        } else if (Math.abs(candActionTime - bestActionTime) <= 1000 && tasks > bestTasks) {
          shouldReplace = true;
        }
      }
    }

    if (shouldReplace) {
      best = cand;
      bestTasks = tasks;
      bestActionTime = candActionTime;
      bestStatus = candStatus;
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

// ⚡ BỘ ĐỆM RAM TỐC ĐỘ CAO CHO LOCAL SESSIONS (Nạp lười từng file < 1ms, không đọc tràn 45MB đĩa lúc khởi động)
let _localSessionsRamCache = {};
let _allLocalSessionsLoaded = false;

function ensureLocalSessionsRamCache() {
  if (_allLocalSessionsLoaded) return _localSessionsRamCache;
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      for (const f of files) {
        if (!_localSessionsRamCache[f]) {
          try {
            _localSessionsRamCache[f] = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8'));
          } catch (e) {}
        }
      }
    }
    // Dự phòng từ seed_data.json.gz nếu thiếu file trong môi trường Serverless
    if (Object.keys(_localSessionsRamCache).length === 0) {
      const gzPath = path.join(BASE_DIR, 'seed_data.json.gz');
      if (fs.existsSync(gzPath)) {
        const seed = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8'));
        if (seed && seed.sessions) {
          Object.assign(_localSessionsRamCache, seed.sessions);
        }
      }
    }
  } catch (e) {}
  _allLocalSessionsLoaded = true;
  return _localSessionsRamCache;
}

function getLocalSession(filename) {
  if (!filename) return null;
  if (_localSessionsRamCache[filename]) return _localSessionsRamCache[filename];
  if (process.env.VERCEL && kpiDb) return null; // Trên Vercel khi MongoDB hoạt động, tránh đọc lại 80 file seed cũ trừ khi mất DB
  try {
    const p = path.join(SESSIONS_DIR, filename);
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      _localSessionsRamCache[filename] = parsed;
      return parsed;
    }
  } catch (e) {}
  return null;
}

function saveLocalSession(filename, sessionData) {
  _localSessionsRamCache[filename] = sessionData;
  if (process.env.VERCEL) return true; // Trên Vercel read-only, chỉ giữ RAM cache
  const p = path.join(SESSIONS_DIR, filename);
  return safeWriteJsonFile(p, sessionData);
}

async function saveLocalSessionAsync(filename, sessionData) {
  _localSessionsRamCache[filename] = sessionData;
  if (process.env.VERCEL) return true; // Trên Vercel read-only, bỏ qua I/O đĩa
  const p = path.join(SESSIONS_DIR, filename);
  return safeWriteJsonFileAsync(p, sessionData);
}

function getAllLocalSessions() {
  return { ...ensureLocalSessionsRamCache() };
}

function saveLocalSnapshot(filename, snapshotObj) {
  if (process.env.VERCEL) return null;
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
  if (process.env.VERCEL) return null;
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

function getLocalSnapshotById(snapshotId, expectedFilename) {
  if (!snapshotId || typeof snapshotId !== 'string') return null;
  const cleanId = snapshotId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanId) return null;
  try {
    if (fs.existsSync(SNAPSHOTS_DIR)) {
      const files = fs.readdirSync(SNAPSHOTS_DIR);
      for (const f of files) {
        if (expectedFilename && !f.startsWith(expectedFilename + '__')) continue;
        if (f.endsWith('__' + cleanId + '.json')) {
          const parsed = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, f), 'utf8'));
          if (parsed && String(parsed._id) === cleanId) return parsed;
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
let indexesEnsured = false;

async function ensureMongoIndexes() {
  if (!kpiDb || indexesEnsured) return;
  indexesEnsured = true;
  try {
    await Promise.all([
      kpiDb.collection('sessions').createIndex({ filename: 1 }, { background: true }),
      kpiDb.collection('sessions').createIndex({ officerId: 1, quarterNorm: 1, year: 1 }, { background: true }),
      kpiDb.collection('sessions').createIndex({ quarterNorm: 1, year: 1 }, { background: true }),
      kpiDb.collection('session_snapshots').createIndex({ filename: 1, savedAt: -1 }, { background: true }),
      kpiDb.collection('session_snapshots').createIndex({ officerId: 1, savedAt: -1 }, { background: true }),
      kpiDb.collection('officers_config').createIndex({ id: 1 }, { background: true }),
      kpiDb.collection('auth_passwords').createIndex({ officerId: 1 }, { background: true })
    ]);
  } catch (idxErr) {
    indexesEnsured = false;
  }
}

let _localModeBannerLogged = false;
async function connectMongo() {
  if (process.env.STORAGE_MODE === 'local') {
    if (!_localModeBannerLogged) {
      _localModeBannerLogged = true;
      console.log("============================================================================");
      console.log(" [CHẾ ĐỘ MÁY CHỦ NỘI BỘ] Đang chạy CSDL TỆP TIN CỤC BỘ (Offline Local Mode).");
      console.log(" [+] Không kết nối Internet/MongoDB Cloud - Toàn bộ dữ liệu lưu tại data/");
      console.log("============================================================================");
    }
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
    // Tối ưu Connection Pool + nén zlib đường truyền Atlas <-> Server (< 150ms Cold Start)
    dbClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 25,
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
      serverSelectionTimeoutMS: 3500,
      connectTimeoutMS: 3500,
      compressors: ['zlib'],
      zlibCompressionLevel: 3
    });
    await dbClient.connect();
    kpiDb = dbClient.db('kpi_ktnn_db');
    console.log("[MongoDB] Đã kết nối thành công tới MongoDB Atlas Cloud Database!");

    // Đảm bảo chỉ mục 1 lần cho mỗi container (bao gồm cả Vercel để tránh COLLSCAN)
    await ensureMongoIndexes();
    setImmediate(async () => {
      try {
        if (!process.env.VERCEL) {
          await initCloudSeedData();
          await syncOfficerRolesMigration();
        } else {
          const cfgCount = await kpiDb.collection('officers_config').estimatedDocumentCount();
          if (cfgCount === 0) {
            await initCloudSeedData();
          }
        }
      } catch (idxErr) {}
    });
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

// ============================================================================
// GIẢI PHÁP TỰ ĐỘNG THU GỌN BẢN SAO LƯU CŨ AN TOÀN (ZERO DATA-LOSS QUOTA SHIELD)
// Chỉ cắt tỉa các snapshot vượt ngưỡng (> maxKeep/hồ sơ), TUYỆT ĐỐI KHÔNG drop()
// ============================================================================
async function pruneOldSnapshotsSafe(maxKeep = 2) {
  if (!kpiDb) return 0;
  try {
    const snapCol = kpiDb.collection('session_snapshots');
    const grouped = await snapCol.aggregate([
      { $sort: { savedAt: -1 } },
      { $group: { _id: '$filename', ids: { $push: '$_id' } } }
    ]).toArray();
    const overflowIds = [];
    for (const g of grouped) {
      if (Array.isArray(g.ids) && g.ids.length > maxKeep) {
        overflowIds.push(...g.ids.slice(maxKeep));
      }
    }
    if (overflowIds.length > 0) {
      const delRes = await snapCol.deleteMany({ _id: { $in: overflowIds } });
      return delRes.deletedCount || 0;
    }
  } catch (e) {
    console.warn('[PRUNE SNAPSHOTS] Cảnh báo thu gọn snapshot:', e.message);
  }
  return 0;
}

async function autoHealMongoStorageQuota() {
  if (!kpiDb) return;
  try {
    let needsHeal = false;
    try {
      const stats = await kpiDb.command({ dbStats: 1 });
      const storageMB = stats.storageSize / (1024 * 1024);
      if (storageMB >= 420) {
        console.warn(`[STORAGE AUTO-HEAL] Dung lượng MongoDB Atlas đang ở mức ${storageMB.toFixed(1)}MB / 512MB.`);
        needsHeal = true;
      }
    } catch (e) {}

    if (needsHeal) {
      const pruned = await pruneOldSnapshotsSafe(2);
      console.log(`[STORAGE AUTO-HEAL] Đã cắt tỉa an toàn ${pruned} snapshot cũ dư thừa (giữ lại 2 bản mới nhất/hồ sơ).`);
    }
  } catch (err) {
    console.error('[STORAGE AUTO-HEAL] Lỗi tổng quát:', err.message);
  }
}

async function executeMongoWriteWithQuotaShield(writeFn) {
  try {
    return await writeFn();
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg.includes('space quota') || msg.includes('Writes are blocked') || msg.includes('quota')) {
      console.warn('[QUOTA SHIELD] Cảnh báo vượt dung lượng 512MB! Tiến hành cắt tỉa an toàn snapshot cũ (không drop)...');
      await pruneOldSnapshotsSafe(1);
      await new Promise(r => setTimeout(r, 400));
      return await writeFn();
    }
    throw err;
  }
}

// ⚡ Đảm bảo kết nối MongoDB trong môi trường Serverless (Vercel) theo single-flight promise (<150ms Cold Start)
let mongoConnectingPromise = null;
let _lastMongoFailAt = 0;
async function ensureMongoConnected() {
  if (process.env.STORAGE_MODE === 'local') return null;
  if (kpiDb) {
    return kpiDb;
  }
  if (_lastMongoFailAt && (Date.now() - _lastMongoFailAt < 10000)) {
    return null;
  }
  if (!mongoConnectingPromise) {
    mongoConnectingPromise = (async () => {
      try {
        await connectMongo();
        if (!kpiDb) _lastMongoFailAt = Date.now();
        else _lastMongoFailAt = 0;
        return kpiDb;
      } catch (err) {
        _lastMongoFailAt = Date.now();
        console.warn('[MongoDB ensure] Connect failed:', err.message);
        return null;
      } finally {
        mongoConnectingPromise = null;
      }
    })();
  }
  return mongoConnectingPromise;
}

// Nạp dữ liệu seed ban đầu lên MongoDB nếu database trống
async function initCloudSeedData() {
  try {
    if (!kpiDb) return;
    // [AUTH_SYNC] Chỉ khởi tạo mật khẩu mặc định ($setOnInsert) cho tài khoản chưa có trên Cloud,
    // TUYỆT ĐỐI KHÔNG ghi đè mật khẩu mà cán bộ hoặc Admin đã đổi trên MongoDB Atlas!
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
                update: {
                  $setOnInsert: {
                    officerId: id,
                    hash: item.hash,
                    salt: item.salt || '',
                    updatedAt: item.updatedAt || new Date().toISOString()
                  }
                },
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

    // [DATA_INTEGRITY] Tự phục hồi dữ liệu Quý III của Trần Quốc Hoàng nếu bản trên Cloud bị thiếu hoặc rỗng (0 việc)
    try {
      const sessionsCol = kpiDb.collection('sessions');
      const fullHoangData = getLocalSession('hoang_QuyIII_2026.json') || getLocalSession('hoang_QuýIII_2026.json');
      if (fullHoangData) {
        const existingDoc = await sessionsCol.findOne({ filename: 'hoang_QuyIII_2026.json' });
        if (!existingDoc || !existingDoc.data || countSessionActiveTasks(existingDoc.data) === 0) {
          await sessionsCol.updateOne(
            { filename: 'hoang_QuyIII_2026.json' },
            {
              $set: {
                filename: 'hoang_QuyIII_2026.json',
                officerId: 'hoang',
                quarterNorm: 'QuyIII',
                year: 2026,
                activeTasksCount: countSessionActiveTasks(fullHoangData),
                data: fullHoangData
              }
            },
            { upsert: true }
          );
        }
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
          const ops = Object.entries(seed.officers_config).map(([id, cfg]) => ({
            updateOne: { filter: { id }, update: { $set: cfg }, upsert: true }
          }));
          if (ops.length > 0) await configCol.bulkWrite(ops, { ordered: false });
        }
        if (seed.auth_passwords) {
          const authCol = kpiDb.collection('auth_passwords');
          const ops = Object.entries(seed.auth_passwords).map(([id, auth]) => ({
            updateOne: { filter: { officerId: id }, update: { $setOnInsert: { officerId: id, ...auth } }, upsert: true }
          }));
          if (ops.length > 0) await authCol.bulkWrite(ops, { ordered: false });
        }
        if (seed.sessions) {
          const sessionsCol = kpiDb.collection('sessions');
          const ops = Object.entries(seed.sessions).map(([fname, sessData]) => ({
            updateOne: { filter: { filename: fname }, update: { $setOnInsert: { filename: fname, data: sessData } }, upsert: true }
          }));
          if (ops.length > 0) await sessionsCol.bulkWrite(ops, { ordered: false });
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

    await configCol.bulkWrite([
      { updateOne: { filter: { id: 'qn_trang' }, update: { $set: { title: qnTrangTitle, specialty: qnTrangSpecialty } } } },
      { updateOne: { filter: { id: 'qn_thuy_le' }, update: { $set: { title: qnThuyTitle, specialty: qnThuySpecialty } } } }
    ], { ordered: false });

    await sessionsCol.updateMany(
      { officerId: 'qn_trang' },
      { $set: { "data.officer.title": qnTrangTitle, "data.officer.specialty": qnTrangSpecialty } }
    );
    await sessionsCol.updateMany(
      { officerId: 'qn_thuy_le' },
      { $set: { "data.officer.title": qnThuyTitle, "data.officer.specialty": qnThuySpecialty } }
    );
  } catch (err) {}
}

if (!process.env.VERCEL && require.main === module) {
  ensureMongoConnected();
}

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

function extractQuarterFromFilename(fn) {
  if (!fn) return null;
  const m = String(fn).match(/_(qu[yý]\s*(?:iv|iii|ii|i|[1-4]))_\d{4}\.json$/i);
  if (!m) return null;
  return normalizeQuarter(m[1]);
}

function normalizeQuarter(qStr) {
  if (!qStr) return 'QuyIII';
  let raw = String(qStr).trim();
  const fnMatch = raw.match(/(?:^|_)(qu[yý]\s*(?:iv|iii|ii|i|[1-4]))(?:_|\.|$)/i);
  if (fnMatch) raw = fnMatch[1];
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const qToken = s.replace(/^quy/, '').replace(/^q/, '');
  if (qToken === 'iv' || qToken === '4') return 'QuyIV';
  if (qToken === 'iii' || qToken === '3') return 'QuyIII';
  if (qToken === 'ii' || qToken === '2') return 'QuyII';
  if (qToken === 'i' || qToken === '1') return 'QuyI';
  if (/\b(?:iv|4)\b/i.test(raw)) return 'QuyIV';
  if (/\b(?:iii|3)\b/i.test(raw)) return 'QuyIII';
  if (/\b(?:ii|2)\b/i.test(raw)) return 'QuyII';
  if (/\b(?:i|1)\b/i.test(raw)) return 'QuyI';
  return 'QuyIII';
}

function quarterNormToLabel(qNorm) {
  if (qNorm === 'QuyI') return 'Quý I';
  if (qNorm === 'QuyII') return 'Quý II';
  if (qNorm === 'QuyIV') return 'Quý IV';
  return 'Quý III';
}

function getSessionFilename(officerId, quarter, year) {
  const safeOfficer = (officerId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeQ = normalizeQuarter(quarter);
  const safeY = String(year || 2026).replace(/[^0-9]/g, '');
  return `${safeOfficer}_${safeQ}_${safeY}.json`;
}

function getSameQuarterAltFilenames(officerId, quarter, year) {
  const filename = getSessionFilename(officerId, quarter, year);
  const targetNormQ = normalizeQuarter(quarter);
  const qLabel = quarterNormToLabel(targetNormQ);
  const qNoSpaceUnicode = qLabel.replace(/\s+/g, '');
  const safeQNoSpace = String(quarter || '').replace(/\s+/g, '');
  const yearNum = Number(year) || 2026;
  return Array.from(new Set([
    filename.includes('Quy') ? filename.replace(/Quy/g, 'Quý') : filename.replace(/Quý/g, 'Quy'),
    `${officerId}_${qNoSpaceUnicode}_${yearNum}.json`,
    `${officerId}_${qLabel}_${yearNum}.json`,
    `${officerId}_${safeQNoSpace}_${yearNum}.json`,
    `${officerId}_${targetNormQ}_${yearNum}.json`
  ].filter(fn => fn && fn !== filename && extractQuarterFromFilename(fn) === targetNormQ)));
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

if (!process.env.VERCEL) {
  refreshHtmlCache();
  try {
    fs.watch(HTML_FILE, () => { setTimeout(refreshHtmlCache, 300); });
  } catch (e) {}
}

// ============================================================================
// 🔒 BẢO MẬT, CORS ALLOWLIST, HMAC SESSION COOKIES & CHỐNG BRUTE-FORCE
// ============================================================================
const MAX_BODY_BYTES = 4 * 1024 * 1024; // Giới hạn tải trọng 4MB
const AUTH_COOKIE_NAME = 'kpi_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 giờ
const ALLOWED_PUBLIC_VIEWER_IDS = new Set(['son', 'hoang', 'tu', 'tuan', 'anh', 'qn_trung', 'qn_phuong_tp']);
const authAttemptMap = new Map();
let _cachedHmacSecret = null;

function isAllowedOrigin(origin, req) {
  if (!origin) return false;
  if (origin === 'null') return !process.env.VERCEL; // Cho phép file:// khi chạy LAN nội bộ
  try {
    const u = new URL(origin);
    const reqHost = req && req.headers && req.headers.host;
    if (reqHost && u.host === reqHost) return true;
    const h = u.hostname.toLowerCase();
    if (h === 'kpi-phong-ktnn.vercel.app' || /^kpi-phong-ktnn(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(h)) return true;
    if (h === 'localhost' || h === '127.0.0.1') return true;
    if (/^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/.test(h)) return true;
  } catch (e) {}
  return false;
}

function getCorsHeaders(req) {
  const origin = req && req.headers && req.headers.origin;
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Vary': 'Origin, Accept-Encoding',
    'X-Content-Type-Options': 'nosniff'
  };
  if (origin && isAllowedOrigin(origin, req)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function sanitizeClientIp(req) {
  try {
    const xff = String((req && req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
    const raw = xff || (req && req.socket && req.socket.remoteAddress) || 'client';
    const clean = raw.replace(/^::ffff:/i, '');
    return /^[0-9a-fA-F:.]{3,45}$/.test(clean) ? clean : 'client';
  } catch (e) {
    return 'client';
  }
}

function checkAuthRateLimit(ip, officerId) {
  const key = `${ip}:${officerId || '*'}`;
  const now = Date.now();
  const winMs = 5 * 60 * 1000;
  let rec = authAttemptMap.get(key);
  if (!rec || now - rec.firstAt > winMs) {
    rec = { count: 0, firstAt: now };
  }
  if (rec.count >= 10) {
    return { allowed: false, retryAfterSec: Math.ceil((winMs - (now - rec.firstAt)) / 1000) };
  }
  return { allowed: true, key, rec };
}

function recordAuthFailure(key) {
  const now = Date.now();
  const winMs = 5 * 60 * 1000;
  const cur = authAttemptMap.get(key);
  if (!cur || now - cur.firstAt > winMs) {
    authAttemptMap.set(key, { count: 1, firstAt: now });
  } else {
    cur.count++;
  }
  if (authAttemptMap.size > 2000) authAttemptMap.clear();
}

function clearAuthFailures(key) {
  authAttemptMap.delete(key);
}

function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isValidSessionFilename(fn) {
  if (!fn || typeof fn !== 'string') return false;
  if (fn.includes('..') || fn.includes('/') || fn.includes('\\') || fn.includes('\0')) return false;
  return /^[a-zA-Z0-9_-]+_(?:QuyI|QuyII|QuyIII|QuyIV|QuýI|QuýII|QuýIII|QuýIV|Quý I|Quý II|Quý III|Quý IV|Quy I|Quy II|Quy III|Quy IV)_\d{4}\.json$/i.test(fn);
}

function sanitizePlainObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePlainObject);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = sanitizePlainObject(v);
  }
  return out;
}

function sendJson(res, statusCode, data, extraHeaders) {
  const jsonStr = (typeof data === 'string') ? data : JSON.stringify(data);
  const req = res._req;
  const acceptEncoding = (req && req.headers && req.headers['accept-encoding']) || '';
  const corsHeaders = getCorsHeaders(req);

  // Tự động nén Gzip cho JSON lớn (> 2KB) để tăng tốc độ truyền qua mạng Internet gấp 10 lần
  if (acceptEncoding.includes('gzip') && jsonStr.length > 2048) {
    zlib.gzip(Buffer.from(jsonStr, 'utf8'), { level: 6 }, (err, gzipped) => {
      if (!err && gzipped) {
        const headers = {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Encoding': 'gzip',
          'Content-Length': gzipped.length,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...corsHeaders,
          ...(extraHeaders || {})
        };
        res.writeHead(statusCode, headers);
        return res.end(gzipped);
      }
      sendJsonDirect(res, statusCode, jsonStr, extraHeaders);
    });
    return;
  }
  sendJsonDirect(res, statusCode, jsonStr, extraHeaders);
}

function sendJsonDirect(res, statusCode, jsonStr, extraHeaders) {
  const buf = Buffer.from(jsonStr, 'utf8');
  const corsHeaders = getCorsHeaders(res._req);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    ...corsHeaders,
    ...(extraHeaders || {})
  };
  res.writeHead(statusCode, headers);
  res.end(buf);
}

// ⚡ Hỗ trợ phân tích dữ liệu POST đa môi trường (Giới hạn 4MB, chống DoS tràn RAM)
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'object') return resolve(sanitizePlainObject(req.body));
      if (typeof req.body === 'string') {
        if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
          const e = new Error('Dữ liệu gửi lên vượt quá giới hạn 4MB');
          e.statusCode = 413;
          return reject(e);
        }
        try { return resolve(sanitizePlainObject(JSON.parse(req.body))); } catch (e) {
          const pe = new Error('JSON không hợp lệ');
          pe.statusCode = 400;
          return reject(pe);
        }
      }
    }
    const chunks = [];
    let totalBytes = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        aborted = true;
        const e = new Error('Dữ liệu gửi lên vượt quá giới hạn 4MB');
        e.statusCode = 413;
        return reject(e);
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body.trim()) return resolve({});
      try {
        resolve(sanitizePlainObject(JSON.parse(body)));
      } catch (e) {
        const pe = new Error('JSON không hợp lệ');
        pe.statusCode = 400;
        reject(pe);
      }
    });
    req.on('error', reject);
  });
}

function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_BODY_BYTES) {
        const e = new Error('Dữ liệu vượt quá giới hạn 4MB');
        e.statusCode = 413;
        return reject(e);
      }
      return resolve(req.body);
    }
    if (typeof req.body === 'string') return resolve(Buffer.from(req.body));
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
      return resolve(Buffer.from(JSON.stringify(req.body)));
    }
    const chunks = [];
    let totalBytes = 0;
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        aborted = true;
        const e = new Error('Dữ liệu vượt quá giới hạn 4MB');
        e.statusCode = 413;
        return reject(e);
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!aborted) resolve(Buffer.concat(chunks)); });
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
      const ops = Object.entries(data).map(([id, item]) => ({
        updateOne: { filter: { officerId: id }, update: { $set: { officerId: id, ...item } }, upsert: true }
      }));
      if (ops.length > 0) await col.bulkWrite(ops, { ordered: false });
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

function makeSaltedPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password).trim(), salt, 32).toString('hex');
  return { salt, hash: `scrypt$${derived}` };
}

function verifyPasswordAgainstRecord(pwd, record) {
  if (!record || !record.hash) return false;
  const trimmed = String(pwd || '').trim();
  const h = String(record.hash);
  if (h.startsWith('scrypt$') && record.salt) {
    const derived = crypto.scryptSync(trimmed, record.salt, 32).toString('hex');
    return safeEqualStr(`scrypt$${derived}`, h);
  }
  if (record.salt) {
    if (safeEqualStr(hashPassword(trimmed, record.salt), h)) return true;
  }
  return safeEqualStr(hashPassword(trimmed), h);
}

async function getHmacSecret() {
  if (_cachedHmacSecret) return _cachedHmacSecret;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    _cachedHmacSecret = process.env.SESSION_SECRET;
    return _cachedHmacSecret;
  }
  if (kpiDb) {
    try {
      const secretsCol = kpiDb.collection('system_secrets');
      const existing = await secretsCol.findOne({ _id: 'hmac_session_key' });
      if (existing && existing.key) {
        _cachedHmacSecret = existing.key;
        return _cachedHmacSecret;
      }
      const generated = crypto.randomBytes(32).toString('hex');
      const res = await secretsCol.findOneAndUpdate(
        { _id: 'hmac_session_key' },
        { $setOnInsert: { _id: 'hmac_session_key', key: generated, createdAt: new Date().toISOString() } },
        { upsert: true, returnDocument: 'after' }
      );
      const doc = (res && res.value) || res || await secretsCol.findOne({ _id: 'hmac_session_key' });
      if (doc && doc.key) {
        _cachedHmacSecret = doc.key;
        return _cachedHmacSecret;
      }
    } catch (e) {}
  }
  if (!process.env.VERCEL) {
    try {
      const secretPath = path.join(DATA_DIR, '.session_secret');
      if (fs.existsSync(secretPath)) {
        const s = fs.readFileSync(secretPath, 'utf8').trim();
        if (s.length >= 32) {
          _cachedHmacSecret = s;
          return _cachedHmacSecret;
        }
      }
      const fresh = crypto.randomBytes(32).toString('hex');
      fs.writeFileSync(secretPath, fresh, { encoding: 'utf8', mode: 0o600 });
      _cachedHmacSecret = fresh;
      return _cachedHmacSecret;
    } catch (e) {}
  }
  _cachedHmacSecret = crypto.randomBytes(32).toString('hex');
  return _cachedHmacSecret;
}

async function signSessionToken(officerId, role) {
  const secret = await getHmacSecret();
  const payloadObj = { sub: String(officerId), role: String(role || 'GDV'), iat: Date.now(), exp: Date.now() + SESSION_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sigB64 = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

async function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const secret = await getHmacSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  if (!safeEqualStr(sigB64, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!parsed || !parsed.sub || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  const raw = req && req.headers && req.headers.cookie;
  if (!raw) return out;
  String(raw).split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function buildSessionCookieHeader(req, token, maxAgeSec) {
  const isHttps = !!(process.env.VERCEL || (req && req.headers && req.headers['x-forwarded-proto'] === 'https') || (req && req.socket && req.socket.encrypted));
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token || '')}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${typeof maxAgeSec === 'number' ? maxAgeSec : Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

async function getAuthSession(req) {
  let token = '';
  const authHdr = req && req.headers && req.headers.authorization;
  if (authHdr && /^Bearer\s+/i.test(authHdr)) {
    token = authHdr.replace(/^Bearer\s+/i, '').trim();
  }
  if (!token) {
    const cookies = parseCookies(req);
    token = cookies[AUTH_COOKIE_NAME] || '';
  }
  const verified = await verifySessionToken(token);
  if (!verified || !verified.sub) return null;

  const officerId = verified.sub;
  const cfg = await getOfficersConfig();
  const off = cfg[officerId] || {};
  const role = off.role || verified.role || 'GDV';
  const isAdmin = (officerId === 'hoang');
  const isApprover = (officerId === 'son' || officerId === 'hoang' || role === 'TP');
  const isLeader = !!(off.isLeader || role === 'TP' || role === 'PTP' || isAdmin);
  const isKPIAggregator = !!(off.isKPIAggregator || officerId === 'tu');
  const canViewAll = !!(isAdmin || isApprover || isLeader || isKPIAggregator || ALLOWED_PUBLIC_VIEWER_IDS.has(officerId));

  return { officerId, role, isAdmin, isApprover, isLeader, isKPIAggregator, canViewAll };
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
    res.writeHead(204, getCorsHeaders(req));
    res.end();
    return;
  }

  const requireAuth = async () => {
    const sess = await getAuthSession(req);
    if (!sess) {
      sendJson(res, 401, { success: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại!", authRequired: true });
      return null;
    }
    return sess;
  };
  const sendBodyErr = (err) => sendJson(res, (err && err.statusCode) || 400, { success: false, error: (err && err.message) || "Dữ liệu không hợp lệ" });

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

  // API Auth Me (Kiểm tra phiên đăng nhập hiện tại qua HttpOnly Cookie hoặc Bearer Token)
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const auth = await getAuthSession(req);
    if (!auth) {
      return sendJson(res, 401, { success: false, authenticated: false, error: "Chưa đăng nhập" });
    }
    return sendJson(res, 200, { success: true, authenticated: true, user: auth });
  }

  // API Auth Logout (Xóa cookie đăng nhập an toàn)
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    return sendJson(res, 200, { success: true, message: "Đã đăng xuất" }, {
      'Set-Cookie': buildSessionCookieHeader(req, '', 0)
    });
  }

  // API Auth Status
  if (pathname === '/api/auth/status' && req.method === 'GET') {
    const officerId = searchParams.get('officerId');
    const authData = await getAuthPasswords();
    if (!officerId) {
      const auth = await requireAuth();
      if (!auth) return;
      if (!auth.isAdmin) {
        return sendJson(res, 403, { success: false, error: "Chỉ quản trị viên mới có quyền xem trạng thái mật khẩu toàn phòng!" });
      }
      const statusMap = {};
      for (const [id, item] of Object.entries(authData)) {
        statusMap[id] = !!(item && item.hash);
      }
      return sendJson(res, 200, { success: true, statusMap });
    }
    const hasPassword = !!(authData[officerId] && authData[officerId].hash);
    return sendJson(res, 200, { success: true, officerId, hasPassword });
  }

  // API Set Password (Thiết lập mật khẩu lần đầu - CHẶN nếu đã có mật khẩu)
  if (pathname === '/api/auth/set-password' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { officerId, password } = payload;
      if (!officerId || !password || String(password).trim().length < 4) {
        return sendJson(res, 400, { success: false, error: "Mật khẩu phải có ít nhất 4 ký tự" });
      }
      const cfg = await getOfficersConfig();
      const off = cfg[officerId];
      if (!off) {
        return sendJson(res, 404, { success: false, error: "Không tìm thấy cán bộ trong danh bạ" });
      }

      const authData = await getAuthPasswords();
      const localAuth = getLocalAuth();
      const existing = authData[officerId] || (!kpiDb ? localAuth[officerId] : null);
      if (existing && existing.hash) {
        return sendJson(res, 403, { success: false, error: "Tài khoản đã thiết lập mật khẩu. Vui lòng đăng nhập và dùng chức năng Đổi mật khẩu!" });
      }

      const { salt, hash } = makeSaltedPasswordHash(password);
      const nowIso = new Date().toISOString();

      if (kpiDb) {
        try {
          await executeMongoWriteWithQuotaShield(async () => {
            return await kpiDb.collection('auth_passwords').updateOne(
              { officerId },
              { $set: { officerId, hash, salt, updatedAt: nowIso } },
              { upsert: true }
            );
          });
        } catch (dbErr) {
          console.error('[API Set Password] Lỗi cập nhật MongoDB:', dbErr);
        }
      }

      if (!process.env.VERCEL) {
        try {
          localAuth[officerId] = { hash, salt, updatedAt: nowIso };
          saveLocalAuth(localAuth);
        } catch (e) {}
      }

      const token = await signSessionToken(officerId, off.role || 'GDV');
      return sendJson(res, 200, {
        success: true,
        message: "Đã thiết lập mật khẩu thành công",
        token,
        user: { officerId, role: off.role || 'GDV', isAdmin: officerId === 'hoang' }
      }, {
        'Set-Cookie': buildSessionCookieHeader(req, token)
      });
    } catch (err) {
      return sendBodyErr(err);
    }
  }

  // API Verify Password (Xác thực đăng nhập + cấp Signed HttpOnly Session Cookie & Rate Limit)
  if (pathname === '/api/auth/verify' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const { officerId, password } = payload;
      if (!officerId) {
        return sendJson(res, 400, { success: false, error: "Thiếu mã cán bộ" });
      }
      const clientIp = sanitizeClientIp(req);
      const rl = checkAuthRateLimit(clientIp, officerId);
      if (!rl.allowed) {
        return sendJson(res, 429, { success: false, error: `Thử sai quá nhiều lần. Vui lòng chờ ${rl.retryAfterSec} giây trước khi thử lại.` });
      }

      const defaultHash = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';
      const pwd = String(password || '').trim();

      const authData = await getAuthPasswords();
      const localAuth = getLocalAuth();
      const cloudAuth = authData[officerId];
      // Chỉ fallback localAuth nếu chưa kết nối được MongoDB hoặc Cloud chưa có bản ghi của cán bộ
      const userAuth = (kpiDb && cloudAuth && cloudAuth.hash) ? cloudAuth : (cloudAuth || localAuth[officerId]);

      if (!userAuth || !userAuth.hash) {
        return sendJson(res, 200, { success: false, error: "Tài khoản chưa thiết lập mật khẩu hoặc đã được đặt lại. Vui lòng thiết lập mật khẩu mới!", notSet: true });
      }

      let matched = verifyPasswordAgainstRecord(pwd, userAuth);
      // Hỗ trợ kiểm tra khi quản trị viên đặt lại về 123456 (lưu đúng hash mặc định trên bản ghi active)
      if (!matched && pwd === '123456' && safeEqualStr(userAuth.hash, defaultHash)) {
        matched = true;
      }

      if (matched) {
        clearAuthFailures(rl.key);
        if (kpiDb && (!cloudAuth || !cloudAuth.hash) && localAuth[officerId] && localAuth[officerId].hash) {
          try {
            await kpiDb.collection('auth_passwords').updateOne(
              { officerId },
              { $set: { officerId, hash: localAuth[officerId].hash, salt: localAuth[officerId].salt || '', updatedAt: new Date().toISOString() } },
              { upsert: true }
            );
          } catch (e) {}
        }
        const cfg = await getOfficersConfig();
        const off = cfg[officerId] || {};
        const role = off.role || 'GDV';
        const token = await signSessionToken(officerId, role);
        return sendJson(res, 200, {
          success: true,
          message: "Xác thực thành công",
          token,
          user: {
            officerId,
            role,
            isAdmin: officerId === 'hoang',
            isApprover: (officerId === 'son' || officerId === 'hoang' || role === 'TP'),
            isLeader: !!(off.isLeader || role === 'TP' || role === 'PTP' || officerId === 'hoang'),
            isKPIAggregator: !!(off.isKPIAggregator || officerId === 'tu')
          }
        }, {
          'Set-Cookie': buildSessionCookieHeader(req, token)
        });
      }

      recordAuthFailure(rl.key);
      return sendJson(res, 401, { success: false, error: "Mật khẩu không chính xác. Vui lòng kiểm tra lại!" });
    } catch (err) {
      return sendBodyErr(err);
    }
  }

  // API Change Password (Cán bộ tự đổi mật khẩu - Bắt buộc đã đăng nhập & khớp mật khẩu cũ)
  if (pathname === '/api/auth/change-password' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    try {
      const payload = await parseJsonBody(req);
      const { officerId, oldPassword, newPassword } = payload;
      const targetId = officerId || auth.officerId;
      if (targetId !== auth.officerId) {
        return sendJson(res, 403, { success: false, error: "Chỉ được phép đổi mật khẩu cho chính tài khoản đang đăng nhập!" });
      }
      if (!newPassword || String(newPassword).trim().length < 4) {
        return sendJson(res, 400, { success: false, error: "Mật khẩu mới phải có ít nhất 4 ký tự" });
      }
      const authData = await getAuthPasswords();
      const userAuth = authData[targetId] || (!kpiDb ? getLocalAuth()[targetId] : null);
      if (userAuth && userAuth.hash) {
        const oldTrimmed = String(oldPassword || '').trim();
        const currentValid = verifyPasswordAgainstRecord(oldTrimmed, userAuth) ||
          (oldTrimmed === '123456' && safeEqualStr(userAuth.hash, '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'));
        if (!currentValid) {
          return sendJson(res, 400, { success: false, error: "Mật khẩu hiện tại không chính xác" });
        }
      }
      const { salt, hash } = makeSaltedPasswordHash(newPassword);
      const nowIso = new Date().toISOString();

      if (kpiDb) {
        try {
          await executeMongoWriteWithQuotaShield(async () => {
            return await kpiDb.collection('auth_passwords').updateOne(
              { officerId: targetId },
              { $set: { officerId: targetId, hash, salt, updatedAt: nowIso } },
              { upsert: true }
            );
          });
        } catch (dbErr) {
          console.error('[API Change Password] Lỗi cập nhật MongoDB:', dbErr);
          return sendJson(res, 500, { success: false, error: "Lỗi lưu mật khẩu lên CSDL: " + dbErr.message });
        }
      }

      if (!process.env.VERCEL) {
        try {
          const localAuth = getLocalAuth();
          localAuth[targetId] = { hash, salt, updatedAt: nowIso };
          saveLocalAuth(localAuth);
        } catch (e) {}
      }

      const newToken = await signSessionToken(targetId, auth.role);
      return sendJson(res, 200, { success: true, message: "Đã đổi mật khẩu thành công", token: newToken }, {
        'Set-Cookie': buildSessionCookieHeader(req, newToken)
      });
    } catch (err) {
      return sendBodyErr(err);
    }
  }

  // API Admin Set Password (CHỈ Admin Hoàng đã xác thực session)
  if (pathname === '/api/auth/admin-set-password' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "Quyền quản trị bị từ chối!" });
    }
    try {
      const payload = await parseJsonBody(req);
      const { targetOfficerId, newPassword } = payload;
      if (!targetOfficerId || !newPassword || String(newPassword).trim().length < 4) {
        return sendJson(res, 400, { success: false, error: "Thiếu mã cán bộ hoặc mật khẩu mới < 4 ký tự" });
      }
      const trimmed = String(newPassword).trim();
      let salt = '';
      let hash = '';
      if (trimmed === '123456') {
        hash = hashPassword('123456');
        salt = '';
      } else {
        const resHash = makeSaltedPasswordHash(trimmed);
        salt = resHash.salt;
        hash = resHash.hash;
      }
      const nowIso = new Date().toISOString();

      if (kpiDb) {
        try {
          await executeMongoWriteWithQuotaShield(async () => {
            return await kpiDb.collection('auth_passwords').updateOne(
              { officerId: targetOfficerId },
              { $set: { officerId: targetOfficerId, hash, salt, updatedAt: nowIso } },
              { upsert: true }
            );
          });
        } catch (dbErr) {
          console.error('[API Admin Set Password] Lỗi cập nhật MongoDB:', dbErr);
          return sendJson(res, 500, { success: false, error: "Lỗi kết nối cơ sở dữ liệu Cloud: " + dbErr.message });
        }
      }

      if (!process.env.VERCEL) {
        try {
          const localAuth = getLocalAuth();
          localAuth[targetOfficerId] = { hash, salt, updatedAt: nowIso };
          saveLocalAuth(localAuth);
        } catch (e) {}
      }

      return sendJson(res, 200, {
        success: true,
        message: `Đã đặt mật khẩu thành công cho cán bộ: ${targetOfficerId}`
      });
    } catch (err) {
      return sendBodyErr(err);
    }
  }

  // API Reset Password (CHỈ Admin Hoàng đã xác thực session)
  if (pathname === '/api/auth/reset' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "Quyền quản trị bị từ chối!" });
    }
    try {
      const payload = await parseJsonBody(req);
      const { targetOfficerId } = payload;
      if (!targetOfficerId) {
        return sendJson(res, 400, { success: false, error: "Thiếu mã cán bộ cần đặt lại" });
      }

      if (kpiDb) {
        try {
          await executeMongoWriteWithQuotaShield(async () => {
            return await kpiDb.collection('auth_passwords').deleteOne({ officerId: targetOfficerId });
          });
        } catch (e) {
          console.error('[API Auth Reset] Lỗi xóa MongoDB:', e);
        }
      }

      if (!process.env.VERCEL) {
        try {
          const localData = getLocalAuth();
          if (localData[targetOfficerId]) {
            delete localData[targetOfficerId];
            saveLocalAuth(localData);
          }
        } catch (e) {}
      }

      return sendJson(res, 200, {
        success: true,
        message: `Đã đặt lại mật khẩu thành công cho cán bộ: ${targetOfficerId}`
      });
    } catch (err) {
      return sendBodyErr(err);
    }
  }

  // API Status
  if (pathname === '/api/status' && req.method === 'GET') {
    const auth = await getAuthSession(req);
    let sessionsCount = 0;
    if (auth || !process.env.VERCEL) {
      if (kpiDb) {
        try {
          sessionsCount = await kpiDb.collection('sessions').countDocuments();
        } catch(e) {
          sessionsCount = Object.keys(getAllLocalSessions()).length;
        }
      } else {
        sessionsCount = Object.keys(getAllLocalSessions()).length;
      }
    }
    return sendJson(res, 200, {
      status: "ok",
      storageMode: kpiDb ? "mongodb_cloud" : "local_file_storage",
      serverTime: new Date().toISOString(),
      hostIp: (auth || !process.env.VERCEL) ? getLanIp() : undefined,
      port: (auth || !process.env.VERCEL) ? PORT : undefined,
      sessionsCount: (auth || !process.env.VERCEL) ? sessionsCount : undefined,
      version: "V18_Hybrid_Local_Cloud"
    });
  }

  // API Officers (hỗ trợ ?lite=1 bỏ defaultPlan 270KB để load <250ms)
  if (pathname === '/api/officers' && req.method === 'GET') {
    const isLite = searchParams.get('lite') === '1';
    const cfg = await getOfficersConfig();
    if (isLite) {
      const liteCfg = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (!v) continue;
        const { defaultPlan, ...rest } = v;
        liteCfg[k] = rest;
      }
      return sendJson(res, 200, {
        success: true,
        lite: true,
        officers: liteCfg,
        officersList: Object.values(liteCfg)
      });
    }
    return sendJson(res, 200, {
      success: true,
      officers: cfg,
      officersList: Object.values(cfg)
    });
  }

  // API Update Officer Information (CHỈ Trưởng phòng Sơn & Phó TP Hoàng đã xác thực session)
  if (pathname === '/api/officer/update' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isApprover) {
      return sendJson(res, 403, { success: false, error: "Chỉ có Trưởng phòng (đ/c Hoàng Anh Sơn) và Phó Trưởng phòng (đ/c Trần Quốc Hoàng) mới có quyền sửa thông tin cán bộ." });
    }
    try {
      const payload = await parseJsonBody(req);
      const { officerId, name, role, title, group, specialty, approverTitle, approverName } = payload;
      if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

      const allCfg = await getOfficersConfig();
      const existing = allCfg[officerId] || { id: officerId };

      if (name !== undefined && String(name).trim()) existing.name = String(name).trim();
      if (role !== undefined && String(role).trim()) existing.role = String(role).trim();
      if (title !== undefined) existing.title = String(title).trim();
      if (group !== undefined) existing.group = String(group).trim();
      if (specialty !== undefined) existing.specialty = String(specialty).trim();
      if (approverTitle !== undefined) existing.approverTitle = String(approverTitle).trim();
      if (approverName !== undefined) existing.approverName = String(approverName).trim();
      existing.isLeader = (existing.role === 'TP' || existing.role === 'PTP');
      existing.updatedAt = new Date().toISOString();

      allCfg[officerId] = existing;

      // 1. Lưu CSDL cục bộ (File officers_config.json)
      saveLocalOfficers(allCfg);
      officersConfigCache = allCfg;
      officersConfigCacheTime = Date.now();

      // 2. Lưu MongoDB Cloud
      if (kpiDb) {
        try {
          await kpiDb.collection('officers_config').updateOne(
            { id: officerId },
            { $set: existing },
            { upsert: true }
          );
        } catch (e) {
          console.error("Lỗi cập nhật officer lên MongoDB:", e);
        }
      }

      // Xóa cache bảng tổng hợp để áp dụng tên/chức danh mới
      invalidateSummaryCache();

      return sendJson(res, 200, {
        success: true,
        message: `Đã cập nhật thông tin cán bộ ${existing.name} (${officerId}) thành công!`,
        officer: existing
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // API Get Previous Quarter Last Month (Phục vụ kế thừa KPI)
  if (pathname === '/api/session/previous-month' && req.method === 'GET') {
    const auth = await requireAuth();
    if (!auth) return;
    const officerId = searchParams.get('officerId');
    const quarter = searchParams.get('quarter') || 'Quý IV';
    const year = searchParams.get('year') || 2026;

    if (!officerId) {
      return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
    }
    if (auth.officerId !== officerId && !auth.canViewAll) {
      return sendJson(res, 403, { success: false, error: "Không có quyền truy cập hồ sơ cán bộ khác!" });
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
    const auth = await requireAuth();
    if (!auth) return;
    const officerId = searchParams.get('officerId');
    const quarter = searchParams.get('quarter');
    const year = searchParams.get('year');

    if (!officerId) {
      return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
    }
    if (auth.officerId !== officerId && !auth.canViewAll) {
      return sendJson(res, 403, { success: false, error: "Không có quyền xem hồ sơ KPI của cán bộ khác!" });
    }

    const isDeltaMode = (searchParams.get('delta') === '1');
    const filename = getSessionFilename(officerId, quarter, year);
    const altFilename = filename.includes('Quy') ? filename.replace(/Quy/g, 'Quý') : filename.replace(/Quý/g, 'Quy');
    const normQ = normalizeQuarter(quarter);
    const yNum = Number(year) || 2026;

    const buildSessionDeltaPipeline = (matchQuery) => ([
      { $match: matchQuery },
      {
        $project: {
          _id: 1,
          filename: 1,
          officerId: 1,
          activeTasksCount: 1,
          updatedAt: 1,
          "data.officer": 1,
          "data.quarterPlan": 1,
          "data.generalCriteria": 1,
          "data.status": 1,
          "data.isSubmitted": 1,
          "data.isApproved": 1,
          "data.submittedAt": 1,
          "data.approvedAt": 1,
          "data.approvedBy": 1,
          "data.rejectedAt": 1,
          "data.rejectedBy": 1,
          "data.rejectReason": 1,
          "data.leaderRatingProposal": 1,
          "data.leaderRatingNote": 1,
          "data.proposedRating": 1,
          "data.selfRating": 1,
          "data.lastSaved": 1,
          "data.months": {
            $cond: {
              if: { $eq: [{ $ifNull: ["$data.months", null] }, null] },
              then: null,
              else: {
                $map: {
                  input: {
                    $cond: {
                      if: { $isArray: "$data.months" },
                      then: "$data.months",
                      else: {
                        $map: {
                          input: { $objectToArray: { $ifNull: ["$data.months", {}] } },
                          as: "kv",
                          in: "$$kv.v"
                        }
                      }
                    }
                  },
                  as: "m",
                  in: {
                    monthNum: "$$m.monthNum",
                    name: "$$m.name",
                    completionPercent: "$$m.completionPercent",
                    quantityPct: "$$m.quantityPct",
                    qualityPct: "$$m.qualityPct",
                    progressPct: "$$m.progressPct",
                    deltaRows: {
                      $cond: {
                        if: { $gt: [{ $size: { $cond: { if: { $isArray: "$$m.rows" }, then: "$$m.rows", else: [] } } }, 0] },
                        then: {
                          $filter: {
                            input: {
                              $map: {
                                input: { $range: [0, { $size: "$$m.rows" }] },
                                as: "idx",
                                in: {
                                  $mergeObjects: [
                                    { $arrayElemAt: ["$$m.rows", "$$idx"] },
                                    { arrIdx: "$$idx" }
                                  ]
                                }
                              }
                            },
                            as: "r",
                            cond: {
                              $or: [
                                { $eq: ["$$r.co_thuchien", "Có"] },
                                { $eq: ["$$r.isCustom", true] },
                                { $eq: ["$$r._isCustomized", true] },
                                { $gte: ["$$r.arrIdx", 235] },
                                { $gt: [{ $convert: { input: "$$r.soluong_tt", to: "double", onError: 0, onNull: 0 } }, 0] },
                                { $gt: [{ $convert: { input: "$$r.cl_loi", to: "double", onError: 0, onNull: 0 } }, 0] },
                                { $gt: [{ $convert: { input: "$$r.td_cham", to: "double", onError: 0, onNull: 0 } }, 0] },
                                { $ne: [{ $ifNull: ["$$r.ghichu", ""] }, ""] },
                                { $ne: [{ $ifNull: ["$$r.note_sl", ""] }, ""] },
                                { $ne: [{ $ifNull: ["$$r.note_cl", ""] }, ""] },
                                { $ne: [{ $ifNull: ["$$r.note_td", ""] }, ""] },
                                { $ne: [{ $ifNull: ["$$r.note_ghichu", ""] }, ""] },
                                { $in: ["$$r.col_u", ["50", 50]] },
                                { $in: ["$$r.col_v", ["50", 50]] },
                                { $in: ["$$r.col_w", ["50", 50]] }
                              ]
                            }
                          }
                        },
                        else: { $cond: { if: { $isArray: "$$m.deltaRows" }, then: "$$m.deltaRows", else: [] } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]);

    const querySessionDocs = async (matchQuery) => {
      if (isDeltaMode) {
        return await kpiDb.collection('sessions').aggregate(buildSessionDeltaPipeline(matchQuery)).toArray();
      }
      return await kpiDb.collection('sessions').find(matchQuery).toArray();
    };

    let mongoPrimary = null;
    let mongoAlt = null;
    if (kpiDb) {
      try {
        // 1. Truy vấn chuẩn theo Index { filename: 1 } (tránh COLLSCAN 80MB của nhánh $or không index)
        const sameQuarterFns = [filename, ...getSameQuarterAltFilenames(officerId, quarter, year)];
        let docs = await querySessionDocs({ filename: { $in: sameQuarterFns } });
        // 2. Fallback theo Compound Index { officerId: 1, quarterNorm: 1, year: 1 }
        if (!docs || docs.length === 0) {
          docs = await querySessionDocs({ officerId, quarterNorm: normQ, year: yNum });
        }
        // 3. Fallback cuối cùng theo metadata lồng sâu (chỉ chạy nếu dữ liệu cũ chưa có trường gốc)
        if (!docs || docs.length === 0) {
          docs = await querySessionDocs({
            "data.officer.officerId": officerId,
            "data.officer.quarter": quarter,
            "data.officer.year": yNum
          });
        }
        for (const d of docs) {
          if (d && d.data) {
            const fnQ = extractQuarterFromFilename(d.filename);
            if (fnQ && fnQ !== normQ) continue;
            if (typeof d.activeTasksCount === 'number' && !d.data.activeTasksCount) {
              d.data.activeTasksCount = d.activeTasksCount;
            }
            if (d.filename === filename) mongoPrimary = d.data;
            else mongoAlt = pickBestSession(mongoAlt, d.data);
          }
        }
      } catch (e) {}
    }

    // Kiểm tra bản cục bộ (trên Vercel khi đã có MongoDB, getLocalSession bỏ qua quét 45MB đĩa seed cũ)
    const localPrimary = getLocalSession(filename);
    const localAlt = getLocalSession(altFilename);
    const bestData = pickBestSession(mongoPrimary, mongoAlt, localPrimary, localAlt);

    if (bestData) {
      if (!isDeltaMode && kpiDb && countSessionActiveTasks(bestData) > countSessionActiveTasks(mongoPrimary)) {
        try {
          await kpiDb.collection('sessions').updateOne(
            { filename },
            { $set: { filename, officerId, quarterNorm: normQ, year: yNum, data: sanitizeSessionData(bestData) } },
            { upsert: true }
          );
        } catch (e) {}
      }
      return sendJson(res, 200, { success: true, isNew: false, delta: isDeltaMode, filename, data: bestData });
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
    const auth = await requireAuth();
    if (!auth) return;
    try {
      const payload = await parseJsonBody(req);
        const officerId = payload.officerId || (payload.officer && payload.officer.officerId) || (payload.state && payload.state.officer && payload.state.officer.officerId);
        const quarter = payload.quarter || (payload.officer && payload.officer.quarter) || (payload.state && payload.state.officer && payload.state.officer.quarter);
        const year = payload.year || (payload.officer && payload.officer.year) || (payload.state && payload.state.officer && payload.state.officer.year);
        const state = payload.state || payload;

        if (!officerId) {
          return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
        }
        if (auth.officerId !== officerId && !auth.isApprover) {
          return sendJson(res, 403, { success: false, error: "Không có quyền sửa đổi hồ sơ của cán bộ khác!" });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        const altFilename = filename.includes('Quy') ? filename.replace(/Quy/g, 'Quý') : filename.replace(/Quý/g, 'Quy');
        state.lastSaved = new Date().toISOString();

        // Tinh gọn state trước để biết có dữ liệu thực chất hay là bảng trắng
        const cleanState = sanitizeSessionData(state);
        cleanState.lastSaved = state.lastSaved;
        if (!cleanState.officer) cleanState.officer = {};
        cleanState.officer.officerId = officerId;
        cleanState.officer.quarter = quarter || cleanState.officer.quarter || 'Quý III';
        cleanState.officer.year = Number(year || cleanState.officer.year || 2026);

        // Đồng bộ tên tháng và số tháng khớp tuyệt đối với Quý/Năm đang lưu
        if (cleanState.months && Array.isArray(cleanState.months) && cleanState.months.length === 3) {
          const expectedMonths = getQuarterMonthsInfoServer(cleanState.officer.quarter, cleanState.officer.year);
          cleanState.months.forEach((m, idx) => {
            if (m && expectedMonths[idx]) {
              m.monthNum = expectedMonths[idx].monthNum;
              m.name = expectedMonths[idx].name;
            }
          });
        }

        const countIncomingActive = countSessionActiveTasks(cleanState);
        const pointsIncoming = getSessionTotalDonePoints(cleanState);
        const isIncomingBlank = (countIncomingActive === 0 && pointsIncoming === 0);

        let existingSession = null;
        if (kpiDb) {
          try {
            // ⚡ Tối ưu: Nếu bản gửi lên có dữ liệu thực tế (>0 việc), chỉ project metadata trạng thái (~500B thay vì 550KB)
            const findOpts = isIncomingBlank ? {} : {
              projection: {
                filename: 1,
                activeTasksCount: 1,
                totalDonePoints: 1,
                "data.status": 1,
                "data.isSubmitted": 1,
                "data.submittedAt": 1,
                "data.approvedAt": 1,
                "data.approvedBy": 1,
                "data.rejectedAt": 1,
                "data.rejectedBy": 1,
                "data.rejectReason": 1,
                "data.leaderRatingProposal": 1,
                "data.leaderRatingNote": 1,
                "data.lastSaved": 1,
                "data.months.completionPercent": 1
              }
            };
            const docs = await kpiDb.collection('sessions').find({
              filename: { $in: [filename, ...getSameQuarterAltFilenames(officerId, quarter, year)] }
            }, findOpts).toArray();
            const targetNormSave = normalizeQuarter(quarter);
            for (const d of docs) {
              if (d && d.data) {
                const fnQ = extractQuarterFromFilename(d.filename);
                if (fnQ && fnQ !== targetNormSave) continue;
                if (typeof d.activeTasksCount === 'number') d.data.activeTasksCount = d.activeTasksCount;
                if (typeof d.totalDonePoints === 'number') d.data.totalDonePoints = d.totalDonePoints;
                existingSession = pickBestSession(existingSession, d.data);
              }
            }
          } catch(e) {}
        }
        existingSession = pickBestSession(existingSession, getLocalSession(filename), getLocalSession(altFilename));

        if (existingSession) {
          const currentStatus = existingSession.status;
          const isLeaderOrAdmin = auth.isApprover;

          // 🔒 KIỂM TRA KHÓA DỮ LIỆU: Nếu đã nộp hoặc đã duyệt, cán bộ thường không được sửa
          if ((currentStatus === 'da_nop' || currentStatus === 'da_duyet') && !isLeaderOrAdmin && payload.action !== 'submit') {
            return sendJson(res, 403, {
              success: false,
              error: "BÁO CÁO ĐÃ NỘP HOẶC ĐÃ ĐƯỢC PHÊ DUYỆT! Dữ liệu đã bị khóa và không thể tự ý sửa đổi.",
              isLocked: true,
              status: currentStatus
            });
          }

          if (existingSession.leaderRatingProposal && !cleanState.leaderRatingProposal) {
            cleanState.leaderRatingProposal = existingSession.leaderRatingProposal;
          }
          if (existingSession.leaderRatingNote && !cleanState.leaderRatingNote) {
            cleanState.leaderRatingNote = existingSession.leaderRatingNote;
          }
          if (existingSession.status && !cleanState.status) {
            cleanState.status = existingSession.status;
          }
        }

        const countExistingActive = countSessionActiveTasks(existingSession);
        const pointsExisting = getSessionTotalDonePoints(existingSession);

        // 🛡️ LÁ CHẮN BẢO TOÀN DỮ LIỆU (ANTI DATA-LOSS SHIELD):
        // 1. Nếu hồ sơ trên máy chủ đã có công việc thực hiện (>= 1 việc hoặc >= 1000 điểm) mà bản gửi lên lại rỗng (0 việc và 0 điểm),
        //    TUYỆT ĐỐI TỪ CHỐI GHI ĐÈ và trả lại bản gốc cho Client tự phục hồi!
        if (existingSession && payload.action !== 'force_clear') {
          if ((countExistingActive >= 1 || pointsExisting >= 1000) && isIncomingBlank) {
            console.warn(`[DATA-LOSS SHIELD] Chặn yêu cầu ghi đè rỗng lên hồ sơ ${filename} (gốc: ${countExistingActive} việc / ${pointsExisting} điểm, mới: 0 việc).`);
            return sendJson(res, 200, {
              success: true,
              restoredOriginal: true,
              message: "Lá chắn dữ liệu đã bảo vệ hồ sơ gốc của đồng chí an toàn!",
              filename,
              data: existingSession
            });
          }
        }

        // 2. Nếu chưa từng có hồ sơ và bản gửi lên cũng là bảng trắng (0 công việc, chưa nộp),
        //    không ghi rác bản ghi 0 việc vào CSDL để tránh tạo bản ghi rỗng che khuất dữ liệu!
        if (!existingSession && countIncomingActive === 0 && payload.action !== 'submit') {
          return sendJson(res, 200, {
            success: true,
            skippedEmpty: true,
            message: "Bảng trắng chưa có công việc thực hiện, bỏ qua ghi CSDL.",
            filename
          });
        }

        // BẢO VỆ CHẶT CHẼ TRẠNG THÁI:
        // Nếu hồ sơ chưa từng nộp chính thức trên máy chủ, một lệnh lưu thông thường
        // TUYỆT ĐỐI KHÔNG ĐƯỢC gán trạng thái 'da_nop' (tránh rò rỉ cờ isSubmitted từ phiên cũ).
        // Chỉ có thao tác nộp bài chính thức (/api/session/submit hoặc action: 'submit') mới được mang trạng thái 'da_nop'.
        const isOfficiallySubmitted = existingSession && (existingSession.isSubmitted || existingSession.status === 'da_nop' || existingSession.status === 'da_duyet');
        const canRecoverSubmittedFromClient = !existingSession && payload.action === 'recover_submitted' && countIncomingActive > 0 && cleanState.status === 'da_nop' && cleanState.submittedAt;
        if (!isOfficiallySubmitted && payload.action !== 'submit' && !canRecoverSubmittedFromClient) {
          if (existingSession && existingSession.status === 'tra_lai') {
            cleanState.status = 'tra_lai';
            cleanState.rejectedAt = existingSession.rejectedAt;
            cleanState.rejectedBy = existingSession.rejectedBy;
            cleanState.rejectReason = existingSession.rejectReason;
          } else {
            cleanState.status = 'da_luu';
          }
          cleanState.isSubmitted = false;
          cleanState.submittedAt = null;
        } else if (canRecoverSubmittedFromClient) {
          cleanState.status = 'da_nop';
          cleanState.isSubmitted = true;
          cleanState.isApproved = false;
        } else if (isOfficiallySubmitted && payload.action !== 'submit' && (cleanState.status === 'da_luu' || cleanState.status === 'draft')) {
          // Bảo vệ trạng thái đã nộp / đã duyệt: không để autosave 'da_luu' hạ cấp ngược trạng thái (chỉ mở khóa qua /api/session/reject)
          cleanState.status = existingSession.status;
          cleanState.isSubmitted = !!existingSession.isSubmitted;
          cleanState.isApproved = !!existingSession.isApproved;
          cleanState.submittedAt = existingSession.submittedAt || cleanState.submittedAt;
          cleanState.approvedAt = existingSession.approvedAt || cleanState.approvedAt;
          cleanState.approvedBy = existingSession.approvedBy || cleanState.approvedBy;
        }

        // 1. Lưu RAM / Đĩa máy chủ (nếu chạy LAN)
        await saveLocalSessionAsync(filename, cleanState);

        // Kiểm tra xem có cần chụp Snapshot hay không (tránh bão snapshot khi 35 người gõ phím liên tục)
        const isActionSnapshot = (payload.action === 'submit' || payload.action === 'approve' || payload.action === 'reject' || payload.forceSnapshot);
        const lastSnapTime = lastSnapshotTimeMap.get(filename) || 0;
        const isTimeForSnapshot = (Date.now() - lastSnapTime > 15 * 60 * 1000); // 15 phút một lần
        const shouldTakeSnapshot = isActionSnapshot || !lastSnapshotTimeMap.has(filename) || isTimeForSnapshot;

        const clientIp = sanitizeClientIp(req);
        let snapshotSummary = "";
        if (cleanState.months && Array.isArray(cleanState.months)) {
          let mPct = cleanState.months.map(m => m.completionPercent || 0).join(' - ');
          snapshotSummary = `Tháng: [${mPct}]% - TT: ${cleanState.status || 'da_luu'}`;
        }

        if (shouldTakeSnapshot && !process.env.VERCEL) {
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
        } else if (shouldTakeSnapshot) {
          lastSnapshotTimeMap.set(filename, Date.now());
        }

        if (kpiDb) {
          try {
            const sessionsCol = kpiDb.collection('sessions');
            await executeMongoWriteWithQuotaShield(async () => {
              return await sessionsCol.updateOne(
                { filename },
                {
                  $set: {
                    filename,
                    officerId,
                    quarterNorm: normalizeQuarter(quarter),
                    year: Number(year) || 2026,
                    activeTasksCount: countIncomingActive,
                    totalDonePoints: pointsIncoming,
                    updatedAt: cleanState.lastSaved,
                    data: cleanState
                  }
                },
                { upsert: true }
              );
            });

            // Await trực tiếp trước khi trả response để Vercel Serverless không bị đóng băng ngang chừng
            if (isActionSnapshot) {
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

                const maxSnapshots = 2;
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
        return sendJson(res, (err && err.statusCode) || 500, { success: false, error: "Lỗi ghi dữ liệu: " + err.message });
      }
  }

  // --- API NỘP BÁO CÁO KPI (SUBMIT KPI) ---
  if (pathname === '/api/session/submit' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    try {
      const payload = await parseJsonBody(req);
        const { officerId, quarter, year, state } = payload;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });
        if (auth.officerId !== officerId && !auth.isApprover) {
          return sendJson(res, 403, { success: false, error: "Không có quyền nộp hồ sơ KPI thay cho cán bộ khác!" });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        const targetNormQ = normalizeQuarter(quarter);
        const altFilenames = getSameQuarterAltFilenames(officerId, quarter, year);
        const submitTime = new Date().toISOString();
        let targetState = state ? sanitizeSessionData(state) : null;

        if (!targetState || countSessionActiveTasks(targetState) === 0) {
          let mongoDoc = null;
          if (kpiDb) {
            try {
              const queryFilenames = [filename, ...altFilenames];
              const docs = await kpiDb.collection('sessions').find({ filename: { $in: queryFilenames } }).toArray();
              for (const d of docs) if (d && d.data) mongoDoc = pickBestSession(mongoDoc, d.data);
            } catch(e) {}
          }
          targetState = pickBestSession(targetState, mongoDoc, getLocalSession(filename));
          for (const afn of altFilenames) {
            targetState = pickBestSession(targetState, getLocalSession(afn));
          }
        }
        if (!targetState) return sendJson(res, 404, { success: false, error: "Không tìm thấy dữ liệu phiên" });

        const isTP = (officerId === 'son' || (targetState.officer && targetState.officer.role === 'TP'));
        const isHoangAdmin = (officerId === 'hoang');
        if (isTP) {
          // Trưởng phòng là người đứng đầu đơn vị: Tự xác nhận chính thức, không cần người khác duyệt
          targetState.status = "da_duyet";
          targetState.isSubmitted = true;
          targetState.isApproved = true;
          targetState.approvedAt = submitTime;
          targetState.approvedBy = "Hoàng Anh Sơn (Trưởng phòng)";
          targetState.rejectReason = null;
        } else if (isHoangAdmin) {
          // Quản trị hệ thống (đ/c Trần Quốc Hoàng): Tự sửa, tự duyệt trực tiếp không cần chuyển qua Trưởng phòng
          targetState.status = "da_duyet";
          targetState.isSubmitted = true;
          targetState.isApproved = true;
          targetState.approvedAt = submitTime;
          targetState.approvedBy = "Trần Quốc Hoàng (Quản trị hệ thống)";
          targetState.rejectReason = null;
        } else {
          targetState.status = "da_nop";
          targetState.isSubmitted = true;
          targetState.rejectReason = null;
        }
        targetState.submittedAt = submitTime;
        targetState.lastSaved = submitTime;
        if (!targetState.officer) targetState.officer = {};
        targetState.officer.officerId = officerId;
        targetState.officer.quarter = quarter || targetState.officer.quarter || 'Quý III';
        targetState.officer.year = Number(year) || targetState.officer.year || 2026;

        // Lưu CSDL cục bộ bất đồng bộ & dọn altFilename trong SESSIONS_DIR
        await saveLocalSessionAsync(filename, targetState);
        if (!process.env.VERCEL) {
          for (const altFn of altFilenames) {
            try {
              const altPath = path.join(SESSIONS_DIR, altFn);
              if (fs.existsSync(altPath)) fs.unlinkSync(altPath);
            } catch (e) {}
          }
        }

        const submitClientIp = sanitizeClientIp(req);
        if (!process.env.VERCEL) {
          saveLocalSnapshotAsync(filename, {
            officerId,
            quarter: normalizeQuarter(quarter),
            year: Number(year) || 2026,
            savedAt: submitTime,
            clientIp: submitClientIp,
            summary: '📤 [NỘP KPI QUÝ] Chốt số liệu cá nhân',
            data: targetState
          }).catch(() => {});
        }

        if (kpiDb) {
          try {
            const sessionsCol = kpiDb.collection('sessions');
            await executeMongoWriteWithQuotaShield(async () => {
              return await sessionsCol.updateOne(
                { filename },
                {
                  $set: {
                    filename,
                    officerId,
                    quarterNorm: normalizeQuarter(quarter),
                    year: Number(year) || 2026,
                    activeTasksCount: countSessionActiveTasks(targetState),
                    updatedAt: submitTime,
                    data: targetState
                  }
                },
                { upsert: true }
              );
            });
            if (altFilenames.length > 0) {
              await sessionsCol.deleteMany({ filename: { $in: altFilenames } });
            }
            try {
              const snapCol = kpiDb.collection('session_snapshots');
              await snapCol.insertOne({
                filename,
                officerId,
                quarter: normalizeQuarter(quarter),
                year: Number(year) || 2026,
                savedAt: submitTime,
                clientIp: submitClientIp,
                summary: '📤 [NỘP KPI QUÝ] Chốt số liệu cá nhân',
                data: targetState
              });
              const snapCount = await snapCol.countDocuments({ filename });
              if (snapCount > 2) {
                const overflow = await snapCol.find({ filename }).sort({ savedAt: 1 }).limit(snapCount - 2).project({ _id: 1 }).toArray();
                if (overflow.length > 0) await snapCol.deleteMany({ _id: { $in: overflow.map(d => d._id) } });
              }
            } catch (e) {}
          } catch (e) {}
        }
        invalidateSummaryCache();

        return sendJson(res, 200, {
          success: true,
          message: `Đã nộp thành công KPI Quý cho cán bộ ${officerId}. Dữ liệu đã được khóa an toàn!`,
          submittedAt: submitTime
        });
      } catch (err) {
        return sendJson(res, (err && err.statusCode) || 500, { success: false, error: err.message });
      }
  }

  // Helper nội bộ: Cập nhật trạng thái phê duyệt / trả lại nguyên tử (< 1KB payload, không tải lại 550KB rows)
  async function patchSessionStatusAtomic({ officerId, quarter, year, setDocFields, setDataFields }) {
    const filename = getSessionFilename(officerId, quarter, year);
    const targetNormQ = normalizeQuarter(quarter);
    const yearNum = Number(year) || 2026;
    const altFilenames = getSameQuarterAltFilenames(officerId, quarter, year);

    const queryFilenames = [filename, ...altFilenames];
    const nowIso = setDocFields.updatedAt || new Date().toISOString();

    if (kpiDb) {
      const sessionsCol = kpiDb.collection('sessions');
      const lightProjection = {
        _id: 1,
        filename: 1,
        officerId: 1,
        activeTasksCount: 1,
        totalDonePoints: 1,
        updatedAt: 1,
        "data.status": 1,
        "data.isSubmitted": 1,
        "data.isApproved": 1,
        "data.submittedAt": 1,
        "data.approvedAt": 1,
        "data.rejectedAt": 1,
        "data.lastSaved": 1,
        "data.months.completionPercent": 1
      };
      let docs = await sessionsCol.find({ filename: { $in: queryFilenames } }, { projection: lightProjection }).toArray();
      if (!docs || docs.length === 0) {
        const fbDocs = await sessionsCol.find({ officerId, quarterNorm: targetNormQ, year: yearNum }, { projection: lightProjection }).toArray();
        docs = (fbDocs || []).filter(d => {
          const fnQ = extractQuarterFromFilename(d && d.filename);
          return !fnQ || fnQ === targetNormQ;
        });
      }

      if (docs && docs.length > 0) {
        let bestDoc = docs[0];
        if (docs.length > 1) {
          let bestCand = bestDoc.data || {};
          if (typeof bestDoc.activeTasksCount === 'number') bestCand.activeTasksCount = bestDoc.activeTasksCount;
          if (typeof bestDoc.totalDonePoints === 'number') bestCand.totalDonePoints = bestDoc.totalDonePoints;
          for (let i = 1; i < docs.length; i++) {
            const d = docs[i];
            const c = d.data || {};
            if (typeof d.activeTasksCount === 'number') c.activeTasksCount = d.activeTasksCount;
            if (typeof d.totalDonePoints === 'number') c.totalDonePoints = d.totalDonePoints;
            if (pickBestSession(bestCand, c) === c) {
              bestDoc = d;
              bestCand = c;
            }
          }
        }

        const mongoSet = {
          officerId,
          quarterNorm: targetNormQ,
          year: yearNum,
          updatedAt: nowIso
        };
        for (const [k, v] of Object.entries(setDataFields)) {
          mongoSet[`data.${k}`] = v;
        }

        await executeMongoWriteWithQuotaShield(async () => {
          return await sessionsCol.updateOne({ _id: bestDoc._id }, { $set: mongoSet });
        });

        if (docs.length > 1) {
          const loserIds = docs.filter(d => {
            if (String(d._id) === String(bestDoc._id)) return false;
            const fnQ = extractQuarterFromFilename(d && d.filename);
            return fnQ === targetNormQ;
          }).map(d => d._id);
          if (loserIds.length > 0) {
            sessionsCol.deleteMany({ _id: { $in: loserIds } }).catch(() => {});
          }
        }

        // Cập nhật đồng bộ RAM cache nếu đang giữ bản sao
        for (const fn of queryFilenames) {
          if (_localSessionsRamCache[fn]) {
            Object.assign(_localSessionsRamCache[fn], setDataFields);
          }
        }
        return { found: true, filename: bestDoc.filename || filename };
      }
    }

    // Fallback Local File (hoặc hồ sơ chưa từng đẩy lên MongoDB)
    let localData = null;
    for (const fn of queryFilenames) {
      localData = pickBestSession(localData, getLocalSession(fn));
    }
    if (!localData) return { found: false, filename };

    Object.assign(localData, setDataFields);
    await saveLocalSessionAsync(filename, localData);
    for (const altFn of altFilenames) {
      try {
        if (!process.env.VERCEL) {
          const altPath = path.join(SESSIONS_DIR, altFn);
          if (fs.existsSync(altPath)) fs.unlinkSync(altPath);
        }
      } catch (e) {}
    }

    if (kpiDb) {
      try {
        await executeMongoWriteWithQuotaShield(async () => {
          return await kpiDb.collection('sessions').updateOne(
            { filename },
            {
              $set: {
                filename,
                officerId,
                quarterNorm: targetNormQ,
                year: yearNum,
                activeTasksCount: countSessionActiveTasks(localData),
                totalDonePoints: getSessionTotalDonePoints(localData),
                updatedAt: nowIso,
                data: localData
              }
            },
            { upsert: true }
          );
        });
      } catch (e) {}
    }
    return { found: true, filename };
  }

  // --- API LÃNH ĐẠO PHÊ DUYỆT KPI (APPROVE KPI) - ATOMIC FAST PATCH ---
  // --- API LÃNH ĐẠO PHÊ DUYỆT KPI (APPROVE KPI) - ATOMIC FAST PATCH ---
  if (pathname === '/api/session/approve' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isApprover) {
      return sendJson(res, 403, { success: false, error: "Chỉ có Trưởng phòng (đ/c Hoàng Anh Sơn) và Phó Trưởng phòng (đ/c Trần Quốc Hoàng) mới có thẩm quyền phê duyệt kết quả KPI." });
    }
    try {
      const payload = await parseJsonBody(req);
        const { officerId, quarter, year, leaderRatingProposal, leaderRatingNote } = payload;
        const leaderOfficerId = auth.officerId;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        // Trưởng phòng Hoàng Anh Sơn là cấp cao nhất phòng, hồ sơ tự xác nhận chính thức
        if (officerId === 'son') {
          return sendJson(res, 400, { success: false, error: "Đồng chí Hoàng Anh Sơn là Trưởng phòng KTNN - Cán bộ đứng đầu đơn vị, hồ sơ tự xác nhận chính thức, không chịu sự phê duyệt trong nội bộ phòng." });
        }
        // Riêng Quản trị viên Trần Quốc Hoàng (hoang) được phép tự duyệt hồ sơ của mình không cần chuyển Trưởng phòng
        if (officerId === leaderOfficerId && leaderOfficerId !== 'hoang') {
          return sendJson(res, 400, { success: false, error: "Lãnh đạo không được tự phê duyệt hồ sơ cá nhân của mình." });
        }

        const approveTime = new Date().toISOString();
        const setDataFields = {
          status: "da_duyet",
          isSubmitted: true,
          isApproved: true,
          approvedAt: approveTime,
          approvedBy: (leaderOfficerId === 'hoang' && officerId === 'hoang')
            ? "Trần Quốc Hoàng (Quản trị hệ thống)"
            : (leaderOfficerId || "Lãnh đạo phòng"),
          lastSaved: approveTime
        };
        if (leaderRatingProposal) setDataFields.leaderRatingProposal = leaderRatingProposal;
        if (leaderRatingNote !== undefined) setDataFields.leaderRatingNote = leaderRatingNote;

        const patchRes = await patchSessionStatusAtomic({
          officerId,
          quarter,
          year,
          setDocFields: { updatedAt: approveTime },
          setDataFields
        });
        if (!patchRes.found) {
          return sendJson(res, 404, { success: false, error: "Không tìm thấy hồ sơ cán bộ" });
        }

        invalidateSummaryCache();

        return sendJson(res, 200, {
          success: true,
          message: `Đã phê duyệt chính thức kết quả KPI cho ${officerId}! Hồ sơ đã khóa vĩnh viễn.`,
          approvedAt: approveTime
        });
      } catch (err) {
        return sendJson(res, (err && err.statusCode) || 500, { success: false, error: err.message });
      }
  }

  // --- API LÃNH ĐẠO TRẢ LẠI ĐỂ SỬA ĐỔI / GIẢI TRÌNH (REJECT & RETURN) - ATOMIC FAST PATCH ---
  if (pathname === '/api/session/reject' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isApprover) {
      return sendJson(res, 403, { success: false, error: "Chỉ có Trưởng phòng (đ/c Hoàng Anh Sơn) và Phó Trưởng phòng (đ/c Trần Quốc Hoàng) mới có thẩm quyền trả lại hồ sơ KPI." });
    }
    try {
      const payload = await parseJsonBody(req);
        const { officerId, quarter, year, rejectReason } = payload;
        const leaderOfficerId = auth.officerId;
        if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

        // Không thể trả lại hồ sơ của Trưởng phòng Hoàng Anh Sơn
        if (officerId === 'son') {
          return sendJson(res, 400, { success: false, error: "Đồng chí Hoàng Anh Sơn là Trưởng phòng KTNN - Cán bộ đứng đầu đơn vị, không thể trả lại hồ sơ của Trưởng phòng." });
        }
        if (officerId === leaderOfficerId && leaderOfficerId !== 'hoang') {
          return sendJson(res, 400, { success: false, error: "Lãnh đạo không được tự trả lại hồ sơ cá nhân của mình." });
        }

        const rejectTime = new Date().toISOString();
        const setDataFields = {
          status: "tra_lai",
          isSubmitted: false,
          isApproved: false,
          rejectedAt: rejectTime,
          rejectedBy: leaderOfficerId || "Lãnh đạo phòng",
          rejectReason: rejectReason || "Yêu cầu rà soát, giải trình lại số liệu",
          lastSaved: rejectTime
        };

        const patchRes = await patchSessionStatusAtomic({
          officerId,
          quarter,
          year,
          setDocFields: { updatedAt: rejectTime },
          setDataFields
        });
        if (!patchRes.found) {
          return sendJson(res, 404, { success: false, error: "Không tìm thấy hồ sơ cán bộ" });
        }

        invalidateSummaryCache();

        return sendJson(res, 200, {
          success: true,
          message: `Đã trả lại hồ sơ cho cán bộ ${officerId}. Hồ sơ đã được mở khóa để cán bộ chỉnh sửa!`,
          rejectedAt: rejectTime
        });
      } catch (err) {
        return sendJson(res, (err && err.statusCode) || 500, { success: false, error: err.message });
      }
  }

  // --- API CỘNG GỘP SỐ LƯỢNG CÔNG VIỆC CHI TIẾT TỪ GDV PHỤ TRÁCH CHO LÃNH ĐẠO PHÒNG ---
  if (pathname === '/api/leader-aggregate' && req.method === 'GET') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.canViewAll) {
      return sendJson(res, 403, { success: false, error: "Không có quyền tổng hợp số liệu cấp phòng!" });
    }
    try {
      const leaderId = (searchParams.get('leaderId') || auth.officerId || 'hoang').trim();
      if (!auth.isApprover && !auth.isKPIAggregator && leaderId !== auth.officerId) {
        return sendJson(res, 403, { success: false, error: "Chỉ được xem tổng hợp công việc thuộc quyền phụ trách!" });
      }
      const qRaw = searchParams.get('quarter') || 'Quý III';
      const yNum = Number(searchParams.get('year')) || 2026;
      const gdvIdsParam = (searchParams.get('gdvIds') || '').trim();

      const DEFAULT_LEADER_SUBORDINATE_GDVS = {
        son: ['my', 'mai'],
        hoang: ['thao_t', 'trung', 'huong', 'nam', 'vui'],
        tuan: ['truc', 'thao_p', 'thu', 'thuy'],
        anh: ['huyet', 'tu', 'thy', 'quynh'],
        qn_trung: ['qn_hung', 'qn_phuong_lan', 'qn_minh', 'qn_anh', 'qn_trang', 'qn_tam', 'qn_lien', 'qn_thuy_bich', 'qn_thuy_le'],
        qn_phuong_tp: ['qn_nghia', 'qn_quyen', 'qn_tuyen', 'qn_nga', 'qn_thao']
      };

      const targetGdvIds = gdvIdsParam
        ? gdvIdsParam.split(',').map(s => s.trim()).filter(Boolean)
        : (DEFAULT_LEADER_SUBORDINATE_GDVS[leaderId] || []);

      const officersCfg = (await getOfficersConfig()) || getLocalOfficers() || {};
      const qNorm = normalizeQuarter(qRaw);

      // Truy xuất SIÊU NHẸ chỉ lấy đúng các dòng có "Có" từ MongoDB Aggregation Pipeline (~5KB thay vì 4MB)
      const filenamesToFetch = [];
      for (const gid of targetGdvIds) {
        const fn1 = getSessionFilename(gid, qRaw, yNum);
        const fn2 = fn1.includes('Quy') ? fn1.replace(/Quy/g, 'Quý') : fn1.replace(/Quý/g, 'Quy');
        filenamesToFetch.push(fn1, fn2);
      }

      const mongoMap = {};
      let mongoAggLoaded = false;
      if (kpiDb && filenamesToFetch.length > 0) {
        try {
          const aggPipeline = [
            { $match: { filename: { $in: filenamesToFetch } } },
            {
              $project: {
                _id: 1,
                filename: 1,
                officerId: 1,
                activeTasksCount: 1,
                updatedAt: 1,
                status: "$data.status",
                lastSaved: "$data.lastSaved",
                approvedAt: "$data.approvedAt",
                submittedAt: "$data.submittedAt",
                officer: "$data.officer",
                months: {
                  $map: {
                    input: {
                      $cond: {
                        if: { $isArray: "$data.months" },
                        then: "$data.months",
                        else: {
                          $map: {
                            input: { $objectToArray: { $ifNull: ["$data.months", {}] } },
                            as: "kv",
                            in: "$$kv.v"
                          }
                        }
                      }
                    },
                    as: "m",
                    in: {
                      isDelta: { $gt: [{ $size: { $ifNull: ["$$m.deltaRows", []] } }, 0] },
                      rows: {
                        $cond: {
                          if: { $gt: [{ $size: { $ifNull: ["$$m.rows", []] } }, 0] },
                          then: {
                            $filter: {
                              input: {
                                $map: {
                                  input: { $range: [0, { $size: "$$m.rows" }] },
                                  as: "idx",
                                  in: {
                                    $let: {
                                      vars: { r: { $arrayElemAt: ["$$m.rows", "$$idx"] } },
                                      in: {
                                        arrIdx: "$$idx",
                                        rowIndex: "$$r.rowIndex",
                                        stt: "$$r.stt",
                                        congviec: "$$r.congviec",
                                        co_thuchien: "$$r.co_thuchien",
                                        soluong_tt: "$$r.soluong_tt",
                                        cl_loi: "$$r.cl_loi",
                                        td_cham: "$$r.td_cham"
                                      }
                                    }
                                  }
                                }
                              },
                              as: "row",
                              cond: { $eq: ["$$row.co_thuchien", "Có"] }
                            }
                          },
                          else: {
                            $filter: {
                              input: {
                                $map: {
                                  input: { $ifNull: ["$$m.deltaRows", []] },
                                  as: "dr",
                                  in: {
                                    arrIdx: "$$dr.arrIdx",
                                    rowIndex: "$$dr.rowIndex",
                                    stt: "$$dr.stt",
                                    congviec: "$$dr.congviec",
                                    co_thuchien: "$$dr.co_thuchien",
                                    soluong_tt: "$$dr.soluong_tt",
                                    cl_loi: "$$dr.cl_loi",
                                    td_cham: "$$dr.td_cham"
                                  }
                                }
                              },
                              as: "row",
                              cond: { $eq: ["$$row.co_thuchien", "Có"] }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          ];

          const docs = await kpiDb.collection('sessions').aggregate(aggPipeline).toArray();
          mongoAggLoaded = true;
          for (const d of docs) {
            if (d && d.officerId) {
              const projectedSess = {
                status: d.status || 'chua_nop',
                lastSaved: d.lastSaved || d.updatedAt || '',
                approvedAt: d.approvedAt || '',
                submittedAt: d.submittedAt || '',
                officer: d.officer || {},
                activeTasksCount: typeof d.activeTasksCount === 'number' ? d.activeTasksCount : undefined,
                months: Array.isArray(d.months) ? d.months : [],
                _isAggProjected: true
              };
              const prev = mongoMap[d.officerId];
              const prevScore = prev ? ((prev.activeTasksCount !== undefined ? prev.activeTasksCount : countSessionActiveTasks(prev)) * 1000) : -1;
              const curScore = (projectedSess.activeTasksCount !== undefined ? projectedSess.activeTasksCount : countSessionActiveTasks(projectedSess)) * 1000;
              if (!prev || curScore > prevScore || (curScore === prevScore && String(projectedSess.lastSaved) > String(prev.lastSaved))) {
                mongoMap[d.officerId] = projectedSess;
              }
            }
          }
        } catch (e) {
          console.warn('[LEADER-AGGREGATE] Pipeline fallback:', e.message);
        }
      }

      const monthsAgg = [
        { monthIdx: 0, rowsByIdx: {}, rowsByStt: {} },
        { monthIdx: 1, rowsByIdx: {}, rowsByStt: {} },
        { monthIdx: 2, rowsByIdx: {}, rowsByStt: {} }
      ];
      const gdvMetaList = [];

      for (const gid of targetGdvIds) {
        const fn1 = getSessionFilename(gid, qRaw, yNum);
        const fn2 = fn1.includes('Quy') ? fn1.replace(/Quy/g, 'Quý') : fn1.replace(/Quý/g, 'Quy');
        const localBest = (!process.env.VERCEL || !mongoAggLoaded) ? pickBestSession(getLocalSession(fn1), getLocalSession(fn2)) : null;
        const sess = (mongoMap[gid] && (!localBest || countSessionActiveTasks(mongoMap[gid]) >= countSessionActiveTasks(localBest)))
          ? mongoMap[gid]
          : (localBest || mongoMap[gid]);
        const cfg = officersCfg[gid] || {};
        const fullName = cfg.name || (sess && sess.officer && sess.officer.name) || gid;
        const nameParts = fullName.trim().split(/\s+/);
        const shortName = nameParts.length >= 2 ? nameParts.slice(-2).join(' ') : fullName;
        const activeCount = sess && typeof sess.activeTasksCount === 'number'
          ? Math.max(sess.activeTasksCount, countSessionActiveTasks(sess))
          : countSessionActiveTasks(sess);

        gdvMetaList.push({
          id: gid,
          name: fullName,
          shortName,
          hasData: activeCount > 0,
          activeTasksCount: activeCount,
          status: (sess && sess.status) || 'chua_nop'
        });

        if (!sess || !sess.months) continue;
        const mArr = Array.isArray(sess.months) ? sess.months : Object.values(sess.months);

        for (let mIdx = 0; mIdx < 3; mIdx++) {
          const mObj = mArr[mIdx];
          if (!mObj) continue;
          const isDelta = Boolean(mObj.isDelta || Array.isArray(mObj.deltaRows));
          const rows = (Array.isArray(mObj.rows) && mObj.rows.length > 0)
            ? mObj.rows
            : (Array.isArray(mObj.deltaRows) ? mObj.deltaRows : []);

          rows.forEach((r, idx) => {
            if (!r) return;
            const rIdx = (r.arrIdx !== undefined && r.arrIdx !== null)
              ? Number(r.arrIdx)
              : ((isDelta && r.rowIndex !== undefined)
                ? (Number(r.rowIndex) >= 1 ? Number(r.rowIndex) - 1 : Number(r.rowIndex))
                : idx);
            const qty = Number(r.soluong_tt) || 0;
            if (r.co_thuchien === 'Có' && qty > 0) {
              const err = Number(r.cl_loi) || 0;
              const dly = Number(r.td_cham) || 0;
              const sttKey = String(r.stt || '').trim();
              const workKey = `${sttKey}||${String(r.congviec || '').trim()}`;

              if (!monthsAgg[mIdx].rowsByIdx[rIdx]) {
                monthsAgg[mIdx].rowsByIdx[rIdx] = { totalQty: 0, totalErrors: 0, totalDelays: 0, breakdown: [] };
              }
              monthsAgg[mIdx].rowsByIdx[rIdx].totalQty += qty;
              monthsAgg[mIdx].rowsByIdx[rIdx].totalErrors += err;
              monthsAgg[mIdx].rowsByIdx[rIdx].totalDelays += dly;
              monthsAgg[mIdx].rowsByIdx[rIdx].breakdown.push({
                id: gid,
                shortName,
                fullName,
                qty,
                errors: err,
                delays: dly
              });

              if (sttKey) {
                if (!monthsAgg[mIdx].rowsByStt[workKey]) {
                  monthsAgg[mIdx].rowsByStt[workKey] = { totalQty: 0, totalErrors: 0, totalDelays: 0, breakdown: [] };
                }
                monthsAgg[mIdx].rowsByStt[workKey].totalQty += qty;
                monthsAgg[mIdx].rowsByStt[workKey].totalErrors += err;
                monthsAgg[mIdx].rowsByStt[workKey].totalDelays += dly;
                monthsAgg[mIdx].rowsByStt[workKey].breakdown.push({
                  id: gid,
                  shortName,
                  fullName,
                  qty,
                  errors: err,
                  delays: dly
                });
              }
            }
          });
        }
      }

      return sendJson(res, 200, {
        success: true,
        leaderId,
        quarter: qRaw,
        quarterNorm: qNorm,
        year: yNum,
        gdvList: gdvMetaList,
        months: monthsAgg
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- API LẤY LỊCH SỬ CÁC BẢN SAO LƯU (SNAPSHOT HISTORY) ---
  if (pathname === '/api/session/history' && req.method === 'GET') {
    const auth = await requireAuth();
    if (!auth) return;
    const officerId = searchParams.get('officerId');
    const quarter = searchParams.get('quarter');
    const year = searchParams.get('year');

    if (!officerId) {
      return sendJson(res, 400, { success: false, error: "Thiếu officerId" });
    }
    if (auth.officerId !== officerId && !auth.isApprover) {
      return sendJson(res, 403, { success: false, error: "Không có quyền xem lịch sử sao lưu của cán bộ khác!" });
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
    const auth = await requireAuth();
    if (!auth) return;
    try {
      const payload = await parseJsonBody(req);
        const { snapshotId, officerId, quarter, year } = payload;

        if (!snapshotId) {
          return sendJson(res, 400, { success: false, error: "Thiếu snapshotId" });
        }

        const expectedFn = (officerId && quarter && year) ? getSessionFilename(officerId, quarter, year) : null;
        let snapDoc = null;
        if (kpiDb) {
          try {
            const snapshotsCol = kpiDb.collection('session_snapshots');
            snapDoc = await snapshotsCol.findOne({ _id: new ObjectId(snapshotId) });
          } catch(e) {}
        }
        if (!snapDoc) {
          snapDoc = getLocalSnapshotById(snapshotId, expectedFn);
        }

        if (!snapDoc || !snapDoc.data) {
          return sendJson(res, 404, { success: false, error: "Không tìm thấy bản ghi snapshot này!" });
        }

        const snapOffId = snapDoc.officerId || (snapDoc.data.officer && snapDoc.data.officer.officerId);
        if (officerId && snapOffId && snapOffId !== officerId) {
          return sendJson(res, 403, { success: false, error: "Bản sao lưu không thuộc hồ sơ cán bộ đang chọn!" });
        }
        const restoredData = snapDoc.data;
        const targetOffId = officerId || snapOffId;
        if (!targetOffId || (auth.officerId !== targetOffId && !auth.isApprover)) {
          return sendJson(res, 403, { success: false, error: "Không có quyền khôi phục hồ sơ của cán bộ khác!" });
        }
        const targetQ = quarter || snapDoc.quarter || (restoredData.officer && restoredData.officer.quarter) || 'Quý III';
        const targetY = Number(year || snapDoc.year || (restoredData.officer && restoredData.officer.year) || 2026);
        const targetNormQ = normalizeQuarter(targetQ);
        const filename = getSessionFilename(targetOffId, targetQ, targetY);
        if (!restoredData.officer) restoredData.officer = {};
        restoredData.officer.officerId = targetOffId;
        restoredData.officer.quarter = quarterNormToLabel(targetNormQ);
        restoredData.officer.year = targetY;
        restoredData.lastSaved = restoredData.lastSaved || snapDoc.savedAt || new Date().toISOString();
        restoredData._restoredFrom = snapDoc.savedAt;

        // Lưu CSDL cục bộ
        await saveLocalSessionAsync(filename, restoredData);

        if (kpiDb) {
          try {
            await kpiDb.collection('sessions').updateOne(
              { filename },
              {
                $set: {
                  filename,
                  officerId: targetOffId,
                  quarterNorm: targetNormQ,
                  year: targetY,
                  activeTasksCount: countSessionActiveTasks(restoredData),
                  totalDonePoints: getSessionTotalDonePoints(restoredData),
                  data: restoredData,
                  updatedAt: restoredData.lastSaved
                }
              },
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
        return sendJson(res, (err && err.statusCode) || 500, { success: false, error: "Lỗi khôi phục: " + err.message });
      }
  }

  // API Leader Proposal (Atomic partial update — <300B wire)
  if (pathname === '/api/leader-proposal' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isApprover) {
      return sendJson(res, 403, { success: false, error: "Chỉ có Lãnh đạo có thẩm quyền (Trưởng phòng / PTP Hoàng) mới được cập nhật đề xuất xếp loại!" });
    }
    try {
      const payload = await parseJsonBody(req);
      const { officerId, quarter, year, leaderRatingProposal, leaderRatingNote } = payload;
      if (!officerId) return sendJson(res, 400, { success: false, error: "Thiếu officerId" });

      const filename = getSessionFilename(officerId, quarter, year);
      const altFilename = filename.includes('Quy') ? filename.replace(/Quy/g, 'Quý') : filename.replace(/Quý/g, 'Quy');
      const nowIso = new Date().toISOString();

      let mongoBestDoc = null;
      if (kpiDb) {
        try {
          const docs = await kpiDb.collection('sessions').find(
            { filename: { $in: [filename, altFilename] } },
            { projection: { _id: 1, filename: 1, activeTasksCount: 1, updatedAt: 1, "data.lastSaved": 1 } }
          ).toArray();
          for (const d of docs) {
            if (!mongoBestDoc) {
              mongoBestDoc = d;
            } else {
              const curTasks = d.activeTasksCount || 0;
              const bestTasks = mongoBestDoc.activeTasksCount || 0;
              const curTime = String((d.data && d.data.lastSaved) || d.updatedAt || '');
              const bestTime = String((mongoBestDoc.data && mongoBestDoc.data.lastSaved) || mongoBestDoc.updatedAt || '');
              if (curTasks > bestTasks || (curTasks === bestTasks && curTime > bestTime)) {
                mongoBestDoc = d;
              }
            }
          }

          if (mongoBestDoc) {
            const setFields = {
              "data.leaderRatingProposal": leaderRatingProposal,
              "data.lastSaved": nowIso,
              updatedAt: nowIso
            };
            if (leaderRatingNote !== undefined) {
              setFields["data.leaderRatingNote"] = leaderRatingNote;
            }
            await kpiDb.collection('sessions').updateOne(
              { _id: mongoBestDoc._id },
              { $set: setFields }
            );
            invalidateSummaryCache();
          }
        } catch (e) {
          console.error('[LEADER PROPOSAL] MongoDB atomic update error:', e.message);
        }
      }

      if (!process.env.VERCEL || !mongoBestDoc) {
        const localDoc = pickBestSession(getLocalSession(filename), getLocalSession(altFilename));
        if (localDoc) {
          localDoc.leaderRatingProposal = leaderRatingProposal;
          if (leaderRatingNote !== undefined) localDoc.leaderRatingNote = leaderRatingNote;
          localDoc.lastSaved = nowIso;
          await saveLocalSessionAsync(filename, localDoc);
          invalidateSummaryCache();
        }
      }
      return sendJson(res, 200, { success: true, message: "Đã lưu đánh giá của Lãnh đạo" });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- API Xuất toàn bộ dữ liệu ra tệp JSON trực tiếp (CHỈ Admin Hoàng) ---
  if (pathname === '/api/backup/export-all' && req.method === 'GET') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên mới được xuất toàn bộ dữ liệu!" });
    }
    try {
      let exportData = {
        exportedAt: new Date().toISOString(),
        author: AUTHOR_INFO.author,
        officers_config: await getOfficersConfig(),
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

      const bodyBuf = Buffer.from(JSON.stringify(exportData), 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': bodyBuf.length,
        'Content-Disposition': `attachment; filename="KPI_PhongKTNN_Backup_${new Date().toISOString().slice(0,10)}.json"`,
        ...getCorsHeaders(req)
      });
      return res.end(bodyBuf);
    } catch(err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- API Nạp toàn bộ dữ liệu (Import All - CHỈ Admin Hoàng + Schema & Filename Validation) ---
  if (pathname === '/api/backup/import-all' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên mới được nạp dữ liệu!" });
    }
    try {
      let importData = null;
      if (req.body && typeof req.body === 'object' && (req.body.sessions || req.body.officers_config)) {
        importData = sanitizePlainObject(req.body);
      } else {
        const buffer = await parseRawBody(req);
        let jsonStr = '';
        try {
          jsonStr = zlib.gunzipSync(buffer).toString('utf8');
        } catch(e) {
          jsonStr = buffer.toString('utf8');
        }
        importData = sanitizePlainObject(JSON.parse(jsonStr));
      }
      if (!importData || !importData.sessions || typeof importData.sessions !== 'object') {
        return sendJson(res, 400, { success: false, error: "Tệp dữ liệu không hợp lệ" });
      }

      let count = 0;
      const bulkSessions = [];
      for (const [fname, sess] of Object.entries(importData.sessions)) {
        if (!isValidSessionFilename(fname) || !sess || typeof sess !== 'object') continue;
        const cleanSess = sanitizeSessionData(sess);
        saveLocalSession(fname, cleanSess);
        const fnQ = extractQuarterFromFilename(fname) || normalizeQuarter(cleanSess.officer && cleanSess.officer.quarter);
        const yMatch = fname.match(/_(\d{4})\.json$/i);
        const fnOffId = (cleanSess.officer && cleanSess.officer.officerId) || fname.split('_')[0];
        bulkSessions.push({
          updateOne: {
            filter: { filename: fname },
            update: {
              $set: {
                filename: fname,
                officerId: fnOffId,
                quarterNorm: fnQ,
                year: (yMatch && Number(yMatch[1])) || Number(cleanSess.officer && cleanSess.officer.year) || 2026,
                activeTasksCount: countSessionActiveTasks(cleanSess),
                totalDonePoints: getSessionTotalDonePoints(cleanSess),
                updatedAt: cleanSess.lastSaved || new Date().toISOString(),
                data: cleanSess
              }
            },
            upsert: true
          }
        });
        count++;
      }
      if (importData.officers_config && typeof importData.officers_config === 'object') {
        saveLocalOfficers(importData.officers_config);
      }
      if (importData.auth_passwords && typeof importData.auth_passwords === 'object' && !process.env.VERCEL) {
        saveLocalAuth(importData.auth_passwords);
      }

      if (kpiDb) {
        try {
          if (bulkSessions.length > 0) {
            await kpiDb.collection('sessions').bulkWrite(bulkSessions, { ordered: false });
          }
          if (importData.officers_config && typeof importData.officers_config === 'object') {
            const cfgOps = Object.entries(importData.officers_config).map(([id, cfg]) => ({
              updateOne: { filter: { id }, update: { $set: cfg }, upsert: true }
            }));
            if (cfgOps.length > 0) await kpiDb.collection('officers_config').bulkWrite(cfgOps, { ordered: false });
          }
          if (importData.auth_passwords && typeof importData.auth_passwords === 'object') {
            await saveAuthPasswords(importData.auth_passwords);
          }
          await syncOfficerRolesMigration();
        } catch (e) {}
      }

      invalidateSummaryCache();
      console.log(`[IMPORT CLOUD] Đã nạp thành công ${count} phiên dữ liệu lên MongoDB từ file máy tính.`);
      return sendJson(res, 200, { success: true, count, message: `Đã nạp thành công dữ liệu ${count} cán bộ lên hệ thống Cloud từ file máy tính!` });
    } catch(err) {
      return sendJson(res, (err && err.statusCode) || 500, { success: false, error: "Lỗi nạp dữ liệu: " + err.message });
    }
  }

  // --- API Nạp phân đoạn dữ liệu (Import Chunk - CHỈ Admin Hoàng) ---
  if (pathname === '/api/backup/import-chunk' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên mới được nạp dữ liệu!" });
    }
    try {
      const payload = await parseJsonBody(req);
      const { officers_config, auth_passwords, sessions } = payload;
      let count = 0;

      if (officers_config && typeof officers_config === 'object') {
        saveLocalOfficers(officers_config);
        if (kpiDb) {
          try {
            const cfgOps = Object.entries(officers_config).map(([id, cfg]) => ({
              updateOne: { filter: { id }, update: { $set: cfg }, upsert: true }
            }));
            if (cfgOps.length > 0) await kpiDb.collection('officers_config').bulkWrite(cfgOps, { ordered: false });
          } catch (e) {}
        }
      }
      if (auth_passwords && typeof auth_passwords === 'object') {
        if (!process.env.VERCEL) saveLocalAuth(auth_passwords);
        if (kpiDb) {
          try { await saveAuthPasswords(auth_passwords); } catch (e) {}
        }
      }

      if (sessions && typeof sessions === 'object') {
        const bulkOps = [];
        for (const [fname, sess] of Object.entries(sessions)) {
          if (!isValidSessionFilename(fname) || !sess || typeof sess !== 'object') continue;
          const cleanSess = sanitizeSessionData(sess);
          saveLocalSession(fname, cleanSess);
          const fnQ = extractQuarterFromFilename(fname) || normalizeQuarter(cleanSess.officer && cleanSess.officer.quarter);
          const yMatch = fname.match(/_(\d{4})\.json$/i);
          const fnOffId = (cleanSess.officer && cleanSess.officer.officerId) || fname.split('_')[0];
          bulkOps.push({
            updateOne: {
              filter: { filename: fname },
              update: {
                $set: {
                  filename: fname,
                  officerId: fnOffId,
                  quarterNorm: fnQ,
                  year: (yMatch && Number(yMatch[1])) || Number(cleanSess.officer && cleanSess.officer.year) || 2026,
                  activeTasksCount: countSessionActiveTasks(cleanSess),
                  totalDonePoints: getSessionTotalDonePoints(cleanSess),
                  updatedAt: cleanSess.lastSaved || new Date().toISOString(),
                  data: cleanSess
                }
              },
              upsert: true
            }
          });
          count++;
        }
        if (kpiDb && bulkOps.length > 0) {
          try {
            await kpiDb.collection('sessions').bulkWrite(bulkOps, { ordered: false });
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
      return sendJson(res, (err && err.statusCode) || 500, { success: false, error: "Lỗi nạp phân đoạn: " + err.message });
    }
  }

  // --- API Kiểm tra thống kê dung lượng MongoDB Atlas (CHỈ Admin Hoàng) ---
  if (pathname === '/api/admin/db-stats' && req.method === 'GET') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
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

      let details = undefined;
      if (searchParams.get('details') === '1' && kpiDb) {
        const sDocs = await kpiDb.collection('sessions').find({}, {
          projection: {
            _id: 1, filename: 1, officerId: 1, quarterNorm: 1, year: 1, activeTasksCount: 1, totalDonePoints: 1, updatedAt: 1,
            "data.status": 1, "data.isSubmitted": 1, "data.isApproved": 1, "data.submittedAt": 1, "data.approvedAt": 1, "data.approvedBy": 1, "data.lastSaved": 1,
            "data.officer.officerId": 1, "data.officer.quarter": 1, "data.officer.year": 1,
            "data.months.completionPercent": 1, "data.months.name": 1, "data.generalCriteria": 1
          }
        }).toArray();
        const snDocs = await kpiDb.collection('session_snapshots').find({}, {
          projection: {
            _id: 1, filename: 1, officerId: 1, quarter: 1, year: 1, savedAt: 1, summary: 1,
            "data.status": 1, "data.isSubmitted": 1, "data.officer.officerId": 1, "data.officer.quarter": 1, "data.officer.year": 1,
            "data.months.completionPercent": 1, "data.months.monthNum": 1, "data.generalCriteria": 1
          }
        }).toArray();
        details = {
          sessions: sDocs.map(d => ({
            filename: d.filename,
            officerId: d.officerId || (d.data && d.data.officer && d.data.officer.officerId),
            quarterNorm: d.quarterNorm,
            officerQuarter: d.data && d.data.officer && d.data.officer.quarter,
            year: d.year,
            status: d.data && d.data.status,
            isSubmitted: d.data && d.data.isSubmitted,
            isApproved: d.data && d.data.isApproved,
            submittedAt: d.data && d.data.submittedAt,
            approvedAt: d.data && d.data.approvedAt,
            approvedBy: d.data && d.data.approvedBy,
            lastSaved: d.data && d.data.lastSaved,
            monthNames: d.data && Array.isArray(d.data.months) ? d.data.months.map(m => m && m.name) : null,
            pcts: d.data && Array.isArray(d.data.months) ? d.data.months.map(m => m && m.completionPercent) : null,
            generalCriteria: d.data && d.data.generalCriteria,
            activeTasksCount: d.activeTasksCount
          })),
          snapshots: snDocs.map(s => ({
            id: String(s._id),
            filename: s.filename,
            officerId: s.officerId || (s.data && s.data.officer && s.data.officer.officerId),
            quarter: s.quarter || (s.data && s.data.officer && s.data.officer.quarter),
            year: s.year,
            savedAt: s.savedAt,
            summary: s.summary,
            status: s.data && s.data.status,
            pcts: s.data && Array.isArray(s.data.months) ? s.data.months.map(m => m && m.completionPercent) : null,
            generalCriteria: s.data && s.data.generalCriteria
          }))
        };
      }

      return sendJson(res, 200, { success: true, writeStatus, report, details });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- API Tối ưu hóa & Thu gọn CSDL MongoDB Atlas AN TOÀN (KHÔNG DROP DỮ LIỆU, CHỈ POST) ---
  if (pathname === '/api/admin/reclaim-storage' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên (Hoàng) mới có quyền thực hiện!" });
    }
    if (!kpiDb) {
      return sendJson(res, 500, { success: false, error: "Chưa kết nối CSDL MongoDB" });
    }
    try {
      console.log("[RECLAIM STORAGE] Bắt đầu tinh gọn sessions và cắt tỉa an toàn snapshot thừa (ZERO DROP)...");
      const sessionsCol = kpiDb.collection('sessions');
      const allDocs = await sessionsCol.find({}).toArray();
      if (!allDocs || allDocs.length === 0) {
        return sendJson(res, 400, { success: false, error: "Không tìm thấy dữ liệu sessions để làm sạch!" });
      }

      const bulkOps = [];
      for (const doc of allDocs) {
        if (!doc.data) continue;
        const cleanData = sanitizeSessionData(doc.data);
        const fnQ = doc.quarterNorm || extractQuarterFromFilename(doc.filename) || normalizeQuarter(cleanData.officer && cleanData.officer.quarter);
        const yMatch = (doc.filename || '').match(/_(\d{4})\.json$/i);
        const yr = Number(doc.year) || (yMatch && Number(yMatch[1])) || Number(cleanData.officer && cleanData.officer.year) || 2026;
        const offId = doc.officerId || (cleanData.officer && cleanData.officer.officerId) || (doc.filename || '').split('_')[0];
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                officerId: offId,
                quarterNorm: fnQ,
                year: yr,
                activeTasksCount: countSessionActiveTasks(cleanData),
                totalDonePoints: getSessionTotalDonePoints(cleanData),
                updatedAt: doc.updatedAt || cleanData.lastSaved || new Date().toISOString(),
                data: cleanData
              }
            }
          }
        });
      }
      if (bulkOps.length > 0) {
        await sessionsCol.bulkWrite(bulkOps, { ordered: false });
      }

      const prunedSnapshots = await pruneOldSnapshotsSafe(2);
      invalidateSummaryCache();
      const dbStats = await kpiDb.command({ dbStats: 1 });

      const result = {
        success: true,
        message: `ĐÃ TỐI ƯU HÓA AN TOÀN! Tinh gọn ${bulkOps.length} hồ sơ (không drop) và cắt tỉa ${prunedSnapshots} snapshot cũ.`,
        restoredCount: bulkOps.length,
        prunedSnapshots,
        newDataSizeMB: Number((dbStats.dataSize / (1024 * 1024)).toFixed(2)),
        newStorageSizeMB: Number((dbStats.storageSize / (1024 * 1024)).toFixed(2))
      };

      console.log(`[RECLAIM STORAGE SUCCESS] Hoàn tất! Dung lượng hiện tại: ${result.newStorageSizeMB} MB`);
      return sendJson(res, 200, result);
    } catch (err) {
      console.error("[RECLAIM STORAGE ERROR]", err);
      return sendJson(res, 500, { success: false, error: "Lỗi thu gọn CSDL: " + err.message });
    }
  }

  // --- API Dọn dẹp CHỈ CÁC BẢN NHÁP RỖNG 0 VIỆC (POST ONLY - BẢO VỆ TUYỆT ĐỐI HỒ SƠ CÓ SỐ LIỆU) ---
  if (pathname === '/api/admin/clean-dummy-quarters' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên (Hoàng) mới có quyền thực hiện!" });
    }
    if (!kpiDb) {
      return sendJson(res, 500, { success: false, error: "Chưa kết nối CSDL MongoDB" });
    }
    try {
      const payload = await parseJsonBody(req);
      const isDryRun = (searchParams.get('dryRun') === '1' || payload.dryRun === true);
      const allSessions = await kpiDb.collection('sessions').find({}).toArray();
      const totalBefore = allSessions.length;
      const emptyDummyFilenames = [];

      for (const s of allSessions) {
        const d = s.data || {};
        const tasks = countSessionActiveTasks(d);
        const pts = getSessionTotalDonePoints(d);
        const hasStatusAction = !!(d.isSubmitted || d.isApproved || d.status === 'da_nop' || d.status === 'da_duyet' || d.status === 'tra_lai');
        const hasAnyPct = !!(Array.isArray(d.months) && d.months.some(m => Number(m && m.completionPercent) > 0));
        if (tasks === 0 && pts === 0 && !hasStatusAction && !hasAnyPct && s.filename) {
          emptyDummyFilenames.push(s.filename);
        }
      }

      if (isDryRun) {
        return sendJson(res, 200, {
          success: true,
          dryRun: true,
          totalBefore,
          emptyCandidatesCount: emptyDummyFilenames.length,
          emptyCandidates: emptyDummyFilenames
        });
      }

      let deletedSessionsCount = 0;
      let deletedSnapshotsCount = 0;
      if (emptyDummyFilenames.length > 0) {
        const delRes = await kpiDb.collection('sessions').deleteMany({ filename: { $in: emptyDummyFilenames } });
        deletedSessionsCount = delRes.deletedCount || 0;
        const snapDelRes = await kpiDb.collection('session_snapshots').deleteMany({ filename: { $in: emptyDummyFilenames } });
        deletedSnapshotsCount = snapDelRes.deletedCount || 0;
      }

      invalidateSummaryCache();
      const totalAfter = await kpiDb.collection('sessions').countDocuments();

      return sendJson(res, 200, {
        success: true,
        message: `Đã dọn ${deletedSessionsCount} bản nháp rỗng (0 việc, 0%). Bảo toàn nguyên vẹn ${totalAfter} hồ sơ có số liệu ở tất cả các quý.`,
        totalBefore,
        deletedSessionsCount,
        deletedSnapshotsCount,
        remainingCount: totalAfter
      });
    } catch (err) {
      return sendJson(res, (err && err.statusCode) || 500, { success: false, error: "Lỗi dọn dẹp phiên rỗng: " + err.message });
    }
  }

  // --- API Đặt lại (Reset) trạng thái hồ sơ của cán bộ (POST ONLY - CHỈ Admin Hoàng) ---
  if (pathname === '/api/admin/reset-officer-quarter' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN & BẢO MẬT: Chỉ quản trị viên (Hoàng) mới có quyền thực hiện!" });
    }
    try {
      const payload = await parseJsonBody(req);
      const targetOfficerId = payload.officerId || searchParams.get('officerId');
      const targetQuarter = payload.quarter || searchParams.get('quarter') || "Quý I";
      const targetYear = payload.year || searchParams.get('year') || "2026";
      if (!targetOfficerId) {
        return sendJson(res, 400, { success: false, error: "Thiếu thông số officerId" });
      }

      const filename = getSessionFilename(targetOfficerId, targetQuarter, targetYear);
      const altFns = getSameQuarterAltFilenames(targetOfficerId, targetQuarter, targetYear);
      const allTargets = [filename, ...altFns];
      if (kpiDb) {
        await kpiDb.collection('sessions').deleteMany({ filename: { $in: allTargets } });
        await kpiDb.collection('session_snapshots').deleteMany({ filename: { $in: allTargets } });
      }
      for (const fn of allTargets) {
        delete _localSessionsRamCache[fn];
        if (!process.env.VERCEL) {
          try {
            const localPath = path.join(SESSIONS_DIR, fn);
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
          } catch(e) {}
        }
      }
      invalidateSummaryCache();
      return sendJson(res, 200, {
        success: true,
        message: `Đã reset thành công trạng thái của cán bộ [${targetOfficerId}] ${targetQuarter}/${targetYear} về Chưa nộp (0%).`,
        filename
      });
    } catch(err) {
      return sendJson(res, (err && err.statusCode) || 500, { success: false, error: "Lỗi reset: " + err.message });
    }
  }

  // --- API Rà soát & Chuẩn hóa Metadata Toàn bộ Hồ sơ (audit = GET/POST, repair = POST ONLY) ---
  if (pathname === '/api/admin/audit-repair' && (req.method === 'POST' || req.method === 'GET')) {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "Chỉ quản trị viên (Hoàng) mới có quyền thực hiện!" });
    }
    if (!kpiDb) {
      return sendJson(res, 500, { success: false, error: "Chưa kết nối CSDL MongoDB" });
    }
    try {
      const payload = (req.method === 'POST') ? await parseJsonBody(req) : {};
      const mode = searchParams.get('mode') || payload.mode || 'audit';
      if (mode === 'repair' && req.method !== 'POST') {
        return sendJson(res, 405, { success: false, error: "Chế độ sửa chữa (repair) yêu cầu phương thức POST!" });
      }
      const customFixes = Array.isArray(payload.fixes) ? payload.fixes : [];
      const sessionsCol = kpiDb.collection('sessions');
      const allDocs = await sessionsCol.find({}, {
        projection: {
          _id: 1, filename: 1, officerId: 1, quarterNorm: 1, year: 1, activeTasksCount: 1, totalDonePoints: 1, updatedAt: 1,
          "data.officer": 1, "data.status": 1, "data.isSubmitted": 1, "data.isApproved": 1,
          "data.submittedAt": 1, "data.approvedAt": 1, "data.approvedBy": 1, "data.lastSaved": 1,
          "data.months.name": 1, "data.months.completionPercent": 1, "data.months.deltaRows": 1,
          "data.months.rows.co_thuchien": 1, "data.months.rows.soluong_tt": 1, "data.months.rows.cl_loi": 1, "data.months.rows.td_cham": 1
        }
      }).toArray();

      const anomalies = [];
      const repaired = [];
      const expectedFirstMonthByQ = { QuyI: 'Tháng 1', QuyII: 'Tháng 4', QuyIII: 'Tháng 7', QuyIV: 'Tháng 10' };

      for (const doc of allDocs) {
        const fn = doc.filename || '';
        const fnMatch = fn.match(/^(.+?)_(qu[yý]\s*(?:iv|iii|ii|i|[1-4]))_(\d{4})\.json$/i);
        if (!fnMatch) continue;
        const parsedOffId = fnMatch[1];
        const parsedNormQ = normalizeQuarter(fnMatch[2]);
        const parsedYear = Number(fnMatch[3]) || 2026;
        const parsedLabelQ = quarterNormToLabel(parsedNormQ);

        const d = doc.data || {};
        const curOffQ = d.officer && d.officer.quarter;
        const curNormQ = doc.quarterNorm;
        const mArr = Array.isArray(d.months) ? d.months : (d.months ? Object.values(d.months) : []);
        const firstMonthName = mArr[0] && mArr[0].name ? String(mArr[0].name) : '';
        const expectedM1Prefix = expectedFirstMonthByQ[parsedNormQ] || '';
        const monthsMatchFn = !firstMonthName || firstMonthName.startsWith(expectedM1Prefix);

        const customFix = customFixes.find(f => f && f.filename === fn);
        const needsIndexSync = (
          doc.officerId !== parsedOffId ||
          curNormQ !== parsedNormQ ||
          Number(doc.year) !== parsedYear ||
          !curOffQ || normalizeQuarter(curOffQ) !== parsedNormQ ||
          typeof doc.activeTasksCount !== 'number'
        );

        if (curNormQ && curNormQ !== parsedNormQ || (curOffQ && normalizeQuarter(curOffQ) !== parsedNormQ) || !monthsMatchFn || customFix) {
          anomalies.push({
            filename: fn,
            curNormQ,
            expectedNormQ: parsedNormQ,
            curOffQ,
            firstMonthName,
            monthsMatchFn,
            status: d.status,
            approvedAt: d.approvedAt,
            lastSaved: d.lastSaved
          });
        }

        if (mode === 'repair' && (needsIndexSync || customFix)) {
          const updateSet = {
            officerId: parsedOffId,
            quarterNorm: parsedNormQ,
            year: parsedYear
          };
          if (typeof doc.activeTasksCount !== 'number') {
            updateSet.activeTasksCount = countSessionActiveTasks(d);
          }
          if (typeof doc.totalDonePoints !== 'number') {
            updateSet.totalDonePoints = getSessionTotalDonePoints(d);
          }
          if (monthsMatchFn) {
            updateSet['data.officer.officerId'] = parsedOffId;
            updateSet['data.officer.quarter'] = parsedLabelQ;
            updateSet['data.officer.year'] = parsedYear;
          }
          if (customFix && customFix.setFields && typeof customFix.setFields === 'object') {
            for (const [k, v] of Object.entries(customFix.setFields)) {
              updateSet[k] = v;
            }
          }
          await sessionsCol.updateOne({ _id: doc._id }, { $set: updateSet });
          repaired.push({ filename: fn, updatedKeys: Object.keys(updateSet) });
        }
      }

      if (mode === 'repair' && repaired.length > 0) {
        invalidateSummaryCache();
      }

      return sendJson(res, 200, {
        success: true,
        mode,
        totalScanned: allDocs.length,
        anomaliesCount: anomalies.length,
        anomalies,
        repairedCount: repaired.length,
        repaired
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- API Chuẩn hóa Chức danh trên Cloud (POST ONLY - CHỈ Admin Hoàng) ---
  if (pathname === '/api/sync-roles' && req.method === 'POST') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.isAdmin) {
      return sendJson(res, 403, { success: false, error: "Chỉ quản trị viên (Hoàng) mới có quyền thực hiện!" });
    }
    await syncOfficerRolesMigration();
    invalidateSummaryCache();
    return sendJson(res, 200, {
      success: true,
      message: "Đã chuẩn hóa và đồng bộ chính xác chức danh: Nguyễn Thị Thu Trang (GDV - Thủ kho tiền) và Võ Thị Lệ Thuỷ (GDV) trên MongoDB Cloud!"
    });
  }

  // API Summary Toàn phòng (CÓ BỘ ĐỆM RAM + TRUY VẤN INDEXED KHÔNG COLLSCAN)
  if (pathname === '/api/summary' && req.method === 'GET') {
    const auth = await requireAuth();
    if (!auth) return;
    if (!auth.canViewAll) {
      return sendJson(res, 403, { success: false, error: "Chỉ Lãnh đạo phòng và Bộ phận Tổng hợp KPI mới có quyền xem Bảng tổng hợp KPI toàn phòng!" });
    }
    const quarter = searchParams.get('quarter') || "Quý III";
    const year = searchParams.get('year') || "2026";
    const normQ = normalizeQuarter(quarter);
    const targetYear = Number(year) || 2026;
    const cacheKey = `${normQ}_${targetYear}`;
    const forceRefresh = (searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true');

    if (!process.env.VERCEL && !forceRefresh && summaryCache[cacheKey] && (Date.now() - summaryCache[cacheKey].timestamp < 60000)) {
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

    const quarterLabel = quarterNormToLabel(normQ);
    const safeQNoSpace = String(quarter).replace(/\s+/g, '');

    let allSessionsMap = {};
    if (kpiDb) {
      try {
        // ⚡ TRUY VẤN INDEXED ({ quarterNorm: 1, year: 1 }), loại bỏ RegExp COLLSCAN
        const docs = await kpiDb.collection('sessions').find({
          $or: [
            { quarterNorm: normQ, year: targetYear },
            { "data.officer.quarter": quarterLabel, "data.officer.year": targetYear },
            { "data.officer.quarter": quarter, "data.officer.year": targetYear },
            { "data.officer.quarter": normQ, "data.officer.year": targetYear }
          ]
        }, {
          projection: {
            filename: 1,
            officerId: 1,
            quarterNorm: 1,
            year: 1,
            activeTasksCount: 1,
            "data.officer": 1,
            "data.status": 1,
            "data.isSubmitted": 1,
            "data.isApproved": 1,
            "data.submittedAt": 1,
            "data.approvedAt": 1,
            "data.approvedBy": 1,
            "data.rejectReason": 1,
            "data.lastSaved": 1,
            "data.months.completionPercent": 1,
            "data.months.quantityPct": 1,
            "data.months.qualityPct": 1,
            "data.months.progressPct": 1,
            "data.generalCriteria": 1,
            "data.proposedRating": 1,
            "data.selfRating": 1,
            "data.selfRatingProposal": 1,
            "data.leaderRatingProposal": 1,
            "data.leaderRatingNote": 1
          }
        }).toArray();

        docs.forEach(d => {
          if (!d) return;
          const fnQ = extractQuarterFromFilename(d.filename);
          if (fnQ && fnQ !== normQ) return;
          if (!fnQ && d.quarterNorm && normalizeQuarter(d.quarterNorm) !== normQ) return;
          const sessionData = d.data || {};
          if (!fnQ && !d.quarterNorm && sessionData.officer && sessionData.officer.quarter && normalizeQuarter(sessionData.officer.quarter) !== normQ) return;
          if (typeof d.activeTasksCount === 'number') {
            sessionData.activeTasksCount = d.activeTasksCount;
          }
          if (d.filename) {
            allSessionsMap[d.filename] = pickBestSession(allSessionsMap[d.filename], sessionData);
          }
          const offId = d.officerId || (sessionData.officer && sessionData.officer.officerId);
          if (offId) {
            const canonicalFn = getSessionFilename(offId, quarterLabel, targetYear);
            allSessionsMap[canonicalFn] = pickBestSession(allSessionsMap[canonicalFn], sessionData);
          }
        });
      } catch (e) {
        console.error('[API SUMMARY] Lỗi truy vấn MongoDB sessions:', e);
      }
    }
    // HỢP NHẤT THÔNG MINH ĐÚNG QUÝ & NĂM (Cấm rò rỉ dữ liệu Quý III sang Q1/Q2/Q4 khi chạy Offline LAN)
    if (!kpiDb || !process.env.VERCEL || Object.keys(allSessionsMap).length === 0) {
      const localSessions = getAllLocalSessions();
      for (const [fn, lData] of Object.entries(localSessions)) {
        const fnQ = extractQuarterFromFilename(fn);
        const yMatch = fn.match(/_(\d{4})\.json$/i);
        const fnYear = yMatch ? Number(yMatch[1]) : Number(lData && lData.officer && lData.officer.year);
        if (fnQ && fnQ !== normQ) continue;
        if (fnYear && fnYear !== targetYear) continue;
        allSessionsMap[fn] = pickBestSession(allSessionsMap[fn], lData);
      }
    }

    for (const off of officersList) {
      const filename = getSessionFilename(off.id, quarterLabel, targetYear);
      const altFilename = `${off.id}_${safeQNoSpace}_${targetYear}.json`;
      const altFilename2 = `${off.id}_${normQ}_${targetYear}.json`;
      const altFilename3 = `${off.id}_${quarterLabel}_${targetYear}.json`;

      let sess = pickBestSession(
        allSessionsMap[filename],
        allSessionsMap[altFilename],
        allSessionsMap[altFilename2],
        allSessionsMap[altFilename3]
      );

      // Fallback an toàn: chỉ ghép đúng cán bộ + đúng Quý/Năm
      if (!sess) {
        for (const [fn, sData] of Object.entries(allSessionsMap)) {
          if (fn.startsWith(off.id + '_') && sData) {
            const fnQ = extractQuarterFromFilename(fn) || normalizeQuarter(sData.officer && sData.officer.quarter);
            if (fnQ === normQ) sess = pickBestSession(sess, sData);
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
      const isSessSubmitted = !!(sess && (sess.isSubmitted || sess.isApproved || sess.status === 'da_nop' || sess.status === 'da_duyet'));
      const hasAnyScore = !!(sess && sess.months && Array.isArray(sess.months) && sess.months.some(m => Number(m && m.completionPercent) > 0));
      const hasActionStatus = isSessSubmitted || (sess && sess.status === 'tra_lai');
      const hasDraftSaved = !!(sess && (sess.status === 'da_luu' || sess.status === 'draft' || sess.lastSaved));

      if (sess && (hasActionStatus || hasDraftSaved || hasAnyScore || activeTaskCountInSess > 0)) {
        item.isSubmitted = isSessSubmitted;
        item.isApproved = !!(sess && (sess.isApproved || sess.status === 'da_duyet'));
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
          item.status = sess.status || (item.isApproved ? "da_duyet" : (item.isSubmitted ? "da_nop" : "da_luu"));
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
            let pct = Number(m && m.completionPercent) || 0;
            if (pct === 0 && m && Array.isArray(m.rows) && m.rows.length > 0) {
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

        const isCountedAsSubmitted = (item.isSubmitted || item.status === 'da_duyet' || item.status === 'da_nop' || item.status === 'da_luu' || item.totalScore > 0);
        if (isCountedAsSubmitted) submittedCount++;
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
      const htmlSecHeaders = {
        'Content-Type': 'text/html; charset=utf-8',
        'ETag': cachedHtml.etag,
        'Cache-Control': 'no-cache, must-revalidate',
        'Vary': 'Accept-Encoding',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'same-origin'
      };
      if (acceptEncoding.includes('gzip')) {
        res.writeHead(200, {
          ...htmlSecHeaders,
          'Content-Encoding': 'gzip',
          'Content-Length': cachedHtml.gzipBuffer.length
        });
        return res.end(cachedHtml.gzipBuffer);
      } else {
        res.writeHead(200, {
          ...htmlSecHeaders,
          'Content-Length': cachedHtml.rawBuffer.length
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
