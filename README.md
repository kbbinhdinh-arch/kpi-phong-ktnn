# Hệ Thống Quản Lý & Đánh Giá KPI - Phòng Kế Toán Nhà Nước (KBNN Khu Vực XV)

Phần mềm Quản lý & Đánh giá KPI công chức theo **Nghị định số 335/2025/NĐ-CP** và **Quyết định số 1253/QĐ-BTC**.
- **Tác giả:** Trần Quốc Hoàng — Phó Trưởng phòng Kế toán Nhà nước (KBNN Khu vực XV).

---

## 🚀 Triển khai trên Render (Web Service)

1. **Build Command:** `npm install`
2. **Start Command:** `npm start`
3. **Environment Variables (Tùy chọn):**
   - `PORT`: Mặc định Render tự động cấu hình.
   - `AUTHOR_SERVER`: `true` (Cho phép kích hoạt tính năng tác giả khi chạy trên Cloud).
   - `MONGODB_URI`: Chuỗi kết nối MongoDB Atlas (nếu không khai báo, hệ thống sử dụng kết nối mặc định an toàn).

---

## 💻 Chạy cục bộ (Local Development)

```bash
npm install
npm start
```
Truy cập: `http://localhost:8080` (hoặc cổng được chỉ định).
