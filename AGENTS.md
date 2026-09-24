# HƯỚNG DẪN DÀNH CHO AI AGENT (AGENTS.md)
# DỰ ÁN: HỆ THỐNG QUẢN LÝ & ĐÁNH GIÁ KPI PHÒNG KẾ TOÁN NHÀ NƯỚC (KPI-KTNN)
# ĐƠN VỊ: KHO BẠC NHÀ NƯỚC KHU VỰC XV

Tài liệu này cung cấp toàn bộ kiến trúc hệ thống, quy chuẩn nghiệp vụ, cấu trúc dữ liệu, luồng xử lý và các nguyên tắc lập trình bắt buộc mà mọi AI Agent (Antigravity Agent, Gemini Agent, Cursor/Copilot...) phải tuân thủ nghiêm ngặt khi thao tác, bảo trì, tối ưu hóa hoặc nâng cấp dự án này.

---

## 1. TỔNG QUAN DỰ ÁN & BỐI CẢNH NGHIỆP VỤ

- **Cơ quan áp dụng:** Kho bạc Nhà nước (KBNN) Khu vực XV – Phòng Kế toán Nhà nước.
- **Tác giả phần mềm:** **Ông Trần Quốc Hoàng** — Phó Trưởng phòng Kế toán Nhà nước, KBNN Khu vực XV.
- **Mục tiêu hệ thống:**
  - Số hóa toàn diện quy trình lập kế hoạch công tác quý, phân công nhiệm vụ, theo dõi tiến độ và chấm điểm chỉ số hiệu quả công việc (KPI) cho toàn bộ 35 công chức của Phòng Kế toán Nhà nước.
  - Tự động hóa tính toán điểm số chuyên môn theo bảng chấm điểm chi tiết 24 cột (Mẫu 02a), kết hợp đánh giá tiêu chí chung (Mẫu 01 cá nhân), phân loại theo thang điểm 100.
  - Phê duyệt trực tuyến cấp lãnh đạo, quản lý lịch sử phiên bản hồ sơ và tự động xếp hạng toàn phòng, áp dụng cơ chế khống chế trần 20% "Hoàn thành xuất sắc nhiệm vụ" theo quy định của Chính phủ và Bộ Tài chính.
  - Cung cấp công cụ in ấn chuẩn thể thức A4 (dọc/ngang) và kết xuất bảng tính Microsoft Excel chuẩn xác 100% biểu mẫu KBNN.
- **Cơ sở pháp lý cốt lõi:**
  - **Nghị định số 335/2025/NĐ-CP** (09/06/2025) của Chính phủ: Quy định về đánh giá, xếp loại chất lượng cán bộ, công chức, viên chức.
  - **Quyết định số 1253/QĐ-BTC** (10/09/2026) của Bộ trưởng Bộ Tài chính: Ban hành Quy định đánh giá, xếp loại chất lượng công chức theo chỉ số KPI trong hệ thống Kho bạc Nhà nước.
  - **Nghị quyết số 57-NQ/TW** của Bộ Chính trị / Ban Chấp hành Trung ương Đảng: Về đột phá phát triển khoa học công nghệ, đổi mới sáng tạo và chuyển đổi số quốc gia.
  - **Công văn số 1513/KBNN** & **Công văn số 6046/KBNN** của Kho bạc Nhà nước: Hướng dẫn nghiệp vụ kế toán, kiểm soát chi và triển khai đánh giá chỉ số KPI trong hệ thống KBNN.
- **Các biểu mẫu nghiệp vụ chính:**
  - **Mẫu 01:** Bảng Kế hoạch công tác Quý Đơn vị (Trưởng phòng lập, gửi Lãnh đạo KBNN Khu vực phê duyệt).
  - **Mẫu 02:** Báo cáo Kết quả công tác Quý Đơn vị (Tổng hợp kết quả công tác quý của toàn phòng).
  - **Mẫu 03:** Bảng Kế hoạch công tác Quý Cá nhân (Phó Trưởng phòng / Giao dịch viên lập nhiệm vụ trọng tâm, thường xuyên, Nghị quyết 57).
  - **Mẫu 04:** Báo cáo Kết quả công tác Quý Cá nhân (Báo cáo tổng hợp kết quả thực hiện nhiệm vụ cá nhân quý).
  - **Mẫu 02a:** Bảng chấm điểm chi tiết 24 cột kết quả thực hiện nhiệm vụ (Phụ lục chi tiết theo từng tháng và tổng hợp cả Quý).
  - **Mẫu 01 Cá nhân:** Phiếu theo dõi, đánh giá, xếp loại chất lượng công chức quý (Điểm chuyên môn 70đ + Điểm tiêu chí chung 30đ = 100đ).
  - **Bảng Tổng hợp Xếp loại KPI Toàn phòng:** Danh sách 35 cán bộ, điểm trung bình 3 tháng, xếp hạng rank, khống chế trần 20% hoàn thành xuất sắc (tối đa 7/35).

