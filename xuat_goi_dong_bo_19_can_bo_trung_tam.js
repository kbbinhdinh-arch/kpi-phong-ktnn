/**
 * ============================================================================
 * CÔNG CỤ TRÍCH XUẤT GÓI ĐỒNG BỘ 19 CÁN BỘ TRUNG TÂM TIỀN MẶT
 * Bản quyền tác giả: Trần Quốc Hoàng - KBNN Khu vực XV
 * 
 * NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI:
 * - Chỉ lấy đúng 19 cán bộ Trung tâm Tiền mặt từ thư mục data/
 * - LOẠI BỎ 100% các cán bộ Quảng Ngãi (có tiền tố qn_*)
 * - Khi nạp lên https://kpi-ktnn.onrender.com sẽ KHÔNG làm mất số liệu của 16 cán bộ Quảng Ngãi
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = __dirname;
const SESSIONS_DIR = path.join(BASE_DIR, 'data', 'sessions');
const AUTH_FILE = path.join(BASE_DIR, 'data', 'auth_passwords.json');
const OFFICERS_FILE = path.join(BASE_DIR, 'data', 'officers_config.json');

console.log("=".repeat(75));
console.log("🚀 ĐANG TẠO GÓI ĐỒNG BỘ AN TOÀN CHO 19 CÁN BỘ TRUNG TÂM TIỀN MẶT...");
console.log("=".repeat(75));

if (!fs.existsSync(SESSIONS_DIR)) {
  console.error("❌ Không tìm thấy thư mục data/sessions/!");
  process.exit(1);
}

// 1. Quét danh sách file session của 19 cán bộ Trung tâm (loại bỏ qn_*)
const allFiles = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
const files19 = allFiles.filter(f => !f.startsWith('qn_'));
const qnFiles = allFiles.filter(f => f.startsWith('qn_'));

console.log(`[*] Tổng số file trong data/sessions: ${allFiles.length}`);
console.log(`[+] Tìm thấy ${files19.length} file hồ sơ của 19 cán bộ Trung tâm Tiền mặt.`);
console.log(`[-] Đã loại trừ ${qnFiles.length} file của Quảng Ngãi để bảo vệ an toàn CSDL Cloud.`);

const exportSessions = {};
files19.forEach(fname => {
  try {
    const raw = fs.readFileSync(path.join(SESSIONS_DIR, fname), 'utf8');
    exportSessions[fname] = JSON.parse(raw);
  } catch(e) {
    console.warn(`⚠️ Lỗi đọc file ${fname}:`, e.message);
  }
});

// 2. Lọc cấu hình 19 cán bộ Trung tâm
let exportOfficers = {};
if (fs.existsSync(OFFICERS_FILE)) {
  try {
    const allCfg = JSON.parse(fs.readFileSync(OFFICERS_FILE, 'utf8'));
    Object.keys(allCfg).forEach(k => {
      if (!k.startsWith('qn_')) {
        exportOfficers[k] = allCfg[k];
      }
    });
  } catch(e) {}
}

// 3. Lọc mật khẩu của 19 cán bộ Trung tâm
let exportAuth = {};
if (fs.existsSync(AUTH_FILE)) {
  try {
    const allAuth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    Object.keys(allAuth).forEach(k => {
      if (!k.startsWith('qn_')) {
        exportAuth[k] = allAuth[k];
      }
    });
  } catch(e) {}
}

const payload = {
  packageType: "SAFE_PARTIAL_SYNC_TRUNG_TAM_19",
  exportedAt: new Date().toISOString(),
  author: "Trần Quốc Hoàng",
  targetGroup: "19 Cán bộ Trung tâm Tiền mặt (Bảo lưu 100% 16 cán bộ Quảng Ngãi)",
  sessions: exportSessions,
  officers_config: exportOfficers,
  auth_passwords: exportAuth
};

const outputJsonPath = path.join(BASE_DIR, 'KPI_DongBo_19_TrungTam_Safe.json');
const outputKpiPath = path.join(BASE_DIR, 'KPI_DongBo_19_TrungTam_Safe.kpi');

fs.writeFileSync(outputJsonPath, JSON.stringify(payload, null, 2), 'utf8');
fs.writeFileSync(outputKpiPath, JSON.stringify(payload, null, 2), 'utf8');

console.log("=".repeat(75));
console.log("🎉 ĐÃ TẠO THÀNH CÔNG GÓI ĐỒNG BỘ AN TOÀN!");
console.log(`📁 File tạo ra 1: ${outputJsonPath}`);
console.log(`📁 File tạo ra 2: ${outputKpiPath}`);
console.log("=".repeat(75));
console.log(`
👉 CÁCH NẠP LÊN ONRENDER (CỰC KỲ ĐƠN GIẢN):
1. Mở trình duyệt truy cập: https://kpi-ktnn.onrender.com
2. Đăng nhập tài khoản Lãnh đạo: hoang
3. Bấm nút [📤 Đồng bộ Web] trên thanh tiêu đề đầu trang.
4. Chọn file: KPI_DongBo_19_TrungTam_Safe.kpi (hoặc .json) vừa tạo.
5. Hệ thống sẽ cập nhật đúng 19 cán bộ Trung tâm, giữ nguyên 16 cán bộ Quảng Ngãi!
`);
