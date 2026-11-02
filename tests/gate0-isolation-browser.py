# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.62.0"]
# ///
"""Local-only tests of the generated test package. Never deploys or contacts Google."""
import functools
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
KEY = "gate0_test__alexander_os_v1"

with tempfile.TemporaryDirectory(prefix="aos-isolation-") as directory:
    output = Path(directory) / "site"
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(output))
    allowed = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    wrong = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    origin = f"http://127.0.0.1:{allowed.server_port}"
    wrong_origin = f"http://127.0.0.1:{wrong.server_port}"
    subprocess.run(["node", "scripts/prepare-gate0-test.mjs", "--out", str(output), "--origin", origin, "--allow-loopback-for-tests"], cwd=ROOT, check=True, capture_output=True)
    for server in [allowed, wrong]:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            executable = os.environ.get("AOS_CHROMIUM_EXECUTABLE")
            if not executable and Path("/usr/bin/chromium").is_file():
                executable = "/usr/bin/chromium"
            browser = p.chromium.launch(executable_path=executable, args=["--no-sandbox"])
            context = browser.new_context()
            context.add_init_script("sessionStorage.setItem('gate0_test__alexander_os_sw_reloaded','1')")
            page = context.new_page()
            external = []
            page.on("request", lambda request: external.append(request.url) if not request.url.startswith(origin + "/") else None)
            page.goto(origin + "/404.html")
            page.evaluate("localStorage.setItem('alexander_os_v1','SYNTHETIC_PRODUCTION_SENTINEL')")
            page.goto(origin)
            page.wait_for_function("window.__AOS_APP_READY === true")
            assert page.locator('#gate0TestBanner').is_visible()
            state = page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}'))")
            assert state["profile"]["name"] == "GATE0 B0 SYNTHETIC"
            assert [a["balance"] for a in state["accounts"]] == [10389, 500]
            assert len(state["transactions"]) == 2
            assert len(state["accountTransfers"]) == 1
            assert state["tasks"][0]["id"] == "b0-task"
            assert state["notes"][0]["id"] == "b0-note"
            assert page.evaluate("localStorage.getItem('alexander_os_v1')") == "SYNTHETIC_PRODUCTION_SENTINEL"
            print("PASS B0 boot uses isolated storage and preserves original-key sentinel")
            page.locator('#aosSheetTrigger').click()
            page.locator('#aosSyncLogin').click()
            page.wait_for_function("window.__AOS_SHEETS_STATUS?.kind === 'error'")
            assert "Google отключён" in page.locator('#aosSyncStatus').inner_text()
            assert not external, external
            print("PASS Google disabled: no OAuth, API, or external request")
            page.locator('#aosSyncClose').click()
            page.locator('#profileSettingsTrigger').click()
            invalid = json.loads((output / 'B0.json').read_text())
            del invalid['data']['testDataset']
            original = page.evaluate(f"localStorage.getItem('{KEY}')")
            page.once('dialog',lambda dialog: dialog.accept())
            with page.expect_event('dialog') as rejected:
                page.locator('#importData').set_input_files({"name":"unmarked-synthetic.json","mimeType":"application/json","buffer":json.dumps(invalid).encode()})
            assert rejected.value.type == 'alert'
            assert page.evaluate(f"localStorage.getItem('{KEY}')") == original
            page.locator('#modalClose').click()
            page.locator('#globalAdd').click()
            page.locator('[data-quick="task"]').click()
            page.locator('#modal input[name="title"]').fill('B0 temporary extra')
            page.locator('#modal input[name="due"]').fill('')
            page.locator('#modalSubmit').click()
            assert page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).tasks.length") == 2
            page.locator('#profileSettingsTrigger').click()
            page.once('dialog',lambda dialog: dialog.accept())
            with page.expect_event('dialog') as reset:
                page.locator('#resetData').click()
            assert reset.value.type == 'confirm'
            page.wait_for_function(f"JSON.parse(localStorage.getItem('{KEY}')).tasks.length === 1 && JSON.parse(localStorage.getItem('{KEY}')).profile.name === 'GATE0 B0 SYNTHETIC'")
            assert page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).testDataset") == 'B0-synthetic/v1'
            print("PASS unmarked backup import rejected; reset returns synthetic B0")
            page.locator('#modalClose').click()
            page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=15000)
            caches = page.evaluate("caches.keys()")
            assert caches and all(name.startswith('aos-gate0-test-') for name in caches)
            context.set_offline(True)
            page.reload(wait_until="domcontentloaded")
            page.wait_for_function("window.__AOS_APP_READY === true")
            assert page.locator('#gate0TestBanner').is_visible()
            assert page.evaluate(f"JSON.parse(localStorage.getItem('{KEY}')).accounts[0].balance") == 10389
            print("PASS isolated service worker and offline B0 boot")
            context.close()
            context = browser.new_context()
            page = context.new_page()
            page.goto(wrong_origin + "/404.html")
            page.evaluate("""async () => {localStorage.setItem('alexander_os_v1','SYNTHETIC_PRODUCTION_SENTINEL');await caches.open('synthetic-production-cache')}""")
            page.goto(wrong_origin)
            page.locator('#gate0OriginBlocked').wait_for(state="visible")
            assert page.evaluate("localStorage.getItem('alexander_os_v1')") == "SYNTHETIC_PRODUCTION_SENTINEL"
            assert page.evaluate(f"localStorage.getItem('{KEY}')") is None
            assert page.evaluate("caches.keys()") == ["synthetic-production-cache"]
            assert page.evaluate("navigator.serviceWorker.getRegistrations().then(xs=>xs.length)") == 0
            print("PASS wrong origin fails closed without modifying storage or service workers")
            context.close()
            browser.close()
    finally:
        for server in [allowed, wrong]:
            server.shutdown()
            server.server_close()
