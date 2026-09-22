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

// Kiểm tra tính hợp lệ của thiết bị đang chạy máy chủ (máy gốc hoặc Cloud có cấu hình tác giả)
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
const DATA_DIR = path.join(BASE_DIR, 'kpi_data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const CONFIG_FILE = path.join(DATA_DIR, 'officers_config.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth_passwords.json');
const HTML_FILE = path.join(BASE_DIR, 'App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html');

// Dam bao thu muc luu tru ton tai
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const BACKUPS_ROLLING_DIR = path.join(BACKUPS_DIR, 'rolling');
const BACKUPS_PERIODIC_DIR = path.join(BACKUPS_DIR, 'periodic');

// Đảm bảo các thư mục sao lưu tồn tại
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_ROLLING_DIR)) fs.mkdirSync(BACKUPS_ROLLING_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_PERIODIC_DIR)) fs.mkdirSync(BACKUPS_PERIODIC_DIR, { recursive: true });


// Lay dia chi IP mang LAN
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

// Doc officers_config
function getOfficersConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error("Loi doc officers_config.json:", err);
  }
  return {};
}

// Chuan hoa ten quy: QuyI, QuyII, QuyIII, QuyIV
function normalizeQuarter(qStr) {
  if (!qStr) return 'QuyIII';
  const s = String(qStr).toLowerCase().replace(/\s+/g, '');
  if (s.includes('iv') || s.includes('4')) return 'QuyIV';
  if (s.includes('iii') || s.includes('3')) return 'QuyIII';
  if (s.includes('ii') || s.includes('2')) return 'QuyII';
  if (s.includes('i') || s.includes('1')) return 'QuyI';
  return 'QuyIII';
}

// Chuan hoa ten file session
function getSessionFilename(officerId, quarter, year) {
  const safeOfficer = (officerId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeQ = normalizeQuarter(quarter);
  const safeY = String(year || 2026).replace(/[^0-9]/g, '');
  return `${safeOfficer}_${safeQ}_${safeY}.json`;
}

// Khoi tao session mac dinh cho can bo

// ============================================================================
// HỆ THỐNG BỘ NHỚ ĐỆM RAM & NÉN GZIP CHO 30 MÁY TRUY CẬP ĐỒNG THỜI
// Giảm 85% băng thông (1.1 MB -> 180 KB), phản hồi tức thì <10ms
// ============================================================================
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
        console.log(`[Cache RAM] Đã nạp HTML vào bộ nhớ: ${(raw.length / 1024).toFixed(1)} KB thô -> ${(gzipped.length / 1024).toFixed(1)} KB Gzip (Tiết kiệm ${(100 - (gzipped.length / raw.length * 100)).toFixed(1)}% băng thông)`);
      }
    }
  } catch (err) {
    console.error("[Cache RAM] Lỗi làm mới HTML cache:", err);
  }
}

// Khởi tạo cache ngay khi load module
refreshHtmlCache();

// Tự động làm mới cache nếu file HTML trên đĩa có thay đổi
try {
  fs.watch(HTML_FILE, () => {
    setTimeout(refreshHtmlCache, 300);
  });
} catch (e) {}

// ============================================================================
// HÀNG ĐỢI TUẦN TỰ HÓA THEO CÁN BỘ (MUTEX WRITE QUEUE) CHỐNG XUNG ĐỘT 30 MÁY
// ============================================================================
const officerWriteQueues = new Map();

function queueOfficerWrite(officerId, taskFn) {
  const key = officerId || 'global';
  let queue = officerWriteQueues.get(key) || Promise.resolve();
  const next = queue.then(() => taskFn()).catch(err => {
    console.error(`[Mutex Queue] Lỗi thực thi hàng đợi cho ${key}:`, err);
    throw err;
  });
  officerWriteQueues.set(key, next.finally(() => {
    if (officerWriteQueues.get(key) === next) {
      officerWriteQueues.delete(key);
    }
  }));
  return next;
}

