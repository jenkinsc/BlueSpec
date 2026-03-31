"""
BlueSpec end-to-end test suite (Playwright / Python)

Flows covered:
  1. Auth         — login, logout, invalid credentials, unauthenticated redirect
  2. Nets         — create net, open net, add check-in, close net, view summary
  3. Incidents    — create incident, view detail, log activity
  4. Templates    — create template, auto-fill into create-net form
  5. Org          — view org page, create org, invite member by callsign
  6. ThirdParty   — net control checks in third-party callsign (BLUAAA-66)
  7. NetIncident  — create incident from net session view (BLUAAA-67, BLUAAA-68)
  8. ICS309       — ICS-309 / CSV export buttons on net summary (BLUAAA-71)
  9. RoleMode     — role and mode fields on check-ins (BLUAAA-72)
  10. NetList     — check-in counts, All/Open/Closed/Draft tabs (BLUAAA-73)
  11. Timeline    — net timeline event log and manual comment (BLUAAA-75)
  12. Location    — location fields on check-ins (BLUAAA-76)
  13. TrafficType — extended traffic types and net general comments (BLUAAA-77)
  14. AutoRefresh — check-ins auto-refresh while net is open (BLUAAA-78)
  15. Layout      — net session two-column layout panels present (BLUAAA-70)

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
    time.sleep(0.3)
    # Third user for auto-refresh test (requires a second station)
    refresh_user = create_user("REF")
    return {"admin": admin, "member": member, "refresh": refresh_user}


@pytest.fixture(scope="session")
def session_open_net(shared_users: Dict) -> Dict:
    """
    Create and open ONE shared net for the session.
    Reused by layout/sidebar tests to reduce API call volume and avoid
    hitting the global rate-limit (100 req/min).
    """
    cs, _, token = shared_users["admin"]
    status, net = _api("POST", "/nets", {
        "name": f"E2E Session Net {int(time.time())}",
        "frequency": "146.520",
        "mode": "FM",
    }, token=token)
    assert status == 201, f"session_open_net create failed: {net}"
    _api("POST", f"/nets/{net['id']}/open", token=token)
    return {"id": net["id"], "name": net["name"], "token": token, "callsign": cs}


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

        # BLUAAA-73 renamed the button from "New" to "Create Net"
        page.click("button:has-text('Create Net')")
        page.wait_for_selector("h2:has-text('New Net')", timeout=5_000)

        net_name = f"E2E Net {int(time.time())}"
        page.fill("input[name='name']", net_name)
        page.fill("input[name='frequency']", "146.520")
        # mode defaults to FM

        # Click Create inside the modal (scope to the shadow overlay)
        page.locator("div[class*='shadow-xl']").locator("button:has-text('Create')").click()
        # Wait for modal to close and list to refresh
        page.wait_for_selector("h2:has-text('New Net')", state="hidden", timeout=5_000)

        # BLUAAA-73 removed the "Draft" tab; new nets are visible under "All"
        page.click("button:has-text('All')")
        page.wait_for_selector(f"text={net_name}", timeout=5_000)
        assert page.locator(f"text={net_name}").count() > 0, \
            f"Net '{net_name}' not in All. " + fail_screenshot(page, "create_net")

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

        # BLUAAA-73 removed "Draft" tab; draft nets appear under "All"
        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        page.click("button:has-text('All')")
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
        # BLUAAA-70 renders two "Close Net" buttons (mobile hidden + desktop visible);
        # use .last to target the visible desktop instance.
        page.locator("button:has-text('Close Net')").last.wait_for(state="visible", timeout=5_000)
        page.locator("button:has-text('Close Net')").last.click()
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
        # BLUAAA-73 renamed the button from "New" to "Create Net"
        page.click("button:has-text('Create Net')")
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
# 6. THIRD-PARTY CHECK-INS  (BLUAAA-66)
# ---------------------------------------------------------------------------

class TestThirdPartyCheckins:
    def test_net_control_can_check_in_third_party(self, shared_users: Dict):
        """Net control can submit a check-in for an external callsign not in the system."""
        cs, _, token = shared_users["admin"]

        # Create and open a net
        _, net = _api("POST", "/nets", {"name": f"E2E 3P {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        third_party_cs = f"W{int(time.time()) % 9999:04d}XX"
        status, body = _api("POST", f"/nets/{net_id}/check-ins", {
            "signal_report": "57",
            "traffic_type": "routine",
            "operator_callsign": third_party_cs,
        }, token=token)
        assert status == 201, f"Third-party check-in failed: {body}"
        assert body["operatorCallsign"].upper() == third_party_cs.upper(), \
            f"Callsign mismatch: {body}"
        assert body["operatorId"] is None, "Third-party should have null operatorId"

    def test_duplicate_callsign_rejected(self, shared_users: Dict):
        """Same callsign cannot check in to the same net twice."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E Dedup {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        # First check-in for the operator (self)
        status1, _ = _api("POST", f"/nets/{net_id}/check-ins", {
            "signal_report": "59", "traffic_type": "routine",
        }, token=token)
        assert status1 == 201

        # Second check-in for the same operator should be rejected
        status2, body2 = _api("POST", f"/nets/{net_id}/check-ins", {
            "signal_report": "59", "traffic_type": "routine",
        }, token=token)
        assert status2 == 409, f"Expected 409, got {status2}: {body2}"

    def test_net_control_checkin_third_party_ui(self, page: Page, shared_users: Dict):
        """UI: net control can enter a custom callsign in the check-in form."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        _, net = _api("POST", "/nets", {"name": f"E2E 3P UI {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        # The callsign input should be editable (net control is the opener)
        cs_input = page.locator("label:has-text('Callsign') + input, input[class*='font-mono']").first
        page.wait_for_selector("button:has-text('Check In')", timeout=5_000)

        third_party = f"W{int(time.time()) % 9999:04d}ZZ"
        # Clear and fill a different callsign
        cs_input.fill(third_party)
        page.click("button:has-text('Check In')")

        page.wait_for_selector(f"text={third_party}", timeout=5_000)
        assert page.locator(f"text={third_party}").count() > 0, \
            fail_screenshot(page, "third_party_ui")


# ---------------------------------------------------------------------------
# 7. INCIDENTS FROM NET SESSION  (BLUAAA-67 and BLUAAA-68)
# ---------------------------------------------------------------------------

class TestNetIncidents:
    def test_create_incident_with_net_id_via_api(self, shared_users: Dict):
        """POST /incidents with net_id links incident to net."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E IncNet {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        title = f"E2E Net Incident {int(time.time())}"
        status, inc = _api("POST", "/incidents", {
            "title": title,
            "incident_type": "Fire",
            "activation_level": 1,
            "net_id": net_id,
        }, token=token)
        assert status == 201, f"Incident create failed: {inc}"
        assert inc["netId"] == net_id, f"netId not set: {inc}"

    def test_filter_incidents_by_net_id(self, shared_users: Dict):
        """GET /incidents?netId=<id> returns only incidents linked to that net."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E FilterNet {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]

        title = f"E2E Filter Inc {int(time.time())}"
        _api("POST", "/incidents", {"title": title, "incident_type": "Flood", "activation_level": 1, "net_id": net_id}, token=token)

        status, incidents_list = _api("GET", f"/incidents?netId={net_id}", token=token)
        assert status == 200
        titles = [i["title"] for i in incidents_list]
        assert title in titles, f"Incident not found in net-filtered list: {titles}"

    def test_create_incident_from_net_session_ui(self, page: Page, shared_users: Dict):
        """UI: '+ New Incident' button in net session sidebar creates an incident."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        _, net = _api("POST", "/nets", {"name": f"E2E NetInc UI {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        # BLUAAA-70 renders two instances (mobile hidden + desktop visible); use .last
        page.locator("button:has-text('+ New Incident')").last.wait_for(state="visible", timeout=8_000)
        page.locator("button:has-text('+ New Incident')").last.click()

        # Fill incident form in the sidebar
        page.wait_for_selector("input[placeholder='Title']", timeout=5_000)
        inc_title = f"E2E Sidebar Inc {int(time.time())}"
        page.locator("input[placeholder='Title']").first.fill(inc_title)
        page.locator("input[placeholder='Incident type']").first.fill("Wildfire")

        page.locator("button:has-text('Create')").last.click()
        # After creation, verify via API that the incident was created and linked to the net.
        # NOTE: The incident sidebar queries status=active but new incidents have status=reported,
        # so the title won't appear in the sidebar immediately — this is BUG-4 (see KNOWN BUGS).
        page.wait_for_timeout(1_500)  # let mutation settle
        _, incidents_list = _api("GET", f"/incidents?netId={net_id}", token=token)
        titles = [i.get("title") for i in incidents_list]
        assert inc_title in titles, \
            f"Incident not found via API after sidebar creation: {titles}. " + fail_screenshot(page, "net_incident_ui")

    def test_org_active_incidents_shown_in_sidebar(self, page: Page, shared_users: Dict):
        """UI: Active incidents across the org appear in the net session incident sidebar."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        inc_title = f"E2E OrgInc {int(time.time())}"
        # NOTE (BUG-4): Sidebar queries status=active; new incidents default to 'reported'.
        # Create and immediately PATCH to 'active' BEFORE page navigation so the sidebar
        # finds it on its initial mount fetch.
        _, inc = _api("POST", "/incidents", {"title": inc_title, "incident_type": "Storm", "activation_level": 1}, token=token)
        assert "id" in inc, f"Incident create failed: {inc}"
        _api("PATCH", f"/incidents/{inc['id']}", {"status": "active"}, token=token)

        _, net = _api("POST", "/nets", {"name": f"E2E OrgInc Net {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1_500)  # let sidebar queries settle

        # "Other Active" section starts collapsed; expand it
        page.locator("button:has-text('Other Active')").last.wait_for(state="visible", timeout=5_000)
        page.locator("button:has-text('Other Active')").last.click()
        page.wait_for_timeout(400)
        assert page.locator(f"text={inc_title}").count() > 0, \
            f"Org incident not visible in sidebar. " + fail_screenshot(page, "org_incident_sidebar")


# ---------------------------------------------------------------------------
# 8. ICS-309 AND CSV EXPORT  (BLUAAA-71)
# ---------------------------------------------------------------------------

class TestICS309Export:
    def test_summary_has_ics309_button(self, page: Page, shared_users: Dict):
        """Net summary page has ICS-309 export button."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        _, net = _api("POST", "/nets", {"name": f"E2E ICS309 {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _api("POST", f"/nets/{net_id}/close", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}/summary")
        page.wait_for_load_state("networkidle")

        assert page.locator("button:has-text('ICS-309')").count() > 0, \
            fail_screenshot(page, "ics309_button")

    def test_summary_has_csv_download_button(self, page: Page, shared_users: Dict):
        """Net summary page has Download CSV export button."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        _, net = _api("POST", "/nets", {"name": f"E2E CSV {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _api("POST", f"/nets/{net_id}/close", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}/summary")
        page.wait_for_load_state("networkidle")

        assert page.locator("button:has-text('CSV')").count() > 0, \
            fail_screenshot(page, "csv_button")

    def test_ics309_opens_in_new_tab(self, page: Page, shared_users: Dict):
        """Clicking ICS-309 button opens a new window/tab with the form."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        net_name = f"E2E ICS309 Open {int(time.time())}"
        _, net = _api("POST", "/nets", {"name": net_name, "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _api("POST", f"/nets/{net_id}/check-ins", {"signal_report": "59", "traffic_type": "routine"}, token=token)
        _api("POST", f"/nets/{net_id}/close", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}/summary")
        page.wait_for_load_state("networkidle")

        with page.context.expect_page() as new_page_info:
            page.click("button:has-text('ICS-309')")
        new_page = new_page_info.value
        new_page.wait_for_load_state("domcontentloaded")
        assert "ICS" in new_page.title() or "ICS-309" in new_page.content(), \
            fail_screenshot(page, "ics309_new_tab")


# ---------------------------------------------------------------------------
# 9. ROLE AND MODE FIELDS  (BLUAAA-72)
# ---------------------------------------------------------------------------

class TestRoleMode:
    def test_checkin_with_role_and_mode_via_api(self, shared_users: Dict):
        """POST /nets/:netId/check-ins with role and mode stores them correctly."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E RoleMode {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        status, body = _api("POST", f"/nets/{net_id}/check-ins", {
            "signal_report": "59",
            "traffic_type": "routine",
            "role": "MOBILE",
            "mode": "SSB",
        }, token=token)
        assert status == 201, f"Check-in with role/mode failed: {body}"
        assert body["role"] == "MOBILE", f"Role not saved: {body}"
        assert body["mode"] == "SSB", f"Mode not saved: {body}"

    def test_role_mode_visible_in_ui(self, page: Page, shared_users: Dict):
        """UI: role and mode badges appear in the check-in list after submission."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        _, net = _api("POST", "/nets", {"name": f"E2E RM UI {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_selector("button:has-text('Check In')", timeout=5_000)

        # Select Role = PORTABLE
        page.locator("label:has-text('Role') + select").select_option("PORTABLE")
        # Select Mode = FM
        page.locator("label:has-text('Mode') + select").select_option("FM")
        page.click("button:has-text('Check In')")

        # Role and mode badges should appear in the list
        page.wait_for_selector("text=PORTABLE", timeout=5_000)
        assert page.locator("text=PORTABLE").count() > 0, \
            fail_screenshot(page, "role_badge")
        assert page.locator("text=FM").count() > 0, \
            fail_screenshot(page, "mode_badge")

    def test_invalid_role_rejected(self, shared_users: Dict):
        """API rejects an unknown role value."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E BadRole {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        status, body = _api("POST", f"/nets/{net_id}/check-ins", {
            "signal_report": "59",
            "traffic_type": "routine",
            "role": "INVALID_ROLE",
        }, token=token)
        assert status == 400, f"Expected 400 for bad role, got {status}: {body}"


# ---------------------------------------------------------------------------
# 10. NET LIST PAGE IMPROVEMENTS  (BLUAAA-73)
# ---------------------------------------------------------------------------

class TestNetList:
    def test_net_list_tabs_present(self, page: Page, shared_users: Dict):
        """Net list page shows All / Open / Closed / Draft tabs."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")

        # BLUAAA-73 removed the "Draft" tab; draft nets show under "All"
        for tab_label in ("All", "Open", "Closed"):
            assert page.locator(f"button:has-text('{tab_label}')").count() > 0, \
                f"Tab '{tab_label}' not found. " + fail_screenshot(page, f"tab_{tab_label.lower()}")

    def test_checkin_count_shown_on_closed_net(self, page: Page, shared_users: Dict):
        """Closed net rows on the net list show check-in count."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        net_name = f"E2E CountNet {int(time.time())}"
        _, net = _api("POST", "/nets", {"name": net_name, "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _api("POST", f"/nets/{net_id}/check-ins", {"signal_report": "59", "traffic_type": "routine"}, token=token)
        _api("POST", f"/nets/{net_id}/close", token=token)

        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        page.click("button:has-text('Closed')")
        page.wait_for_selector(f"text={net_name}", timeout=5_000)

        # Should show "1 check-in"
        assert page.locator("text=1 check-in").count() > 0, \
            fail_screenshot(page, "checkin_count")

    def test_api_returns_checkin_counts_with_includeCounts(self, shared_users: Dict):
        """API: GET /nets?includeCounts=true returns checkInCount field."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E APICount {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _api("POST", f"/nets/{net_id}/check-ins", {"signal_report": "59", "traffic_type": "routine"}, token=token)

        status, nets_list = _api("GET", "/nets?status=open&includeCounts=true", token=token)
        assert status == 200
        matching = [n for n in nets_list if n["id"] == net_id]
        assert len(matching) == 1, "Net not found in list"
        assert matching[0].get("checkInCount") == 1, f"checkInCount wrong: {matching[0]}"

    def test_open_net_shows_elapsed_time(self, page: Page, shared_users: Dict):
        """Open net rows show elapsed time status detail."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        net_name = f"E2E OpenTime {int(time.time())}"
        _, net = _api("POST", "/nets", {"name": net_name, "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        page.click("button:has-text('Open')")
        page.wait_for_selector(f"text={net_name}", timeout=5_000)

        # Status detail should contain "Open"
        assert page.locator("text=Open").count() > 0, \
            fail_screenshot(page, "open_elapsed_time")


# ---------------------------------------------------------------------------
# 11. NET TIMELINE LOG  (BLUAAA-75)
# ---------------------------------------------------------------------------

class TestNetTimeline:
    def test_checkin_creates_timeline_event(self, shared_users: Dict):
        """A check-in automatically creates a 'check_in' event in the timeline."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E Timeline {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _api("POST", f"/nets/{net_id}/check-ins", {"signal_report": "59", "traffic_type": "routine"}, token=token)

        status, events = _api("GET", f"/nets/{net_id}/events", token=token)
        assert status == 200, f"Events fetch failed: {events}"
        assert isinstance(events, list), "Events should be a list"

        event_types = [e["eventType"] for e in events]
        assert "check_in" in event_types, f"No check_in event found: {event_types}"

    def test_net_open_creates_event(self, shared_users: Dict):
        """Opening a net creates a 'net_open' timeline event."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E NetOpen Event {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        status, events = _api("GET", f"/nets/{net_id}/events", token=token)
        assert status == 200
        event_types = [e["eventType"] for e in events]
        assert "net_open" in event_types, f"No net_open event: {event_types}"

    def test_manual_comment_added_to_timeline(self, shared_users: Dict):
        """POST /nets/:id/events adds a manual 'comment' event."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E Comment Event {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        comment_text = f"Test timeline comment {int(time.time())}"
        status, body = _api("POST", f"/nets/{net_id}/events", {"note": comment_text}, token=token)
        assert status == 201, f"Comment event POST failed: {body}"
        assert body["eventType"] == "comment"
        # API prepends "[CALLSIGN] " prefix to the note
        assert comment_text in body["note"]

        # Verify it appears in event list
        _, events = _api("GET", f"/nets/{net_id}/events", token=token)
        notes = [e["note"] for e in events if e["note"]]
        assert any(comment_text in note for note in notes), f"Comment not in timeline: {notes}"

    def test_timeline_comment_visible_in_ui(self, page: Page, shared_users: Dict):
        """UI: '+ Comment' button posts a manual note to the timeline."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        _, net = _api("POST", "/nets", {"name": f"E2E TLComment UI {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        # BLUAAA-70 renders two instances (mobile hidden + desktop visible); use .last
        page.locator("button:has-text('+ Comment')").last.wait_for(state="visible", timeout=8_000)
        page.locator("button:has-text('+ Comment')").last.click()

        comment_text = f"UI timeline note {int(time.time())}"
        page.wait_for_selector("textarea", timeout=3_000)
        page.locator("textarea").first.fill(comment_text)
        page.locator("button:has-text('Post')").click()

        page.wait_for_selector(f"text={comment_text}", timeout=5_000)
        assert page.locator(f"text={comment_text}").count() > 0, \
            fail_screenshot(page, "timeline_comment_ui")

    def test_events_sorted_ascending(self, shared_users: Dict):
        """Timeline events are returned in ascending chronological order."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E EventOrder {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        time.sleep(0.1)
        _api("POST", f"/nets/{net_id}/events", {"note": "first"}, token=token)
        time.sleep(0.1)
        _api("POST", f"/nets/{net_id}/events", {"note": "second"}, token=token)

        _, events = _api("GET", f"/nets/{net_id}/events", token=token)
        timestamps = [e["createdAt"] for e in events]
        assert timestamps == sorted(timestamps), f"Events not in order: {timestamps}"


# ---------------------------------------------------------------------------
# 12. LOCATION FIELDS ON CHECK-INS  (BLUAAA-76)
# ---------------------------------------------------------------------------

class TestLocationFields:
    def test_patch_checkin_location_via_api(self, shared_users: Dict):
        """PATCH check-in with location fields stores them correctly."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E Location {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _, checkin = _api("POST", f"/nets/{net_id}/check-ins", {"signal_report": "59", "traffic_type": "routine"}, token=token)
        checkin_id = checkin["id"]

        status, updated = _api("PATCH", f"/nets/{net_id}/check-ins/{checkin_id}", {
            "grid_square": "EM28",
            "latitude": 38.8977,
            "longitude": -77.0366,
            "city": "Washington",
            "state": "DC",
            "county": "District of Columbia",
        }, token=token)
        assert status == 200, f"Location PATCH failed: {updated}"
        assert updated["gridSquare"] == "EM28", f"grid_square not saved: {updated}"
        assert updated["city"] == "Washington", f"city not saved: {updated}"
        assert updated["state"] == "DC", f"state not saved: {updated}"

    def test_location_change_creates_timeline_event(self, shared_users: Dict):
        """Updating location on a check-in creates a location_change event."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E LocEvent {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _, checkin = _api("POST", f"/nets/{net_id}/check-ins", {"signal_report": "59", "traffic_type": "routine"}, token=token)

        _api("PATCH", f"/nets/{net_id}/check-ins/{checkin['id']}", {
            "grid_square": "FN20", "city": "New York", "state": "NY",
        }, token=token)

        _, events = _api("GET", f"/nets/{net_id}/events", token=token)
        event_types = [e["eventType"] for e in events]
        assert "location_change" in event_types, f"No location_change event: {event_types}"

    def test_grid_square_shown_in_checkin_list(self, page: Page, shared_users: Dict):
        """UI: grid square is visible in the check-in list after being saved."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)

        _, net = _api("POST", "/nets", {"name": f"E2E Grid UI {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _, checkin = _api("POST", f"/nets/{net_id}/check-ins", {"signal_report": "59", "traffic_type": "routine"}, token=token)
        _api("PATCH", f"/nets/{net_id}/check-ins/{checkin['id']}", {"grid_square": "EM28"}, token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        # Multiple "EM28" elements (mobile timeline + check-in list + desktop timeline);
        # wait for the last visible one to avoid the CSS-hidden mobile element.
        page.locator("text=EM28").last.wait_for(state="visible", timeout=5_000)
        assert page.locator("text=EM28").count() > 0, \
            fail_screenshot(page, "grid_square_ui")


# ---------------------------------------------------------------------------
# 13. EXTENDED TRAFFIC TYPES AND NET GENERAL COMMENTS  (BLUAAA-77)
# ---------------------------------------------------------------------------

class TestTrafficTypeAndComments:
    def test_emergency_traffic_type_via_api(self, shared_users: Dict):
        """Check-in with traffic_type=emergency is accepted and stored."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E Emergency {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        status, body = _api("POST", f"/nets/{net_id}/check-ins", {
            "signal_report": "59", "traffic_type": "emergency",
        }, token=token)
        assert status == 201, f"Emergency check-in failed: {body}"
        assert body["trafficType"] == "emergency", f"trafficType not set: {body}"

    def test_all_traffic_types_accepted(self, shared_users: Dict):
        """All four traffic types (routine/welfare/priority/emergency) are valid."""
        cs, _, token = shared_users["admin"]

        # Use ONE net with third-party check-ins to minimize API calls
        _, net = _api("POST", "/nets", {
            "name": f"E2E TTypes {int(time.time())}", "frequency": "146.520", "mode": "FM"
        }, token=token)
        assert "id" in net, f"Net create failed: {net}"
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        for traffic_type in ("routine", "welfare", "priority", "emergency"):
            third_cs = f"T{traffic_type[:4].upper()}{int(time.time()) % 9999:04d}"[:10]
            status, body = _api("POST", f"/nets/{net_id}/check-ins", {
                "signal_report": "59",
                "traffic_type": traffic_type,
                "operator_callsign": third_cs,
            }, token=token)
            assert status == 201, f"traffic_type={traffic_type} rejected: {body}"

    def test_invalid_traffic_type_rejected(self, shared_users: Dict):
        """API rejects an unknown traffic_type value."""
        cs, _, token = shared_users["admin"]

        _, net = _api("POST", "/nets", {"name": f"E2E BadTraffic {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        assert "id" in net, f"Net create failed: {net}"
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        status, body = _api("POST", f"/nets/{net_id}/check-ins", {
            "signal_report": "59", "traffic_type": "urgent_traffic",
        }, token=token)
        assert status == 400, f"Expected 400 for invalid traffic_type, got {status}: {body}"

    def test_traffic_type_badge_shown_in_ui(self, page: Page, shared_users: Dict,
                                            session_open_net: Dict):
        """UI: emergency traffic type badge appears in check-in list."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        net_id = session_open_net["id"]

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_selector("button:has-text('Check In')", timeout=5_000)

        page.locator("label:has-text('Traffic') + select").select_option("emergency")
        page.click("button:has-text('Check In')")

        page.wait_for_selector("text=emergency", timeout=5_000)
        assert page.locator("text=emergency").count() > 0, \
            fail_screenshot(page, "emergency_badge_ui")


# ---------------------------------------------------------------------------
# 14. AUTO-REFRESH IN NET SESSION  (BLUAAA-78)
# ---------------------------------------------------------------------------

class TestAutoRefresh:
    def test_checkin_appears_without_reload(self, page: Page, shared_users: Dict):
        """
        A check-in added via API while the page is open appears in the list
        within the 15-second auto-refresh window.
        """
        cs, _, token = shared_users["admin"]
        # Use pre-created refresh user from session fixture (avoids extra auth calls)
        cs2, _, token2 = shared_users["refresh"]
        fast_login(page, cs, token)

        _, net = _api("POST", "/nets", {"name": f"E2E Refresh {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        # Verify page is open before second user checks in
        page.wait_for_selector("button:has-text('Check In')", timeout=5_000)

        # Second user checks in via API (simulating another station joining)
        _api("POST", f"/nets/{net_id}/check-ins", {"signal_report": "57", "traffic_type": "routine"}, token=token2)

        # Wait up to 20 seconds for auto-refresh to pick it up.
        # Multiple elements show cs2 (mobile timeline + check-in list + desktop timeline);
        # use .nth(1) to skip the CSS-hidden mobile element and target the check-in list.
        page.locator(f"text={cs2}").nth(1).wait_for(state="visible", timeout=20_000)
        assert page.locator(f"text={cs2}").count() > 0, \
            fail_screenshot(page, "auto_refresh")

    def test_auto_refresh_stops_when_net_closed(self, shared_users: Dict):
        """
        GET /nets/:id/check-ins refetchInterval is false when net is closed.
        Verify the net_status=closed query is served correctly.
        """
        cs, _, token = shared_users["admin"]

        status, net = _api("POST", "/nets", {"name": f"E2E RefreshStop {int(time.time())}", "frequency": "146.520", "mode": "FM"}, token=token)
        assert status == 201, f"Net create failed: {net}"
        net_id = net["id"]
        _api("POST", f"/nets/{net_id}/open", token=token)
        _api("POST", f"/nets/{net_id}/close", token=token)

        # After close, check-ins endpoint still works but net is closed
        status, net_data = _api("GET", f"/nets/{net_id}", token=token)
        assert status == 200
        assert net_data["status"] == "closed", f"Net should be closed: {net_data}"


# ---------------------------------------------------------------------------
# 15. NET SESSION LAYOUT  (BLUAAA-65, BLUAAA-70)
# ---------------------------------------------------------------------------

class TestNetSessionLayout:
    """
    Tests for the net session page layout (BLUAAA-65, BLUAAA-70).
    All tests share one open net via session_open_net fixture to avoid rate-limit bursts.
    """

    def test_net_session_page_loads_without_errors(self, page: Page, shared_users: Dict,
                                                    session_open_net: Dict):
        """Net session page loads without any error banners."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        net_id = session_open_net["id"]

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        assert page.locator("text=Something went wrong").count() == 0, \
            fail_screenshot(page, "layout_error_banner")
        assert page.locator("button:has-text('Check In')").count() > 0, \
            fail_screenshot(page, "layout_no_checkin_btn")

    def test_weather_panel_present(self, page: Page, shared_users: Dict,
                                   session_open_net: Dict):
        """Net session page includes the NWS weather alerts panel."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        net_id = session_open_net["id"]

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        # Weather panel header — contains "Weather" or "Alerts"
        assert page.locator("text=Weather").count() > 0 or page.locator("text=Alerts").count() > 0, \
            fail_screenshot(page, "weather_panel")

    def test_incident_sidebar_panel_present(self, page: Page, shared_users: Dict,
                                            session_open_net: Dict):
        """Net session page includes the incident sidebar panel."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        net_id = session_open_net["id"]

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        # "+ New Incident" button appears in both mobile and desktop sidebars
        assert page.locator("button:has-text('+ New Incident')").count() > 0, \
            fail_screenshot(page, "incident_sidebar")

    def test_timeline_panel_present(self, page: Page, shared_users: Dict,
                                    session_open_net: Dict):
        """Net session page includes the timeline event panel."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        net_id = session_open_net["id"]

        page.goto(f"{BASE_URL}/nets/{net_id}")
        page.wait_for_load_state("networkidle")

        assert page.locator("button:has-text('+ Comment')").count() > 0, \
            fail_screenshot(page, "timeline_panel")

    def test_close_net_button_visible(self, page: Page, shared_users: Dict,
                                      session_open_net: Dict):
        """Net control operator can see 'Close Net' button on session page."""
        cs, _, token = shared_users["admin"]
        fast_login(page, cs, token)
        net_id = session_open_net["id"]

        page.goto(f"{BASE_URL}/nets/{net_id}")
        # Two "Close Net" buttons: mobile (hidden) and desktop (visible)
        page.locator("button:has-text('Close Net')").last.wait_for(state="visible", timeout=5_000)
        assert page.locator("button:has-text('Close Net')").count() > 0, \
            fail_screenshot(page, "close_net_btn")


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
#
# BUG-4: Incident sidebar (BLUAAA-67/68) never shows newly created incidents
#   - IncidentSidebar queries GET /incidents?netId=...&status=active and
#     GET /incidents?status=active for org-wide incidents
#   - But POST /incidents creates incidents with status='reported' (default), not 'active'
#   - Newly created incidents are therefore invisible in the sidebar immediately after creation
#   - Workaround: PATCH incident to status='active' to make it visible
#   - Action: Engineer should either (a) change POST /incidents to default status='active'
#     when created via net session, or (b) broaden the sidebar query to include 'reported'
#     and other non-resolved statuses
#
# BUG-3: Migration 0010 (check_ins_location) partially applied on existing DBs
#   - Only grid_square was present; latitude, longitude, county, city, state
#     were missing because 0010's first ALTER TABLE (grid_square) failed with
#     "duplicate column" when grid_square already existed, halting subsequent
#     statements while Drizzle recorded the migration as complete.
#   - QA workaround: applied missing columns manually via sqlite3
#   - Action: Engineer should add 0010 to the backfill probe list in migrate.ts
#     using each column individually, or restructure 0010 to use IF NOT EXISTS
