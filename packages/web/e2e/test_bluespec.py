"""
BlueSpec end-to-end test suite (Playwright / Python)

Flows covered:
  1. Auth      — login, logout, invalid credentials, unauthenticated redirect
  2. Nets      — create net, open net, add check-in, close net, view summary
  3. Incidents — create incident, view detail, log activity
  4. Templates — create template, auto-fill into create-net form
  5. Org       — view org page, create org, invite member by callsign

Run with:  pytest packages/web/e2e/test_bluespec.py -v --tb=short
"""

import json
import time
import urllib.error
import urllib.request
from typing import Dict, Optional, Tuple

import pytest
from playwright.sync_api import Browser, Page, sync_playwright

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_URL = "http://localhost:5173"
API_URL  = "http://localhost:3000"

# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _api(method: str, path: str, data=None, token: Optional[str] = None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{API_URL}{path}",
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


_cs_counter = 0

def unique_callsign(prefix: str = "T") -> str:
    global _cs_counter
    _cs_counter += 1
    # Callsigns: 3–10 chars; keep short and unique
    return f"{prefix[:3]}{int(time.time() * 10) % 99999:05d}{_cs_counter}"[:10]


def create_user(prefix: str = "T") -> Tuple[str, str, str]:
    """Register a new operator via API. Returns (callsign, password, token)."""
    cs = unique_callsign(prefix)
    pw = "testpass123"
    status, body = _api("POST", "/auth/register", {
        "callsign": cs, "name": f"QA {cs}", "password": pw
    })
    assert status == 201, f"register failed {status}: {body}"
    return cs, pw, body["token"]


# ---------------------------------------------------------------------------
# Pytest fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        yield b
        b.close()


@pytest.fixture(scope="session")
def shared_users() -> Dict[str, Tuple[str, str, str]]:
    """
    Pre-create test users once per session.
    Auth endpoint is rate-limited (10 req/min), so we minimise creates here
    and use fast_login (localStorage injection) for most tests.
    """
    admin = create_user("ADM")
    time.sleep(0.3)
    member = create_user("MBR")
    return {"admin": admin, "member": member}


@pytest.fixture
def page(browser: Browser):
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    pg = ctx.new_page()
    yield pg
    ctx.close()


# ---------------------------------------------------------------------------
# UI helpers
# ---------------------------------------------------------------------------

def login(page: Page, callsign: str, password: str) -> None:
    """UI login — use sparingly (auth rate-limited). Prefer fast_login."""
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("networkidle")
    page.fill("input[name='callsign']", callsign)
    page.fill("input[type='password']", password)
    page.click("button:has-text('Sign in')")
    page.wait_for_url(lambda url: "/login" not in url, timeout=8_000)
    page.wait_for_load_state("networkidle")
    _skip_onboarding(page)


def fast_login(page: Page, callsign: str, token: str) -> None:
    """Log in by injecting token into localStorage — bypasses UI and rate limit."""
    page.goto(f"{BASE_URL}/login")
    page.wait_for_load_state("domcontentloaded")
    page.evaluate("""([tok, cs]) => {
        localStorage.setItem('emcomm_token', tok);
        localStorage.setItem('emcomm_callsign', cs);
        localStorage.setItem('onboarding_complete', 'true');
    }""", [token, callsign])
    page.goto(f"{BASE_URL}/")
    page.wait_for_load_state("networkidle")


def _skip_onboarding(page: Page) -> None:
    page.evaluate("localStorage.setItem('onboarding_complete', 'true')")
    for _ in range(5):
        btn = page.locator("button:has-text('Skip'), button:has-text('Done')")
        if btn.count() > 0 and btn.first.is_visible():
            btn.first.click()
            page.wait_for_timeout(200)
        else:
            break


def fail_screenshot(page: Page, label: str) -> str:
    path = f"/tmp/e2e_fail_{label}.png"
    page.screenshot(path=path, full_page=True)
    return path


# ---------------------------------------------------------------------------
# 1. AUTH  (uses UI login — only 4 auth calls total for this class)
# ---------------------------------------------------------------------------