// ============================================================================
// CƠ CHẾ GHI TỆP NGUYÊN TỬ (ATOMIC WRITE) & SAO LƯU ROLLING BACKUP
// Đảm bảo file không bao giờ bị hỏng dù mất điện hoặc ngắt kết nối đột ngột
// ============================================================================
function atomicWriteJsonSync(filePath, dataObj, officerId = null) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const jsonStr = JSON.stringify(dataObj, null, 2);
  const filename = path.basename(filePath);

  // 1. Sao lưu .bak
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, filePath + '.bak');
    } catch (e) {}

    // 2. Rolling backup (Lưu tối đa 10 bản lịch sử gần nhất cho mỗi cán bộ)
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = filename.replace(/\.json$/i, '');
      const rollingPath = path.join(BACKUPS_ROLLING_DIR, `${baseName}_${ts}.json`);
      fs.copyFileSync(filePath, rollingPath);

      const allRolling = fs.readdirSync(BACKUPS_ROLLING_DIR)
        .filter(f => f.startsWith(baseName + '_') && f.endsWith('.json'))
        .sort();
      if (allRolling.length > 10) {
        for (let i = 0; i < allRolling.length - 10; i++) {
          try { fs.unlinkSync(path.join(BACKUPS_ROLLING_DIR, allRolling[i])); } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("[Backup Rolling] Cảnh báo:", e.message);
    }
  }

  // 3. Ghi ra tệp tạm thời rồi hoán đổi nguyên tử (Atomic Rename)
  const tempPath = path.join(dir, `.${filename}.tmp.${process.pid}.${Date.now()}.${Math.floor(Math.random() * 1000000)}`);
  fs.writeFileSync(tempPath, jsonStr, 'utf8');
  fs.renameSync(tempPath, filePath);
}

// ============================================================================
// HỆ THỐNG SAO LƯU ĐỊNH KỲ TOÀN BỘ CSDL (PERIODIC SNAPSHOT)
// Mỗi 30 phút tự động tạo 1 snapshot của toàn bộ các phiên làm việc
// ============================================================================
function runPeriodicBackup() {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const sessionFiles = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.bak') && !f.startsWith('.'));
    if (sessionFiles.length === 0) return;

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const destDir = path.join(BACKUPS_PERIODIC_DIR, `Backup_${ts}`);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    let copied = 0;
    sessionFiles.forEach(f => {
      try {
        fs.copyFileSync(path.join(SESSIONS_DIR, f), path.join(destDir, f));
        copied++;
      } catch (e) {}
    });

    console.log(`[Periodic Backup] Đã lưu an toàn snapshot (${copied} tệp session) tại: ${path.basename(destDir)}`);

    // Dọn dẹp giữ lại 48 bản gần nhất (24 giờ liên tục)
    const allBackups = fs.readdirSync(BACKUPS_PERIODIC_DIR)
      .filter(f => f.startsWith('Backup_'))
      .sort();
    if (allBackups.length > 48) {
      for (let i = 0; i < allBackups.length - 48; i++) {
        const oldBackupDir = path.join(BACKUPS_PERIODIC_DIR, allBackups[i]);
        try { fs.rmSync(oldBackupDir, { recursive: true, force: true }); } catch (e) {}
      }
    }
  } catch (err) {
    console.error("[Periodic Backup] Lỗi sao lưu định kỳ:", err);
  }
}

// Chạy định kỳ mỗi 30 phút
setInterval(runPeriodicBackup, 30 * 60 * 1000);
// Chạy 1 lần sau 4 giây khi khởi động
setTimeout(runPeriodicBackup, 4000);

function createDefaultSession(officerId, quarter, year) {
  const cfg = getOfficersConfig();
  const off = cfg[officerId] || {
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

// Gui phan hoi JSON kem CORS
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


// Doc file mat khau auth_passwords.json
function getAuthPasswords() {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    }
  } catch (err) {
    console.error("Loi doc auth_passwords.json:", err);
  }
  return {};
}

