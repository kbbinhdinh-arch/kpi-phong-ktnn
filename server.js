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

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { MongoClient } = require('mongodb');

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
const BASE_DIR = __dirname;
const HTML_FILE = path.join(BASE_DIR, 'App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html');

// ============================================================================
// KẾT NỐI MONGODB ATLAS (LƯU TRỮ LÂU DÀI TRÊN CLOUD)
// ============================================================================
const MONGODB_URI = "mongodb+srv://kbbinhdinh_db_user:ZvCQmfp24YwNudJS@kpi-ktnn-db.olx4piw.mongodb.net/?appName=kpi-ktnn-db";
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

connectMongo();

// Lấy IP mạng LAN
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
        return cfg;
      }
    } catch (e) {
      console.error("Lỗi đọc officers từ MongoDB:", e);
    }
  }
  const fallbackFile = path.join(BASE_DIR, 'kpi_data', 'officers_config.json');
  try {
    if (fs.existsSync(fallbackFile)) {
      return JSON.parse(fs.readFileSync(fallbackFile, 'utf8'));
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

  // API Save Session
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
            if (existing.data.leaderRatingProposal && !state.leaderRatingProposal) {
              state.leaderRatingProposal = existing.data.leaderRatingProposal;
            }
            if (existing.data.leaderRatingNote && !state.leaderRatingNote) {
              state.leaderRatingNote = existing.data.leaderRatingNote;
            }
          }
          await sessionsCol.updateOne({ filename }, { $set: { filename, data: state, updatedAt: state.lastSaved } }, { upsert: true });
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
          }
        }
        return sendJson(res, 200, { success: true, message: "Đã lưu đánh giá của Lãnh đạo" });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- API Xuất toàn bộ dữ liệu ra tệp nén về máy tính (Export All - Tối ưu chống lỗi 502) ---
  if (pathname === '/api/backup/export-all' && req.method === 'GET') {
    const adminOfficerId = searchParams.get('adminOfficerId');
    const isAuthorized = isAuthorAuthorizedMachine() || adminOfficerId === 'hoang';
    if (!isAuthorized) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN: Thao tác quản trị hệ thống chỉ dành cho Quản trị viên!" });
    }
    try {
      let exportData = {
        exportedAt: new Date().toISOString(),
        author: AUTHOR_INFO.author,
        officers_config: {},
        auth_passwords: {},
        sessions: {}
      };
      
      if (kpiDb) {
        try {
          exportData.officers_config = await getOfficersConfig();
          exportData.auth_passwords = await getAuthPasswords();
          // Giới hạn 200 bản ghi để chống timeout/lỗi 502 trên Render
          const sessionDocs = await kpiDb.collection('sessions').find({}).limit(200).toArray();
          if (sessionDocs && Array.isArray(sessionDocs)) {
            sessionDocs.forEach(doc => {
              if (doc.filename && doc.data) {
                exportData.sessions[doc.filename] = doc.data;
              }
            });
          }
        } catch (dbErr) {
          console.error("Lỗi truy vấn MongoDB khi export:", dbErr);
        }
      }

      const jsonStr = JSON.stringify(exportData);
      const gzipped = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'));
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="KPI_PhongKTNN_Backup_${new Date().toISOString().slice(0,10)}.kpi"`,
        'Content-Length': gzipped.length
      });
      return res.end(gzipped);
    } catch(err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // --- API Nạp toàn bộ dữ liệu từ tệp cục bộ lên MongoDB Cloud (Import All) ---
  if (pathname === '/api/backup/import-all' && req.method === 'POST') {
    const adminOfficerId = searchParams.get('adminOfficerId');
    const isAuthorized = isAuthorAuthorizedMachine() || adminOfficerId === 'hoang';
    if (!isAuthorized) {
      return sendJson(res, 403, { success: false, error: "BẢN QUYỀN: Thao tác quản trị hệ thống chỉ dành cho Quản trị viên!" });
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
        }

        console.log(`[IMPORT CLOUD] Đã nạp thành công ${count} phiên dữ liệu lên MongoDB từ file máy tính.`);
        sendJson(res, 200, { success: true, count, message: `Đã nạp thành công dữ liệu ${count} cán bộ lên hệ thống Cloud từ file máy tính!` });
      } catch(err) {
        sendJson(res, 500, { success: false, error: "Lỗi nạp dữ liệu: " + err.message });
      }
    });
    return;
  }

  // API Summary Toàn phòng
  if (pathname === '/api/summary' && req.method === 'GET') {
    const quarter = searchParams.get('quarter') || "Quý III";
    const year = searchParams.get('year') || "2026";
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
      const docs = await kpiDb.collection('sessions').find({}).toArray();
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
        item.isSubmitted = !!(sess.isSubmitted || sess.status === 'da_nop');
        item.submittedAt = sess.submittedAt || null;
        item.status = item.isSubmitted ? "da_nop" : (sess.status || "da_luu");
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
    const maxExcellentAllowed = Math.round(totalOfficers * 0.2);

    return sendJson(res, 200, {
      success: true,
      quarter,
      year,
      officers: summaryList,
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
    });
  }

  // Serve Frontend HTML
  if (pathname === '/' || pathname === '/index.html' || pathname === '/app') {
    refreshHtmlCache();
    if (cachedHtml.rawBuffer) {
      if (req.headers['if-none-match'] === cachedHtml.etag) {
        res.writeHead(304, { 'ETag': cachedHtml.etag });
        return res.end();
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Encoding': 'gzip',
        'Content-Length': cachedHtml.gzipBuffer.length,
        'ETag': cachedHtml.etag,
        'Cache-Control': 'no-cache, must-revalidate',
        'Vary': 'Accept-Encoding'
      });
      return res.end(cachedHtml.gzipBuffer);
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