class TestAuth:
    def test_login_success(self, page: Page, shared_users: Dict):
        cs, pw, _ = shared_users["admin"]
        login(page, cs, pw)
        assert "/login" not in page.url, fail_screenshot(page, "login_success")
        assert page.locator(f"text={cs}").count() > 0, "callsign not in header"

    def test_login_invalid_credentials(self, page: Page):
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
        page.fill("input[name='callsign']", "BADCALL")
        page.fill("input[type='password']", "wrongpass")
        page.click("button:has-text('Sign in')")
        # Wait for error to appear (the form shows a root error on failed login)
        page.wait_for_selector("p.text-red-600, p.text-sm.text-red-600", timeout=5_000)
        assert "/login" in page.url, fail_screenshot(page, "invalid_creds")

    def test_logout(self, page: Page, shared_users: Dict):
        cs, pw, _ = shared_users["admin"]
        login(page, cs, pw)
        page.click("button:has-text('Sign out')")
        page.wait_for_url(f"{BASE_URL}/login", timeout=5_000)
        assert "/login" in page.url, fail_screenshot(page, "logout")

    def test_unauthenticated_redirect(self, page: Page):
        page.goto(f"{BASE_URL}/login")
        page.evaluate("localStorage.clear()")
        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        assert "/login" in page.url, \
            f"Expected /login, got {page.url}. " + fail_screenshot(page, "unauth_redirect")


# ---------------------------------------------------------------------------
# 2. NETS  (uses fast_login)
# ---------------------------------------------------------------------------

