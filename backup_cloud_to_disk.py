import os
import sys
import json
import gzip
from datetime import datetime
from pymongo import MongoClient
from bson import ObjectId

sys.stdout.reconfigure(encoding='utf-8')

# Custom JSON encoder để serialize ObjectId và datetime của MongoDB
class MongoJSONEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, ObjectId):
            return str(o)
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)

# 1. Đọc MONGODB_URI từ .env
env_path = os.path.join(os.path.dirname(__file__), '.env')
mongo_uri = None
if os.path.exists(env_path):
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line.startswith('MONGODB_URI='):
                mongo_uri = line.split('=', 1)[1].strip()
                break

if not mongo_uri:
    mongo_uri = "mongodb+srv://kbbinhdinh_db_user:ZvCQmfp24YwNudJS@kpi-ktnn-db.olx4piw.mongodb.net/?appName=kpi-ktnn-db"

print("=" * 70)
print("🚀 ĐANG KẾT NỐI TỚI MONGODB ATLAS CLOUD ĐỂ SAO LƯU DỮ LIỆU...")
print("=" * 70)

try:
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
    db = client['kpi_ktnn_db']
    
    # Kiểm tra kết nối
    client.admin.command('ping')
    print("✅ Kết nối tới MongoDB Atlas thành công!")

    # Lấy danh sách collections
    col_names = db.list_collection_names()
    print(f"📦 Các bảng dữ liệu hiện có trên Cloud: {col_names}")

    backup_data = {
        "backup_info": {
            "source": "MongoDB Atlas Cloud (kpi_ktnn_db)",
            "created_at": datetime.now().isoformat(),
            "target_office": "Phòng Kế toán Nhà nước - KBNN Khu vực XV",
            "author": "Trần Quốc Hoàng"
        },
        "collections": {}
    }

    total_records = 0
    for col_name in col_names:
        docs = list(db[col_name].find({}))
        backup_data["collections"][col_name] = docs
        total_records += len(docs)
        print(f"  🔹 Bảng [{col_name}]: {len(docs)} bản ghi")

    # Tạo thư mục backups trên ổ đĩa
    backup_dir = os.path.join(os.path.dirname(__file__), 'backups')
    os.makedirs(backup_dir, exist_ok=True)

    timestamp_str = datetime.now().strftime('%Y_%m_%d_%Hh%Mm%Ss')
    json_path = os.path.join(backup_dir, f'KPI_Cloud_Backup_{timestamp_str}.json')
    gz_path = os.path.join(backup_dir, f'KPI_Cloud_Backup_{timestamp_str}.json.gz')

    # Lưu file JSON văn bản rõ ràng
    json_str = json.dumps(backup_data, cls=MongoJSONEncoder, ensure_ascii=False, indent=2)
    with open(json_path, 'w', encoding='utf-8') as f:
        f.write(json_str)

    # Lưu file nén Gzip tối ưu dung lượng
    with gzip.open(gz_path, 'wt', encoding='utf-8') as f:
        f.write(json_str)

    json_size_kb = os.path.getsize(json_path) / 1024
    gz_size_kb = os.path.getsize(gz_path) / 1024

    print("=" * 70)
    print("🎉 SAO LƯU THÀNH CÔNG 100% TOÀN BỘ DỮ LIỆU CLOUD VỀ MÁY TÍNH!")
    print(f"📍 Tổng số bản ghi đã sao lưu: {total_records}")
    print(f"📁 File JSON rõ ràng: {json_path} ({json_size_kb:.1f} KB)")
    print(f"📦 File nén an toàn: {gz_path} ({gz_size_kb:.1f} KB)")
    print("=" * 70)

except Exception as e:
    print(f"❌ Lỗi sao lưu: {str(e)}")
    sys.exit(1)