// Ghi file mat khau auth_passwords.json
function saveAuthPasswords(data) {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error("Loi ghi auth_passwords.json:", err);
    return false;
  }
}

// Băm mật khẩu SHA-256
function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password).trim()).digest('hex');
}


// Tinh toan ty le hoan thanh thang tu danh sach cong viec (hang)
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

// Tao HTTP Server
const server = http.createServer((req, res) => {
  // CORS Preflight
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

  // --- API 0: Kiem tra ban quyen & Giay phep thiet bi (License & Copyright Verification) ---
  if (pathname === '/api/license' && req.method === 'GET') {
    const isAuthorized = isAuthorAuthorizedMachine();
    const currentHost = os.hostname();
    return sendJson(res, 200, {
      success: true,
      author: AUTHOR_INFO.author,
      title: AUTHOR_INFO.title,
      organization: AUTHOR_INFO.organization,
      copyright: AUTHOR_INFO.copyright,
      legalBasis: AUTHOR_INFO.legalBasis,
      authorizedDevice: AUTHOR_INFO.authorizedHostname,
      currentDevice: currentHost,
      isAuthorizedDevice: isAuthorized,
      canEditApp: isAuthorized,
      mode: isAuthorized ? "AUTHOR_ADMIN_MODE" : "PROTECTED_USER_MODE",
      message: isAuthorized
        ? "Thiết bị chính thức của tác giả Trần Quốc Hoàng (Được phép quản trị, chỉnh sửa và cấu hình toàn bộ hệ thống)."
        : "Bản quyền phần mềm thuộc về tác giả Trần Quốc Hoàng. Chế độ phân phối: Khóa tính năng chỉnh sửa hệ thống trên thiết bị này."
    });
  }

  // --- API 1: Kiem tra trang thai may chu ---
  
  // --- API 6: Kiem tra trang thai mat khau cua can bo ---
  if (pathname === '/api/auth/status' && req.method === 'GET') {
    const officerId = searchParams.get('officerId');
    const authData = getAuthPasswords();
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

  // --- API 7: Thiet lap mat khau lan dau ---
  if (pathname === '/api/auth/set-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const officerId = payload.officerId;
        const password = payload.password;
        if (!officerId || !password || String(password).trim().length < 4) {
          return sendJson(res, 400, { success: false, error: "Mật khẩu phải có ít nhất 4 ký tự" });
        }
        const authData = getAuthPasswords();
        authData[officerId] = {
          hash: hashPassword(password),
          createdAt: authData[officerId] ? authData[officerId].createdAt : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        saveAuthPasswords(authData);
        return sendJson(res, 200, { success: true, message: "Đã thiết lập mật khẩu thành công" });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: "Du lieu khong hop le: " + err.message });
      }
    });
    return;
  }

  // --- API 8: Xac thuc mat khau dang nhap ---
  if (pathname === '/api/auth/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const officerId = payload.officerId;
        const password = payload.password;
        if (!officerId || !password) {
          return sendJson(res, 400, { success: false, error: "Vui lòng nhập mật khẩu" });
        }
        const authData = getAuthPasswords();
        const userAuth = authData[officerId];
        if (!userAuth || !userAuth.hash) {
          return sendJson(res, 200, { success: false, error: "Tài khoản chưa thiết lập mật khẩu", notSet: true });
        }
        const inputHash = hashPassword(password);
        if (inputHash === userAuth.hash) {
          return sendJson(res, 200, { success: true, message: "Xác thực thành công" });
        } else {
          return sendJson(res, 200, { success: false, error: "Mật khẩu không chính xác" });
        }
      } catch (err) {
        return sendJson(res, 400, { success: false, error: "Du lieu khong hop le: " + err.message });
      }
    });
    return;
  }

  // --- API 9: Dat lai mat khau (danh cho Admin/Quan tri vien) ---
  if (pathname === '/api/auth/reset' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const adminId = payload.adminOfficerId;
        const targetOfficerId = payload.targetOfficerId;
        if (!isAuthorAuthorizedMachine() || adminId !== 'hoang') {
          return sendJson(res, 403, { success: false, error: "BẢN QUYỀN: Thao tác quản trị hệ thống chỉ được phép thực hiện bởi Quản trị viên (Hoàng) trên thiết bị gốc (kvxv-hoangtq)!" });
        }
        const authData = getAuthPasswords();
        if (authData[targetOfficerId]) {
          delete authData[targetOfficerId];
          saveAuthPasswords(authData);
        }
        return sendJson(res, 200, { success: true, message: "Đã đặt lại mật khẩu thành công cho cán bộ: " + targetOfficerId });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: "Du lieu khong hop le" });
      }
    });
    return;
  }

  if (pathname === '/api/status' && req.method === 'GET') {
    const sessionFiles = fs.existsSync(SESSIONS_DIR) ? fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json') && !f.endsWith('.bak')) : [];
    return sendJson(res, 200, {
      status: "ok",
      serverTime: new Date().toISOString(),
      hostIp: getLanIp(),
      port: PORT,
      sessionsCount: sessionFiles.length,
      version: "V18_MultiUser_LAN"
    });
  }
  // --- API 2: Lay danh sach can bo & phan cong ---
  if (pathname === '/api/officers' && req.method === 'GET') {
    const cfg = getOfficersConfig();
    return sendJson(res, 200, {
      success: true,
      officers: cfg,
      officersList: Object.values(cfg)
    });
  }

  // --- API 3: Doc phien lam viec ---
  if (pathname === '/api/session' && req.method === 'GET') {
    const officerId = searchParams.get('officerId');
    const quarter = searchParams.get('quarter');
    const year = searchParams.get('year');

    if (!officerId) {
      return sendJson(res, 400, { success: false, error: "Thieu thong so officerId" });
    }

    const filename = getSessionFilename(officerId, quarter, year);
    const filePath = path.join(SESSIONS_DIR, filename);

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const sessionData = JSON.parse(raw);
        return sendJson(res, 200, {
          success: true,
          isNew: false,
          filename: filename,
          data: sessionData
        });
      } catch (err) {
        console.error("Loi doc session file:", filePath, err);
      }
    }

    // Neu chua co file, tao phien mac dinh
    const defaultData = createDefaultSession(officerId, quarter, year);
    return sendJson(res, 200, {
      success: true,
      isNew: true,
      filename: filename,
      data: defaultData
    });
  }

  // --- API 4: Luu phien lam viec an toan (Atomic Write & Preserve Leader Rating) ---
  if (pathname === '/api/session' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const officerId = payload.officerId || (payload.officer && payload.officer.officerId) || (payload.state && payload.state.officer && payload.state.officer.officerId);
        const quarter = payload.quarter || (payload.officer && payload.officer.quarter) || (payload.state && payload.state.officer && payload.state.officer.quarter);
        const year = payload.year || (payload.officer && payload.officer.year) || (payload.state && payload.state.officer && payload.state.officer.year);
        const state = payload.state || payload;

        if (!officerId) {
          return sendJson(res, 400, { success: false, error: "Thieu thong so officerId" });
        }

        const filename = getSessionFilename(officerId, quarter, year);
        const filePath = path.join(SESSIONS_DIR, filename);

        // Tuần tự hóa theo cán bộ để chống tranh chấp đồng thời
        queueOfficerWrite(officerId, async () => {
          // BẢO TOÀN ĐÁNH GIÁ CỦA LÃNH ĐẠO PHÒNG:
          // Nếu tệp trên đĩa đã có leaderRatingProposal hoặc leaderRatingNote mà payload của GDV chưa có, giữ nguyên đánh giá của Lãnh đạo
          if (fs.existsSync(filePath)) {
            try {
              const existingDiskData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
              if (existingDiskData.leaderRatingProposal && !state.leaderRatingProposal) {
                state.leaderRatingProposal = existingDiskData.leaderRatingProposal;
              }
              if (existingDiskData.leaderRatingNote && !state.leaderRatingNote) {
                state.leaderRatingNote = existingDiskData.leaderRatingNote;
              }
            } catch (e) {
              console.warn("[Session Save] Lỗi đọc bảo toàn đánh giá lãnh đạo:", e.message);
            }
          }

          state.lastSaved = new Date().toISOString();

          // Ghi nguyên tử an toàn tuyệt đối 100%
          atomicWriteJsonSync(filePath, state, officerId);

          sendJson(res, 200, {
            success: true,
            message: `Da luu phien lam viec an toan cho ${officerId} (${filename})`,
            filename: filename,
            savedAt: state.lastSaved
          });
        }).catch(err => {
          console.error("Loi ghi session an toan:", err);
          sendJson(res, 500, { success: false, error: "Khong the ghi du lieu: " + err.message });
        });
      } catch (err) {
        console.error("Loi ghi session:", err);
        return sendJson(res, 500, { success: false, error: "Khong the ghi du lieu: " + err.message });
      }
    });
    return;
  }

  if (pathname === '/api/leader-proposal' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { officerId, quarter, year, leaderRatingProposal, leaderRatingNote } = payload;
        if (!officerId) {
          return sendJson(res, 400, { success: false, error: "Thieu thong so officerId" });
        }
        const filename = getSessionFilename(officerId, quarter, year);
        const filePath = path.join(SESSIONS_DIR, filename);

        queueOfficerWrite(officerId, async () => {
          let sess = {};
          if (fs.existsSync(filePath)) {
            sess = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          }
          sess.leaderRatingProposal = leaderRatingProposal;
          if (leaderRatingNote !== undefined) sess.leaderRatingNote = leaderRatingNote;
          sess.lastSaved = new Date().toISOString();

          atomicWriteJsonSync(filePath, sess, officerId);

          sendJson(res, 200, {
            success: true,
            message: `Đã lưu đề xuất xếp loại của Lãnh đạo cho cán bộ ${officerId}`,
            leaderRatingProposal: leaderRatingProposal
          });
        }).catch(err => {
          sendJson(res, 500, { success: false, error: err.message });
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    });
    return;
  }

  // --- API 5: Bang Tong hop KPI toan phong (GDV Tu & Lanh dao) ---
