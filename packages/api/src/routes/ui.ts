import { Hono } from 'hono';
import { html } from 'hono/html';

const layout = (title: string, body: string) => html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — EmComm</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 16px; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 24px; }
    nav { margin-bottom: 32px; font-size: 0.9rem; }
    nav a { margin-right: 16px; color: #0066cc; text-decoration: none; }
    label { display: block; margin-bottom: 4px; font-size: 0.875rem; font-weight: 600; }
    input { width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 16px; font-size: 1rem; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
    button:hover { background: #0052a3; }
    .error { color: #cc0000; font-size: 0.875rem; margin-bottom: 12px; }
    .card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
    .badge-active { background: #dcfce7; color: #166534; }
    .badge-open { background: #fef9c3; color: #713f12; }
  </style>
</head>
<body>
  <nav>
    <a href="/">Dashboard</a>
    <a href="/ui/login">Login</a>
    <a href="/ui/register">Register</a>
  </nav>
  ${body}
</body>
</html>`;

export const uiRouter = new Hono()
  // Login page
  .get('/login', (c) =>
    c.html(layout('Login', `
      <h1>Login</h1>
      <form id="login-form">
        <label for="callsign">Callsign</label>
        <input id="callsign" name="callsign" type="text" placeholder="W1AW" autocomplete="username" required />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <div id="error" class="error" style="display:none"></div>
        <button type="submit">Login</button>
      </form>
      <p style="margin-top:16px;font-size:0.875rem">Don't have an account? <a href="/ui/register">Register</a></p>
      <script>
        document.getElementById('login-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const err = document.getElementById('error');
          err.style.display = 'none';
          const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              callsign: document.getElementById('callsign').value.toUpperCase(),
              password: document.getElementById('password').value,
            }),
          });
          const data = await res.json();
          if (!res.ok) { err.textContent = data.error; err.style.display = 'block'; return; }
          localStorage.setItem('emcomm_token', data.token);
          localStorage.setItem('emcomm_callsign', data.operator.callsign);
          window.location.href = '/';
        });
      </script>
    `)),
  )

  // Register page
  .get('/register', (c) =>
    c.html(layout('Register', `
      <h1>Register</h1>
      <form id="register-form">
        <label for="callsign">Callsign</label>
        <input id="callsign" name="callsign" type="text" placeholder="W1AW" autocomplete="username" required />
        <label for="name">Full Name</label>
        <input id="name" name="name" type="text" placeholder="Hiram Percy Maxim" required />
        <label for="email">Email (optional)</label>
        <input id="email" name="email" type="email" placeholder="you@example.com" />
        <label for="licenseClass">License Class</label>
        <select id="licenseClass" name="licenseClass" style="width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:4px;margin-bottom:16px;font-size:1rem">
          <option value="">— select —</option>
          <option value="technician">Technician</option>
          <option value="general">General</option>
          <option value="extra">Extra</option>
        </select>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required />
        <div id="error" class="error" style="display:none"></div>
        <button type="submit">Register</button>
      </form>
      <p style="margin-top:16px;font-size:0.875rem">Already have an account? <a href="/ui/login">Login</a></p>
      <script>
        document.getElementById('register-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const err = document.getElementById('error');
          err.style.display = 'none';
          const licenseClass = document.getElementById('licenseClass').value;
          const body = {
            callsign: document.getElementById('callsign').value.toUpperCase(),
            name: document.getElementById('name').value,
            email: document.getElementById('email').value || undefined,
            password: document.getElementById('password').value,
          };
          if (licenseClass) body.licenseClass = licenseClass;
          const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!res.ok) { err.textContent = data.error; err.style.display = 'block'; return; }
          localStorage.setItem('emcomm_token', data.token);
          localStorage.setItem('emcomm_callsign', data.operator.callsign);
          window.location.href = '/';
        });
      </script>
    `)),
  );

// Root dashboard — requires login client-side
export const dashboardRoute = new Hono().get('/', (c) =>
  c.html(layout('Dashboard', `
    <h1>EmComm Dashboard</h1>
    <div id="guest" style="display:none">
      <p>Welcome. <a href="/ui/login">Login</a> or <a href="/ui/register">Register</a> to continue.</p>
    </div>
    <div id="app" style="display:none">
      <p>Logged in as <strong id="callsign-display"></strong></p>
      <h2 style="font-size:1.1rem;margin-top:24px">Active Nets</h2>
      <div id="nets-list"><em>Loading…</em></div>
      <h2 style="font-size:1.1rem;margin-top:24px">Open Incidents</h2>
      <div id="incidents-list"><em>Loading…</em></div>
      <p style="margin-top:32px"><button onclick="logout()">Logout</button></p>
    </div>
    <script>
      const token = localStorage.getItem('emcomm_token');
      const callsign = localStorage.getItem('emcomm_callsign');
      if (!token) {
        document.getElementById('guest').style.display = 'block';
      } else {
        document.getElementById('app').style.display = 'block';
        document.getElementById('callsign-display').textContent = callsign;
        const headers = { Authorization: 'Bearer ' + token };
        fetch('/nets', { headers })
          .then(r => r.json())
          .then(nets => {
            const active = nets.filter(n => n.status === 'active');
            document.getElementById('nets-list').innerHTML = active.length
              ? active.map(n => \`<div class="card"><strong>\${n.name}</strong> &nbsp;<span class="badge badge-active">\${n.status}</span><br><small>\${n.frequency} MHz \${n.mode} — NCS: \${n.netControl}</small></div>\`).join('')
              : '<p>No active nets.</p>';
          });
        fetch('/incidents', { headers })
          .then(r => r.json())
          .then(incidents => {
            const open = incidents.filter(i => i.status !== 'resolved');
            document.getElementById('incidents-list').innerHTML = open.length
              ? open.map(i => \`<div class="card"><strong>\${i.title}</strong> &nbsp;<span class="badge badge-open">\${i.severity}</span><br><small>\${i.status}\${i.location ? ' — ' + i.location : ''}</small></div>\`).join('')
              : '<p>No open incidents.</p>';
          });
      }
      function logout() {
        localStorage.removeItem('emcomm_token');
        localStorage.removeItem('emcomm_callsign');
        window.location.href = '/ui/login';
      }
    </script>
  `)),
);