class TestNets:
    def test_create_net(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        page.click("button:has-text('New')")
        page.wait_for_selector("h2:has-text('New Net')", timeout=5_000)

        net_name = f"E2E Net {int(time.time())}"
        page.fill("input[name='name']", net_name)
        page.fill("input[name='frequency']", "146.520")
        # mode defaults to FM

        # Click Create inside the modal (scope to the shadow overlay)
        page.locator("div[class*='shadow-xl']").locator("button:has-text('Create')").click()
        # Wait for modal to close and list to refresh
        page.wait_for_selector("h2:has-text('New Net')", state="hidden", timeout=5_000)

        # Switch to Draft tab and wait for our net to appear
        page.click("button:has-text('Draft')")
        page.wait_for_selector(f"text={net_name}", timeout=5_000)
        assert page.locator(f"text={net_name}").count() > 0, \
            f"Net '{net_name}' not in Draft. " + fail_screenshot(page, "create_net")

    def test_open_net(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        # Create a draft net via API
        net_name = f"E2E Open {int(time.time())}"
        status, net = _api("POST", "/nets", {
            "name": net_name, "frequency": "146.520", "mode": "FM"
        }, token=token)
        assert status == 201, f"API create net failed: {net}"
        net_id = net["id"]

        # Go to Draft tab and click "Open Net" on our row
        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        page.click("button:has-text('Draft')")
        page.wait_for_selector(f"text={net_name}", timeout=5_000)

        # The action button in the row says "Open Net"
        page.locator(f"text={net_name}").locator("..").locator("..").locator("..").locator("button:has-text('Open Net')").click()
        page.wait_for_timeout(1_000)  # let mutation settle

        # Navigate directly to session to confirm it loaded
        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")
        assert "/nets/" in page.url
        assert page.locator(f"text={net_name}").count() > 0, \
            fail_screenshot(page, "open_net")

    def test_add_checkin(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        net_name = f"E2E CheckIn {int(time.time())}"
        _, net = _api("POST", "/nets", {
            "name": net_name, "frequency": "146.520", "mode": "FM"
        }, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_selector("button:has-text('Check In')", timeout=5_000)

        # RST is pre-filled "59"; leave traffic as "routine"; add a remark
        page.locator("input[placeholder='Optional']").fill("E2E test")
        page.click("button:has-text('Check In')")

        # Callsign appears in check-in list
        page.wait_for_selector(f"text={cs}", timeout=5_000)
        assert page.locator(f"text={cs}").count() > 0, \
            fail_screenshot(page, "add_checkin")

    def test_close_net(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        net_name = f"E2E Close {int(time.time())}"
        _, net = _api("POST", "/nets", {
            "name": net_name, "frequency": "146.520", "mode": "FM"
        }, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_selector("button:has-text('Close Net')", timeout=5_000)

        page.click("button:has-text('Close Net')")
        # Use wait_for_url since navigation is async after the mutation
        page.wait_for_url(lambda url: "summary" in url, timeout=8_000)
        assert f"/nets/{net_id}/summary" in page.url, \
            f"Expected summary, got {page.url}. " + fail_screenshot(page, "close_net")

    def test_net_summary(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        net_name = f"E2E Summary {int(time.time())}"
        _, net = _api("POST", "/nets", {"name": net_name, "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _api("POST", f"/nets/{net_id}/check-ins", {
            "signal_report": "59", "traffic_type": "routine", "remarks": "Test"
        }, token=token)
        _api("POST", f"/nets/{net_id}/close", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}/summary")
        page.wait_for_load_state("networkidle")

        assert page.locator(f"text={net_name}").count() > 0, \
            fail_screenshot(page, "net_summary")
        assert page.locator(f"text={cs}").count() > 0, \
            fail_screenshot(page, "net_summary_checkin")


# ---------------------------------------------------------------------------
# 3. INCIDENTS  (uses fast_login)
# ---------------------------------------------------------------------------

class TestIncidents:
    def test_create_incident(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        page.goto(f"{BASE_URL}/incidents")
        page.wait_for_load_state("networkidle")

        page.click("button:has-text('New')")
        page.wait_for_selector("h2:has-text('New Incident')", timeout=5_000)

        title = f"E2E Incident {int(time.time())}"
        # Title placeholder: "Flash flooding — County Road 4"
        page.locator("input[placeholder*='flooding']").fill(title)
        # Type field is also required (button disabled by !title || !type)
        page.locator("input[placeholder*='Flood']").fill("Flood")

        page.locator("div[class*='shadow-xl']").locator("button:has-text('Create Incident')").click()
        # onCreated navigates to /incidents/{id}; wait for that navigation then data load
        page.wait_for_url(lambda url: "/incidents/" in url, timeout=8_000)
        page.wait_for_selector(f"text={title}", timeout=8_000)

        assert page.locator(f"text={title}").count() > 0, \
            f"Incident '{title}' not found. " + fail_screenshot(page, "create_incident")

    def test_incident_detail(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        title = f"E2E Detail {int(time.time())}"
        status, incident = _api("POST", "/incidents", {
            "title": title, "incident_type": "Flood", "activation_level": 1
        }, token=token)
        assert status == 201, f"Create incident failed: {incident}"

        page.goto(f"{BASE_URL}/incidents/{incident['id']}")
        page.wait_for_load_state("networkidle")

        assert page.locator(f"text={title}").count() > 0, \
            fail_screenshot(page, "incident_detail")
        assert page.locator("text=reported").count() > 0, \
            fail_screenshot(page, "incident_status")

    def test_log_activity(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        title = f"E2E Activity {int(time.time())}"
        _, incident = _api("POST", "/incidents", {
            "title": title, "incident_type": "Search", "activation_level": 1
        }, token=token)

        page.goto(f"{BASE_URL}/incidents/{incident['id']}")
        page.wait_for_load_state("networkidle")

        note = f"Activity note {int(time.time())}"
        page.fill("input[placeholder*='Add activity'], input[placeholder*='activity note']", note)
        page.click("button:has-text('Add')")

        # Wait for the note to appear in the activity log
        page.wait_for_selector(f"text={note}", timeout=5_000)
        assert page.locator(f"text={note}").count() > 0, \
            fail_screenshot(page, "log_activity")


# ---------------------------------------------------------------------------
# 4. TEMPLATES  (uses fast_login)
# ---------------------------------------------------------------------------

class TestTemplates:
    def test_create_template(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        page.goto(f"{BASE_URL}/templates/new")
        page.wait_for_load_state("networkidle")

        tpl_name = f"E2E Template {int(time.time())}"
        page.fill("input[name='name']", tpl_name)
        page.fill("input[name='frequency']", "147.000")

        page.click("button:has-text('Create Template')")
        page.wait_for_url(f"{BASE_URL}/templates", timeout=5_000)
        page.wait_for_selector(f"text={tpl_name}", timeout=8_000)

        assert page.locator(f"text={tpl_name}").count() > 0, \
            fail_screenshot(page, "create_template")

    def test_template_autofills_create_net(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        tpl_name = f"E2E TplNet {int(time.time())}"
        status, tpl = _api("POST", "/templates", {
            "name": tpl_name, "frequency": "444.000", "mode": "FM"
        }, token=token)
        assert status == 201, f"Template create failed: {tpl}"

        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        page.click("button:has-text('New')")
        page.wait_for_selector("h2:has-text('New Net')", timeout=5_000)
        # Wait for template select to appear (only renders when templates query returns data)
        page.wait_for_selector(f"option:has-text('{tpl_name}')", state="attached", timeout=5_000)

        # Select by template ID (option value) — label includes " — freq mode" suffix
        page.locator("div[class*='shadow-xl']").locator("select").first.select_option(value=tpl["id"])
        page.wait_for_timeout(400)

        freq_val = page.input_value("input[name='frequency']")
        assert freq_val == "444.000", \
            f"Frequency not auto-filled: '{freq_val}'. " + fail_screenshot(page, "tpl_autofill")
        name_val = page.input_value("input[name='name']")
        assert name_val == tpl_name, \
            f"Name not auto-filled: '{name_val}'. " + fail_screenshot(page, "tpl_name_autofill")


# ---------------------------------------------------------------------------
# 5. ORG  (uses fast_login)
# ---------------------------------------------------------------------------

class TestOrg:
    def test_org_page_loads(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        page.goto(f"{BASE_URL}/org")
        page.wait_for_load_state("networkidle")
        assert page.locator("h1, h2").count() > 0, \
            "No headings on org page. " + fail_screenshot(page, "org_loads")
        assert page.locator("text=Something went wrong").count() == 0

    def test_create_org(self, page: Page, shared_users: Dict):
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        page.goto(f"{BASE_URL}/org")
        page.wait_for_load_state("networkidle")

        page.click("button:has-text('+ New'), button:has-text('New')")
        page.wait_for_selector("h2:has-text('New Organization')", timeout=5_000)

        org_name = f"E2E Org {int(time.time())}"
        page.fill("input[placeholder*='ARES']", org_name)
        # Click Create inside the modal overlay
        page.locator("div[class*='shadow-xl']").locator("button:has-text('Create')").click()
        page.wait_for_selector("h2:has-text('New Organization')", state="hidden", timeout=5_000)
        page.wait_for_load_state("networkidle")

        assert page.locator(f"text={org_name}").count() > 0, \
            f"Org '{org_name}' not found. " + fail_screenshot(page, "create_org")

    def test_invite_member_by_callsign(self, page: Page, shared_users: Dict):
        admin_cs, _, admin_token = shared_users["admin"]
        member_cs, _, _ = shared_users["member"]

        # Create org via API
        status, org = _api("POST", "/organizations", {
            "name": f"E2E InviteOrg {int(time.time())}"
        }, token=admin_token)
        assert status == 201, f"Org create failed: {org}"

        fast_login(page, admin_cs, admin_token)
        page.goto(f"{BASE_URL}/org")
        page.wait_for_load_state("networkidle")

        # Click org to expand it (click the org name)
        page.locator(f"text={org['name']}").first.click()
        page.wait_for_load_state("networkidle")

        # Fill callsign invite form
        page.locator("input[placeholder='Callsign']").first.fill(member_cs)
        page.click("button:has-text('Add')")

        # Wait for success message "Added {callsign}"
        page.wait_for_selector(f"text=Added {member_cs}", timeout=5_000)
        # The member list query is invalidated; wait for member to appear
        page.wait_for_selector(f"text={member_cs}", timeout=5_000)
        assert page.locator(f"text={member_cs}").count() > 0, \
            fail_screenshot(page, "invite_member")


# ---------------------------------------------------------------------------
# KNOWN BUGS (documented for Engineer)
# ---------------------------------------------------------------------------
#
# BUG-1: POST /auth/demo returns HTTP 500 (before migration fix)
#   - POST http://localhost:3000/auth/demo
#   - Expected: 201 with token + operator
#   - Actual: 500 {"error": "Internal server error"}
#   - Was caused by same migration issue as BUG-2
#
# BUG-2: Local dev DB not migrated — all write endpoints returned 500
#   - Migrations 0001–0007 not applied to packages/api/emcomm.db
#   - Root cause: drizzle migrate() considered hash already matched
#     despite schema being at v0 (missing net_control_id, templates,
#     organizations, incidents rework, etc.)
#   - QA workaround: applied migrations 0001–0007 manually via sqlite3
#   - Action: Engineer should fix migration bootstrapping so `npm run
#     db:migrate` in packages/api correctly applies pending migrations