if (pathname === '/api/summary' && req.method === 'GET') {
    const quarter = searchParams.get('quarter') || "Quý III";
    const year = searchParams.get('year') || "2026";
    const cfg = getOfficersConfig();
    const officersList = Object.values(cfg);

    const summaryList = [];
    let submittedCount = 0;
    let excellentCount = 0;
    let goodCount = 0;
    let completedCount = 0;
    let notCompletedCount = 0;

    for (const off of officersList) {
      const filename = getSessionFilename(off.id, quarter, year);
      let filePath = path.join(SESSIONS_DIR, filename);

      // Thu kiem tra ca ten file co dau tieng Viet (fallback)
      if (!fs.existsSync(filePath)) {
        const altFilename = `${off.id}_${quarter.replace(/\s+/g, '')}_${year}.json`;
        const altPath = path.join(SESSIONS_DIR, altFilename);
        if (fs.existsSync(altPath)) {
          filePath = altPath;
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
        m1Pct: 0,
        m2Pct: 0,
        m3Pct: 0,
        avgPct: 0,
        taskScore: 0,
        generalScore: 30,
        totalScore: 0,
        rating: "Chưa đánh giá",
        leaderRatingProposal: "",
        lastSaved: null
      };

      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const sess = JSON.parse(raw);
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
          } else {
            item.generalScore = 30;
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

          // Mức tự xếp loại của công chức: Ưu tiên lấy mức công chức đã tự chọn (Mẫu 01/03/02a), nếu chưa tự chọn mới dùng tính toán tự động
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
        } catch (err) {
          console.error("Loi doc session tong hop:", filePath, err);
        }
      }

      summaryList.push(item);
    }

    const totalOfficers = summaryList.length;
    const maxExcellentAllowed = Math.round(totalOfficers * 0.2);
    const isExcellentExceeded = excellentCount > maxExcellentAllowed;

    return sendJson(res, 200, {
      success: true,
      quarter: quarter,
      year: year,
      officers: summaryList,
      stats: {
        totalOfficers,
        submittedCount,
        excellentCount,
        maxExcellentAllowed,
        isExcellentExceeded,
        goodCount,
        completedCount,
        notCompletedCount
      }
    });
  }

    // --- SERVE GIAO DIEN WEB CHINH (HTML VỚI BỘ NHỚ ĐỆM RAM & NÉN GZIP) ---
  if (pathname === '/' || pathname === '/index.html' || pathname === '/app') {
    refreshHtmlCache();
    if (cachedHtml.rawBuffer) {
      if (req.headers['if-none-match'] === cachedHtml.etag) {
        res.writeHead(304, { 'ETag': cachedHtml.etag });
        return res.end();
      }

      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (acceptEncoding.includes('gzip') && cachedHtml.gzipBuffer) {
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
          'Cache-Control': 'no-cache, must-revalidate'
        });
        return res.end(cachedHtml.rawBuffer);
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end("Khong tim thay tep giao dien HTML: " + HTML_FILE);
    }
  }

  // Phuc vu tep tinh neu co yeu cau
  const safePath = path.normalize(path.join(BASE_DIR, pathname));
  if (safePath.startsWith(BASE_DIR) && fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
    const ext = path.extname(safePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.pdf': 'application/pdf',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel'
    };
    const cType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': cType });
    return fs.createReadStream(safePath).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end("404 Not Found");
});