---

## 2. KIẾN TRÚC HỆ THỐNG & TECH STACK

Dự án áp dụng **Kiến trúc Lai Kép (Dual-Environment Hybrid Architecture)** linh hoạt: vừa có khả năng vận hành như một dịch vụ Cloud Web Service trên Internet (Render Cloud), vừa có thể hoạt động hoàn toàn độc lập trong môi trường Mạng nội bộ (Intranet) KBNN không cần Internet.

```
                           +-------------------------------------------------------------+
                           |            Trình duyệt Web (Chrome, Edge, Firefox)           |
                           |   Cloud: https://kpi-ktnn-kbxv.onrender.com                 |
                           |   Local: http://localhost:8080 (hoặc http://localhost:8888) |
                           +------------------------------+------------------------------+
                                                          | HTTP REST API / Gzip Stream
                                                          v
                           +-------------------------------------------------------------+
                           |             Máy chủ Native Node.js (server.js)              |
                           |   - Engine HTTP thuần (Zero external framework)             |
                           |   - Bộ đệm RAM tốc độ cao (High-speed RAM Cache)             |
                           |   - Bộ lọc kiểm tra bản quyền & khóa thiết bị tác giả       |
                           |   - Chống sập tiến trình (Zero-Crash Protection)            |
                           +---------------+------------------------------+--------------+
                                           |                              |
                          Driver mongodb   |                              | Zlib Sync
                                           v                              v
           +-----------------------------------------------+   +------------------------------------+
           |             MongoDB Atlas Cloud DB            |   |   Thư mục sao lưu xoay vòng        |
           |             (Database: kpi_ktnn_db)           |   |   backups/KPI_AutoBackup_*.json.gz |
           | - sessions: 53+ hồ sơ KPI cán bộ qua các quý  |   |   (Tối đa 30 bản snapshot an toàn) |
           | - officers_config: 35 cán bộ công chức        |   +------------------------------------+
           | - auth_passwords: Bảng băm mật khẩu bảo mật   |
           +-----------------------------------------------+
```

