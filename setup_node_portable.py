import os
import sys
import urllib.request
import zipfile
import shutil

sys.stdout.reconfigure(encoding='utf-8')

target_dir = os.path.join(os.path.dirname(__file__), 'node-runtime')
node_exe = os.path.join(target_dir, 'node.exe')

if os.path.exists(node_exe):
    print(f"✅ Node.js portable đã có sẵn tại: {node_exe}")
    sys.exit(0)

url = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
zip_path = os.path.join(os.path.dirname(__file__), 'node-temp.zip')

print(f"📥 Đang tải Node.js Portable từ {url}...")

def reporthook(blocknum, blocksize, totalsize):
    readsofar = blocknum * blocksize
    if totalsize > 0:
        percent = readsofar * 1e2 / totalsize
        if blocknum % 500 == 0:
            print(f"  Đã tải: {readsofar / (1024*1024):.1f} MB / {totalsize / (1024*1024):.1f} MB ({percent:.1f}%)")

urllib.request.urlretrieve(url, zip_path, reporthook)
print("📦 Đang giải nén Node.js Portable...")

extract_temp = os.path.join(os.path.dirname(__file__), 'node-extract-temp')
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_temp)

# Di chuyển nội dung thư mục con node-v20.18.0-win-x64 vào node-runtime
subfolders = [f for f in os.listdir(extract_temp) if os.path.isdir(os.path.join(extract_temp, f))]
if subfolders:
    extracted_inner = os.path.join(extract_temp, subfolders[0])
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir)
    shutil.move(extracted_inner, target_dir)

# Dọn dẹp
if os.path.exists(zip_path):
    os.remove(zip_path)
if os.path.exists(extract_temp):
    shutil.rmtree(extract_temp)

print("=" * 60)
print(f"🎉 Cài đặt Node.js Portable thành công tại: {node_exe}")
print("=" * 60)