// Khoi dong may chu
// Cấu hình tối ưu kết nối HTTP cho 30 máy trạm LAN đồng thời
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.maxHeadersCount = 2000;

// Bảo vệ tiến trình máy chủ không bao giờ bị dừng đột ngột
process.on('uncaughtException', (err) => {
  console.error('[CRITICAL] Bắt lỗi ngoại lệ toàn cục an toàn trong server:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Bắt lỗi promise rejection toàn cục an toàn:', reason);
});

server.listen(PORT, HOST, () => {
  const lanIp = getLanIp();
  const isAuthorized = isAuthorAuthorizedMachine();
  console.log("============================================================================");
  console.log("  KBNN KHU VUC XV - PHONG KE TOAN NHA NUOC");
  console.log("  HE THONG THEO DOI & DANH GIA KPI (ND 335 / QD 1253)");
  console.log("============================================================================");
  console.log(` [©] BAN QUYEN PHAN MEM: TRẦN QUỐC HOÀNG (Pho Truong phong KTNN - KBNN KV XV)`);
  console.log(` [!] THIET BI GOC DUOC PHEP SUA APP: ${AUTHOR_INFO.authorizedHostname}`);
  console.log(` [+] Thiet bi hien tai:  ${os.hostname()} (${isAuthorized ? "MAY CHU CHINH CUA TAC GIA - TOAN QUYEN CHINH SUA" : "MAY PHAN PHOI - KHOA TINH NANG SUA HE THONG"})`);
  console.log(` [+] Trang thai:        MAY CHU DANG HOAT DONG`);
  console.log(` [+] Truy cap cuc bo:   http://localhost:${PORT}`);
  console.log(` [+] Truy cap mang LAN: http://${lanIp}:${PORT}`);
  console.log(` [+] Thu muc phien:     ${SESSIONS_DIR}`);
  console.log("============================================================================");
  if (!isAuthorized) {
    console.log("  * CANH BAO: May chu khong chay tren thiet bi goc cua tac gia Tran Quoc Hoang.");
    console.log("  * Che do bao ve ban quyen da duoc kich hoat: Khoa toan bo tinh nang sua he thong.");
    console.log("============================================================================");
  }
  console.log("  * Chia se duong dan 'http://" + lanIp + ":" + PORT + "' cho moi nguoi trong phong.");
  console.log("  * Nhan Ctrl+C de dung may chu.");
  console.log("============================================================================");
});
