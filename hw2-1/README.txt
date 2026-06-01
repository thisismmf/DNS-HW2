HW2-1 README
============

Online Resources Used:
- MDN Web Docs - Fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
- MDN Web Docs - CORS: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
- MDN Web Docs - document.cookie: https://developer.mozilla.org/en-US/docs/Web/API/Document/cookie
- OWASP SQL Injection: https://owasp.org/www-community/attacks/SQL_Injection
- OWASP XSS: https://owasp.org/www-community/attacks/xss/
- OWASP CSRF: https://owasp.org/www-community/attacks/csrf
- SQLite UNION SELECT: https://www.sqlite.org/lang_select.html

Notes to Grader:
----------------
Exploit Alpha (a.txt):
  - Uses SQL injection (UNION SELECT) on the /profile endpoint combined with stored XSS.
  - The injected UNION SELECT returns a fake user row with a <script> tag in the profile field.
  - The profile template renders profile with <%- %> (unescaped), so the script executes.
  - The script sends document.cookie to /steal_cookie and also patches the DOM to make
    the page look like the user's own profile (correct username, bitbar count).

Exploit Bravo (b.html):
  - Pure CSRF attack using fetch() from the file:// origin.
  - app.js sets Access-Control-Allow-Origin: "null" and Access-Control-Allow-Credentials: true,
    which permits credentialed cross-origin requests from file:// pages (origin = null).
  - The cookie has sameSite: false so it is sent with the cross-origin POST request.
  - After the transfer completes (or after 1500ms fallback), the page redirects to CE441.
  - localhost:3000 is never shown in the address bar.

Exploit Gamma (g.txt):
  - Injects an SVG element (not filtered by the script/img filter in post_transfer) as username.
  - The SVG onload handler iterates over a dictionary, timing each /get_login request.
  - The correct password causes a server-side sleep(2000ms); all others return immediately.
  - The password with the maximum response time is sent to /steal_password.
  - Uses backticks throughout to avoid quote escaping issues in the HTML attribute context.