### Công nghệ sử dụng:
1. **Frontend:** Single Page Application (SPA) gói gọn trong file [`App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html`](file:///d:/Anti_IDE/KPI-KTNN/App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html):
   - Vanilla JavaScript hiện đại (ES6+), thuần DOM API, hoàn toàn không phụ thuộc React/Vue/Angular.
   - Tailwind CSS (bundle nội bộ) + Modern CSS Design System (Glassmorphism, gradients, micro-animations).
   - **Engine In ấn Chuyên nghiệp (A4 Print Engine):** Định dạng CSS `@media print` phân trang chính xác, tự động căn lề, chuyển hướng linh hoạt giữa A4 dọc (Portrait - Mẫu 01, 02, 03, 04, Mẫu 01 cá nhân) và A4 ngang (Landscape - Mẫu 02a 24 cột).
   - **Engine Kết xuất Microsoft Excel (Native Spreadsheet Engine):** Xuất trực tiếp định dạng Excel XML/HTML chuẩn UTF-8 BOM (`\uFEFF`), hỗ trợ định dạng cột, màu nền, đường kẻ border đôi và header 2 tầng chuẩn quy cách KBNN.
2. **Backend:** [`server.js`](file:///d:/Anti_IDE/KPI-KTNN/server.js) (1.518 dòng code):
   - Viết bằng Node.js Native Modules (`http`, `fs`, `path`, `os`, `crypto`, `zlib`) và driver `mongodb` (`^6.8.0`).
   - Cung cấp 20 REST API endpoints xử lý logic đăng nhập, chấm điểm, nộp duyệt, phê duyệt, sao lưu và tổng hợp xếp hạng.
   - Cơ chế RAM Cache (`officersConfigCache`, `summaryCache`) giúp phản hồi API trong thời gian < 5ms.
   - Gzip compression on-the-fly phục vụ file HTML lớn cho tốc độ tải trang tức thì.
3. **Cơ sở dữ liệu & Sao lưu:**
   - **Database chính:** MongoDB Atlas Cloud Database (`kpi_ktnn_db`), tự động kết nối qua chuỗi URI bảo mật cấu hình trong file `.env` hoặc biến môi trường `MONGODB_URI`.
   - **Dữ liệu hạt giống (Fallback Seed Data):** File [`seed_data.json.gz`](file:///d:/Anti_IDE/KPI-KTNN/seed_data.json.gz) (2.9 MB nén Gzip) chứa đầy đủ cấu hình 35 cán bộ và 53+ phiên làm việc mẫu, tự động nạp vào MongoDB khi database khởi tạo lần đầu.
   - **Tự động sao lưu định kỳ (Daily Auto-Backup):** Cứ mỗi 12 giờ, server tự động trích xuất toàn bộ dữ liệu, nén Zlib mức tối đa (`level: 9`) lưu vào `backups/KPI_AutoBackup_YYYY-MM-DD_HHh.json.gz`, duy trì 30 bản snapshot gần nhất.
4. **Triển khai & Môi trường chạy:**
   - **Cloud (Render Web Service):** Khai báo tại [`render.yaml`](file:///d:/Anti_IDE/KPI-KTNN/render.yaml) (`service: kpi-ktnn-kbxv`, Node 20.18.0, region Singapore). Đẩy code qua [`cap_nhat_len_web.bat`](file:///d:/Anti_IDE/KPI-KTNN/cap_nhat_len_web.bat) là Render tự động build và deploy lên Internet.
   - **Cục bộ (Windows Local):** Chạy ngay bằng [`start_kpi_test.bat`](file:///d:/Anti_IDE/KPI-KTNN/start_kpi_test.bat) sử dụng môi trường Node Portable (`node-runtime\node.exe`) mà không cần cài đặt Node.js lên máy tính KBNN.

---

## 3. CẤU TRÚC THƯ MỤC DỰ ÁN

```
d:\Anti_IDE\KPI-KTNN\
├── AGENTS.md                              # Cẩm nang quy chuẩn dành cho AI Agent (File này)
├── README.md                              # Hướng dẫn tổng quan dự án và cách triển khai
├── package.json                           # Cấu hình dự án Node.js và dependency (mongodb ^6.8.0)
├── package-lock.json                      # Khóa phiên bản chi tiết dependency
├── render.yaml                            # Cấu hình hạ tầng triển khai tự động trên Render Cloud
├── .env                                   # Biến môi trường bảo mật (PORT, MONGODB_URI, AUTHOR_SERVER)
├── .gitignore                             # Danh sách tệp loại trừ không commit lên Git
│
├── App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html # Ứng dụng SPA chính (Giao diện + Toàn bộ nghiệp vụ)
├── server.js                              # Máy chủ backend Node.js (REST API, MongoDB, Caching, Backup)
│
├── cap_nhat_len_web.bat                   # Batch script đẩy mã nguồn lên GitHub để Render tự động Deploy
├── start_kpi_test.bat                     # Batch script chạy thử nghiệm ứng dụng cục bộ trên Windows
├── backup_cloud.bat                       # Batch script kích hoạt sao lưu dữ liệu Cloud về ổ đĩa cục bộ
├── backup_cloud_to_disk.js                # Tiện ích Node.js sao lưu MongoDB Atlas về đĩa cứng
├── backup_cloud_to_disk.py                # Tiện ích Python sao lưu MongoDB Atlas về đĩa cứng
├── setup_node_portable.py                 # Script tải & thiết lập Node portable cho máy văn phòng
│
├── seed_data.json.gz                      # Gzip nén CSDL mẫu ban đầu (35 cán bộ, 53+ phiên làm việc)
├── backups/                               # Thư mục chứa các bản snapshot sao lưu tự động định kỳ
│   └── KPI_AutoBackup_*.json.gz           # Bản sao lưu snapshot toàn bộ CSDL nén Gzip (lưu 30 bản)
└── node-runtime/                          # Môi trường Node.js Portable chạy trực tiếp trên Windows (offline)
```

---

## 4. MÔ HÌNH DỮ LIỆU & SCHEMA CHUẨN

Hệ thống lưu trữ dữ liệu trên MongoDB Atlas Database `kpi_ktnn_db` bao gồm 3 collections chính:

### 1. Collection `officers_config` (Danh bạ 35 Cán bộ công chức)
Mỗi document đại diện cho một cán bộ công chức thuộc Phòng Kế toán Nhà nước:

```json
{
  "_id": "hoang",
  "id": "hoang",
  "name": "Trần Quốc Hoàng",
  "role": "PTP",
  "group": "Lãnh đạo phòng",
  "title": "Phó Trưởng phòng Kế toán Nhà nước",
  "specialty": "Phụ trách tổng hợp KPI; Kế toán chi NSNN; Chuyển đổi số và hiện đại hóa công nghệ thông tin...",
  "isLeader": true,
  "isKPIAggregator": false,
  "approverTitle": "TRƯỞNG PHÒNG",
  "approverName": "Hoàng Anh Sơn",
  "managedUnits": ["Đơn vị dự toán khối Đảng, Đoàn thể", "Ban Quản lý dự án chuyên ngành"],
  "defaultPlan": [
    {
      "name": "Chỉ đạo triển khai công tác số hóa và chấm điểm KPI phòng theo Nghị định 335 và Quyết định 1253",
      "type": "AI_KEY",
      "deadline": "Quý III/2026",
      "isNQ57": true,
      "isKey": true
    },
    {
      "name": "Thực hiện kiểm soát chi ngân sách nhà nước qua Dịch vụ công trực tuyến",
      "type": "AII_REGULAR",
      "deadline": "Thường xuyên",
      "isNQ57": false,
      "isKey": false
    }
  ]
}
```

#### Phân cấp 35 nhân sự Phòng Kế toán Nhà nước:
- **06 Lãnh đạo phòng:**
  1. `son`: **Hoàng Anh Sơn** — Kế toán trưởng - Trưởng phòng KTNN (`role: "TP"`).
  2. `hoang`: **Trần Quốc Hoàng** — Phó Trưởng phòng KTNN (`role: "PTP"`).
  3. `tuan`: **Võ Đăng Tuân** — Phó Trưởng phòng KTNN (`role: "PTP"`).
  4. `anh`: **Lê Văn Ánh** — Phó Trưởng phòng KTNN (`role: "PTP"`).
  5. `trung`: **Trần Đức Trung** — Phó Trưởng phòng KTNN (`role: "PTP"`).
  6. `phuong`: **Huỳnh Thị Mỹ Phương** — Phó Trưởng phòng KTNN (`role: "PTP"`).
- **29 Giao dịch viên (GDV):**
  - Cán bộ Tổng hợp KPI Toàn phòng: `tu` (**Lê Thị Cẩm Tú** - `isKPIAggregator: true`).
  - Thủ kho tiền: `qn_trang` (**Nguyễn Thị Thu Trang**).
  - Hành chính, văn thư: `qn_thuy_le` (**Võ Thị Lệ Thuỷ**).
  - 26 Giao dịch viên kiểm soát chi ngân sách, kế toán liên kho bạc, hoàn thuế, thanh toán tự động...

---

### 2. Collection `sessions` (Hồ sơ KPI theo Quý & Năm)
Được định danh qua thuộc tính `filename`: `[officerId]_[quarter]_[year].json` (ví dụ: `hoang_QuyIII_2026.json`).

```json
{
  "_id": "6789...abcdef",
  "filename": "hoang_QuyIII_2026.json",
  "data": {
    "officer": {
      "id": "hoang",
      "name": "Trần Quốc Hoàng",
      "role": "PTP",
      "title": "Phó Trưởng phòng Kế toán Nhà nước",
      "specialty": "Phụ trách tổng hợp KPI...",
      "isLeader": true
    },
    "status": "da_duyet",
    "isSubmitted": true,
    "submittedAt": "2026-09-20T08:30:00.000Z",
    "approvedAt": "2026-09-22T10:15:00.000Z",
    "approvedBy": "Hoàng Anh Sơn",
    "rejectReason": null,
    "lastSaved": "2026-09-22T10:15:00.000Z",
    "quarterPlan": [
      {
        "id": "p1",
        "name": "Nhiệm vụ chuyển đổi số và tổng hợp KPI",
        "type": "AI_KEY",
        "deadline": "Tháng 9/2026",
        "isNQ57": true,
        "isKey": true
      }
    ],
    "months": [
      {
        "monthName": "Tháng 7",
        "completionPercent": 96.5,
        "rows": [
          {
            "stt": 1,
            "taskName": "Kiểm soát hồ sơ thanh toán NSNN",
            "category": "I. Nhiệm vụ thường xuyên",
            "weight": 20,
            "targetQty": 150,
            "actualQty": 152,
            "unit": "Hồ sơ",
            "deadline": "Thường xuyên",
            "evalCriteria": "Đúng quy trình, không quá hạn",
            "autoCalculatedPct": 100,
            "score": 20
          }
        ]
      },
      { "monthName": "Tháng 8", "completionPercent": 98.0, "rows": [...] },
      { "monthName": "Tháng 9", "completionPercent": 95.0, "rows": [...] }
    ],
    "generalCriteria": {
      "c1_tu_tuong_chinh_tri": 6.0,
      "c2_dao_duc_loi_song": 6.0,
      "c3_tac_phong_le_loi": 6.0,
      "c4_y_thuc_to_chuc_ky_luat": 6.0,
      "c5_tinh_than_trach_nhiem": 6.0
    },
    "selfAdvantages": "Luôn nêu cao tinh thần trách nhiệm, chủ động đổi mới sáng tạo...",
    "selfDisadvantages": "Khối lượng công việc lớn đôi lúc ảnh hưởng tiến độ báo cáo...",
    "proposedRating": "Hoàn thành xuất sắc nhiệm vụ",
    "leaderRatingProposal": "Hoàn thành xuất sắc nhiệm vụ",
    "leaderRatingNote": "Hoàn thành xuất sắc các nhiệm vụ trọng tâm quý III."
  }
}
```

---

### 3. Collection `auth_passwords` (Xác thực Mật khẩu Cá nhân)
Lưu trữ thông tin băm mật khẩu bảo vệ quyền truy cập hồ sơ của từng công chức:

```json
{
  "_id": "6789...auth123",
  "officerId": "hoang",
  "salt": "a1b2c3d4e5f6...",
  "hash": "8f4a3c2e1b...",
  "updatedAt": "2026-09-01T08:00:00.000Z"
}
```

---

### 4. Quy chuẩn Công thức Tính điểm & Phân loại Xếp loại:

1. **Điểm công việc chuyên môn (Thang điểm 70):**
   $$\% Hoàn thành_{TB} = \frac{\% Tháng 1 + \% Tháng 2 + \% Tháng 3}{3}$$
   $$Điểm_{Chuyên môn} = \text{round}\left(\% Hoàn thành_{TB} \times 0.7,\, 1\right)$$

2. **Điểm tiêu chí chung (Thang điểm 30):**
   $$Điểm_{Tiêu chí} = \min\left(30, \sum_{i=1}^{5} Điểm_{Tiêu chí\, i}\right)$$

3. **Tổng điểm đánh giá chung (Thang điểm 100):**
   $$Tổng điểm = Điểm_{Chuyên môn} + Điểm_{Tiêu chí}$$

4. **Tiêu chuẩn Xếp loại Công chức:**
   - **Hoàn thành xuất sắc nhiệm vụ:** Tổng điểm $\ge 90.0$ VÀ $\% Hoàn thành_{TB} \ge 90.0\%$ (kèm điều kiện thuộc Top 20% của đơn vị).
   - **Hoàn thành tốt nhiệm vụ:** Tổng điểm $\ge 75.0$ VÀ $\% Hoàn thành_{TB} \ge 75.0\%$.
   - **Hoàn thành nhiệm vụ:** Tổng điểm $\ge 50.0$ VÀ $\% Hoàn thành_{TB} \ge 50.0\%$.
   - **Không hoàn thành nhiệm vụ:** Tổng điểm $< 50.0$ hoặc vi phạm kỷ luật theo quy định.

5. **Quy tắc Khống chế Trần 20% "Hoàn thành xuất sắc nhiệm vụ":**
   - Theo Nghị định 335/2025/NĐ-CP và Quyết định 1253/QĐ-BTC: Tỷ lệ công chức xếp loại "Hoàn thành xuất sắc nhiệm vụ" không được vượt quá **20%** tổng số công chức được xếp loại của đơn vị.
   - Đối với Phòng KTNN (35 người): Chỉ tiêu tối đa là **$35 \times 20\% = 7$ người**.
   - Thuật toán tự động xếp thứ tự ưu tiên:
     1. Tổng điểm giảm dần (`totalScore` desc).
     2. Điểm trung bình chuyên môn giảm dần (`avgPct` desc).
     3. Tên theo thứ tự bảng chữ cái tiếng Việt (`localeCompare('vi')`).
   - Cán bộ đủ điều kiện điểm $\ge 90$ nhưng nằm ngoài vị trí thứ 7 sẽ tự động nhận khuyến nghị: *"Hoàn thành tốt nhiệm vụ (Đã hết chỉ tiêu 20% Xuất sắc)"*.

---

## 5. CÁC PHÂN HỆ NGHIỆP VỤ CHÍNH

### Phân hệ 1: Xác thực, Phân quyền & Bản quyền Tác giả
- Hỗ trợ bảo mật mật khẩu cá nhân cho 35 cán bộ, lưu trữ dạng Hash SHA-256 kèm Salt riêng.
- Cán bộ lãnh đạo (`TP`, `PTP`) có thẩm quyền đặt lại mật khẩu cho cán bộ trực thuộc qua API `/api/auth/admin-set-password`.
- **Khóa bảo vệ bản quyền tác giả (Hardware License):** Phần mềm xác thực thông tin tác giả **Trần Quốc Hoàng** (`kvxv-hoangtq`). Trên môi trường Internet Render, cờ biến môi trường `AUTHOR_SERVER=true` cho phép kích hoạt các đặc quyền tác giả mà không bị chặn phần cứng.

### Phân hệ 2: Lập Kế hoạch Công tác Quý (Mẫu 01 & Mẫu 03)
- **Mẫu 01 (Kế hoạch Đơn vị):** Dành riêng cho Trưởng phòng lập phương hướng công tác của toàn phòng.
- **Mẫu 03 (Kế hoạch Cá nhân):** Dành cho Phó Trưởng phòng và 29 Giao dịch viên.
  - Phân loại nhiệm vụ: `AI_KEY` (Nhiệm vụ trọng tâm quý), `AII_REGULAR` (Nhiệm vụ thường xuyên), `B_LOCAL` (Nhiệm vụ đột xuất, phối hợp địa phương).
  - Đánh dấu nhiệm vụ thực hiện theo **Nghị quyết số 57-NQ/TW** về chuyển đổi số.

### Phân hệ 3: Báo cáo Kết quả & Bảng Chấm điểm Chi tiết 24 Cột (Mẫu 02a & Mẫu 04)
- **Mẫu 02a (Bảng chấm điểm 24 cột):** Theo dõi tiến độ chi tiết từng tháng (Tháng 1, 2, 3 trong Quý).
  - Tự động đối chiếu Số lượng giao vs. Số lượng hoàn thành thực tế để tính tỷ lệ % hoàn thành từng công việc.
  - Phân tầng chuyên môn (Group Level 1, Level 2, Level 3) cho các mảng kiểm soát chi, kế toán tổng hợp, thanh toán điện tử...
- **Mẫu 04 (Báo cáo Kết quả Cá nhân):** Tự động tổng hợp số liệu từ 3 tháng, hiển thị ưu điểm, tồn tại hạn chế và đề xuất phương hướng khắc phục.

### Phân hệ 4: Đánh giá Tiêu chí Chung (Mẫu 01 Cá nhân) & Tổng hợp Điểm số
- Đánh giá 5 nhóm tiêu chí phẩm chất, tư tưởng chính trị, đạo đức, tác phong, kỷ luật (tối đa 30 điểm).
- Tự động cộng gộp $Điểm_{Chuyên môn} (70đ) + Điểm_{Tiêu chí} (30đ) = 100đ$.
- Gợi ý mức xếp loại sơ bộ theo công thức toán học (`formulaRating`).

### Phân hệ 5: Luồng Thẩm định & Phê duyệt Lãnh đạo Phòng
- **Quy trình 4 bước:**
  1. *Khởi tạo / Đang chỉnh sửa (`khoi_tao` / `da_luu`)*: Cán bộ tự điền số liệu.
  2. *Nộp hồ sơ (`da_nop` / `cho_duyet`)*: Cán bộ nộp lên Lãnh đạo, khóa chỉnh sửa để đảm bảo tính toàn vẹn.
  3. *Phê duyệt (`da_duyet`)*: Lãnh đạo phòng (Hoàng Anh Sơn hoặc Trần Quốc Hoàng) ký duyệt điện tử.
  4. *Trả lại (`tra_lai`)*: Lãnh đạo gửi kèm nhận xét yêu cầu bổ sung/chỉnh sửa.
- **Lịch sử hồ sơ & Rollback:** Tự động lưu vết các lần nộp/duyệt, cho phép khôi phục về phiên bản trước qua API `/api/session/rollback`.

### Phân hệ 6: Tổng hợp Toàn phòng & Xếp hạng Khống chế 20%
- Giao diện Dashboard quản trị trực quan dành cho Lãnh đạo phòng và Cán bộ Tổng hợp KPI (`Lê Thị Cẩm Tú`).
- Hiển thị tiến độ nộp hồ sơ của toàn bộ 35 cán bộ theo thời gian thực.
- Tự động tính toán bảng xếp hạng `rankedOfficers` và gắn cờ `isTop20Excellent`.

### Phân hệ 7: In ấn Báo cáo Chuẩn A4 & Kết xuất Microsoft Excel
- **In ấn chuẩn thể thức KBNN:**
  - Hỗ trợ in trực tiếp từ trình duyệt ra máy in hoặc file PDF qua lệnh `window.print()`.
  - Mẫu 01, 02, 03, 04, Mẫu 01 cá nhân: Căn chỉnh A4 dọc chuẩn xác lề 20mm/15mm.
  - Mẫu 02a: Căn chỉnh A4 ngang, chia cột cân đối, đường kẻ đen rõ nét.
- **Kết xuất bảng tính Excel:**
  - Nút bấm trực quan trên thanh công cụ: Xuất Kế hoạch (Mẫu 01/03), Xuất Kết quả (Mẫu 02/04), Xuất Mẫu 02a 24 cột, Xuất Bảng tổng hợp xếp loại toàn phòng.
  - Định dạng bảng tính chuyên nghiệp: Header 2 tầng in hoa đậm, font chữ Times New Roman, kẻ viền ô đầy đủ, căn lề văn bản/số liệu chuẩn kế toán.

---

## 6. QUY TẮC BẮT BUỘC DÀNH CHO AI AGENT KHI PHÁT TRIỂN & CHỈNH SỬA

Khi thực hiện bất kỳ nhiệm vụ nào trong repository này, AI Agent **BẮT BUỘC PHẢI TUÂN THỦ** các nguyên tắc sau:

### 1. Nguyên tắc Bảo vệ Quyền Tác giả & Khóa Thiết bị Phần cứng
- Thông tin tác giả **Trần Quốc Hoàng** (`AUTHOR_INFO`, `author: "Trần Quốc Hoàng"`, `title: "Phó Trưởng phòng Kế toán Nhà nước"`) là thông tin bản quyền pháp lý của phần mềm.
- **TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA**, thay đổi hoặc làm sai lệch thông tin tác giả trong file [`server.js`](file:///d:/Anti_IDE/KPI-KTNN/server.js), file HTML, hay trong các biểu mẫu kết xuất.
- Giữ nguyên hàm kiểm tra `isAuthorAuthorizedMachine()` và cờ môi trường `AUTHOR_SERVER`.

### 2. Nguyên tắc Phân quyền Phê duyệt Nghiêm ngặt
- Trong hàm xử lý `/api/session/approve` và `/api/session/reject`: Chỉ có **Hoàng Anh Sơn** (Trưởng phòng) và **Trần Quốc Hoàng** (Phó Trưởng phòng) có thẩm quyền phê duyệt hoặc trả lại hồ sơ.
- Tuyệt đối không nới lỏng điều kiện này cho các tài khoản giao dịch viên thông thường.

### 3. Nguyên tắc Bảo toàn Công thức Tính điểm & Quy tắc Khống chế 20%
- Công thức tính điểm chuyên môn 70% và tiêu chí chung 30 điểm tuân thủ Nghị định 335/2025/NĐ-CP và Quyết định 1253/QĐ-BTC:
  - Tỷ lệ hoàn thành chuyên môn: $\% Hoàn thành = \frac{\% M1 + \% M2 + \% M3}{3}$.
  - Điểm chuyên môn: $Điểm_{CV} = \% Hoàn thành \times 0.7$.
  - Tổng điểm: $Tổng = Điểm_{CV} + Điểm_{Tiêu chí chung}$.
- Chỉ tiêu "Hoàn thành xuất sắc nhiệm vụ" luôn bị khống chế cứng không quá 20% tổng số cán bộ (7/35 người). Không được xóa bỏ thuật toán xếp hạng ưu tiên và gắn nhãn `isTop20Excellent`.

### 4. Nguyên tắc Môi trường Kép & Native Node.js
- File [`server.js`](file:///d:/Anti_IDE/KPI-KTNN/server.js) phải giữ cấu trúc Native Node.js, chỉ dùng các thư viện có sẵn trong Node runtime và driver `mongodb`. **Không được tùy tiện cài đặt thêm các thư viện Express, Fastify, Koa...** gây xung đột với môi trường máy chủ nội bộ.
- File HTML chính [`App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html`](file:///d:/Anti_IDE/KPI-KTNN/App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html) phải giữ dạng Vanilla JS độc lập, có thể mở trực tiếp từ trình duyệt khi cần kiểm tra giao diện ngoại tuyến.

### 5. Nguyên tắc An toàn Dữ liệu & Sao lưu Định kỳ
- Trước khi thực hiện các đợt migration cấu trúc dữ liệu hoặc đồng bộ lớn, phải đảm bảo gọi hàm tạo backup hoặc kiểm tra file backup gần nhất trong thư mục `backups/`.
- Khi cập nhật phiên làm việc của cán bộ qua API `/api/session`, phải giữ nguyên cấu trúc lịch sử phiên làm việc để hỗ trợ tính năng rollback khi cần.

### 6. Nguyên tắc Thể thức In ấn & Xuất Excel Chuẩn KBNN
- Toàn bộ bảng tính Excel xuất ra phải có tiền tố UTF-8 BOM (`\uFEFF`) để khi mở bằng Microsoft Excel tiếng Việt không bị lỗi hiển thị font.
- Header các bảng biểu in ấn và xuất file phải tuân thủ đúng thể thức văn bản hành chính nhà nước (Quốc hiệu, Tiêu ngữ, Tên cơ quan cấp trên, Tên đơn vị, Địa danh và ngày tháng năm).

---

## 7. BẢNG TRA CỨU CÁC API ENDPOINTS CỦA MÁY CHỦ (`server.js`)

Máy chủ lắng nghe tại: `http://localhost:8080` (hoặc cổng Render tự động cấp).

| Phương thức | Đường dẫn API | Mục đích | Quyền hạn & Tham số |
| :--- | :--- | :--- | :--- |
| `GET` | `/` hoặc `/index.html` hoặc `/app` | Phục vụ file SPA HTML chính (hỗ trợ Gzip stream nén nhanh) | Công khai |
| `GET` | `/api/status` | Kiểm tra tình trạng server, kết nối MongoDB, uptime, bộ nhớ RAM | Công khai |
| `GET` | `/api/license` | Lấy thông tin bản quyền tác giả và kiểm tra tính hợp lệ của thiết bị | Công khai |
| `GET` | `/api/auth/status` | Kiểm tra cán bộ đã thiết lập mật khẩu truy cập hay chưa | Query: `officerId` |
| `POST` | `/api/auth/set-password` | Thiết lập mật khẩu lần đầu cho cán bộ | Body: `{ officerId, password }` |
| `POST` | `/api/auth/verify` | Xác thực đăng nhập bằng mật khẩu | Body: `{ officerId, password }` |
| `POST` | `/api/auth/change-password` | Đổi mật khẩu cá nhân | Body: `{ officerId, oldPassword, newPassword }` |
| `POST` | `/api/auth/admin-set-password` | Lãnh đạo phòng đặt lại mật khẩu cho cán bộ trực thuộc | Lãnh đạo phòng (`TP`, `PTP`) |
| `GET` | `/api/officers` | Lấy danh sách cấu hình của toàn bộ 35 cán bộ công chức | Sử dụng RAM Cache 10 phút |
| `GET` | `/api/session` | Tải dữ liệu hồ sơ KPI của một cán bộ theo Quý và Năm | Query: `officerId`, `quarter`, `year` |
| `POST` | `/api/session` | Lưu cập nhật dữ liệu hồ sơ KPI (kế hoạch, kết quả, chi tiết 24 cột) | Cán bộ sở hữu hồ sơ |
| `POST` | `/api/session/submit` | Nộp hồ sơ đánh giá lên Lãnh đạo phòng phê duyệt (`da_nop`) | Cán bộ sở hữu hồ sơ |
| `POST` | `/api/session/approve` | Ký phê duyệt hồ sơ KPI của cán bộ (`da_duyet`) | **Chỉ Hoàng Anh Sơn hoặc Trần Quốc Hoàng** |
| `POST` | `/api/session/reject` | Trả lại hồ sơ yêu cầu cán bộ chỉnh sửa (`tra_lai`) | **Chỉ Hoàng Anh Sơn hoặc Trần Quốc Hoàng** |
| `GET` | `/api/session/history` | Xem danh sách các phiên bản lịch sử của một hồ sơ KPI | Query: `officerId`, `quarter`, `year` |
| `POST` | `/api/session/rollback` | Khôi phục dữ liệu hồ sơ về một phiên bản lịch sử trước đó | Body: `{ officerId, quarter, year, historyId }` |
| `POST` | `/api/leader-proposal` | Lãnh đạo ghi chú nhận xét và đề xuất xếp loại chất lượng | Lãnh đạo phòng |
| `GET` | `/api/summary` | Tổng hợp kết quả xếp loại KPI toàn phòng theo Quý/Năm | Hỗ trợ RAM Cache 60s, query: `quarter`, `year` |
| `GET` | `/api/backup/export-all` | Xuất toàn bộ CSDL MongoDB (sessions, officers, auth) nén Gzip | Quản trị viên tác giả |
| `POST` | `/api/backup/import-all` | Nạp phục hồi toàn bộ CSDL từ file snapshot Gzip | Quản trị viên tác giả |
| `GET`/`POST` | `/api/sync-roles` | Đồng bộ cấu hình chức danh (Thủ kho tiền, Giao dịch viên) | Quản trị hệ thống |

---

## 8. HƯỚNG DẪN KIỂM TRA & XÁC THỰC NHANH (SMOKE TEST)

Khi thực hiện bất kỳ chỉnh sửa nào trong mã nguồn dự án, AI Agent phải chạy các bước kiểm tra sau để đảm bảo không phát sinh lỗi:

### 1. Kiểm tra Cú pháp Toàn bộ Thẻ `<script>` trong file HTML chính:
```bash
node -e "const fs = require('fs'); const html = fs.readFileSync('App_KPI_PhongKTNN_KBXV_V18_DaFixLoiIn.html', 'utf8'); const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi); scripts.forEach((s, i) => { const code = s.replace(/<\/?script\b[^>]*>/gi, ''); if (code.trim()) new (require('vm').Script)(code); }); console.log('Syntax check passed! Toan bo JavaScript hop le!');"
```

### 2. Kiểm tra Tính Toàn Vẹn của Dữ liệu Hạt giống (Seed Data):
```bash
node -e "const zlib = require('zlib'); const fs = require('fs'); const buf = fs.readFileSync('seed_data.json.gz'); const data = JSON.parse(zlib.gunzipSync(buf).toString('utf8')); console.log('Seed OK! Can bo:', Object.keys(data.officers_config||{}).length, 'Sessions:', Object.keys(data.sessions||{}).length);"
```

### 3. Kiểm tra Khởi động Máy chủ và Kết nối MongoDB:
```bash
node -e "const http = require('http'); const req = http.get('http://localhost:8080/api/status', (res) => { let body = ''; res.on('data', c => body += c); res.on('end', () => console.log('Status Response:', body)); }); req.on('error', e => console.log('Server chua chay tren port 8080, hay chay start_kpi_test.bat de kiem tra!'));"
```

### 4. Đẩy Cập nhật Lên Web Render Cloud:
```cmd
# Chạy file batch cập nhật tự động lên GitHub
cap_nhat_len_web.bat
```

---
*Tài liệu này được biên soạn và bảo hộ theo quyền tác giả của ông Trần Quốc Hoàng — Phó Trưởng phòng Kế toán Nhà nước, KBNN Khu vực XV. Mọi AI Agent tham gia phát triển dự án bắt buộc phải tuân thủ nghiêm ngặt các quy định trong tài liệu này.*
