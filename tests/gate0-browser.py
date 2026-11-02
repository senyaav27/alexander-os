# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.62.0"]
# ///
"""Synthetic Chromium checks. No Google API calls or real browser profiles."""
import functools
import http.server
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_port}"
source = (ROOT / "app.js").read_text()
# Expose existing functions only in this test response, never in production assets.
pos = source.index("\n})();")
instrumented = source[:pos] + "window.gate0={backup:()=>createBackupPayload(state), validate:validateBackupData};\n" + source[pos:]


def new_task(page, title):
    page.locator('#globalAdd').click()
    page.locator('[data-quick="task"]').click()
    page.locator('#modal input[name="title"]').fill(title)
    page.locator('#modal input[name="due"]').fill('')
    page.locator('#modalSubmit').click()


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        context = browser.new_context(service_workers="block")
        context.route("**/app.js?*", lambda route: route.fulfill(body=instrumented, content_type="application/javascript"))
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: (errors.append(str(error)), print("PAGE ERROR", str(error), flush=True)))
        page.goto(base)
        for screen in ["finance", "tasks", "projects", "growth", "dashboard"]:
            page.locator(f'.nav-item[data-screen="{screen}"]').click()
            assert len(page.locator('#app').inner_text()) > 50
        new_task(page, "Synthetic gate0 task")
        page.reload()
        page.wait_for_function("window.gate0 !== undefined")
        backup = page.evaluate("gate0.backup()")
        assert any(t["title"] == "Synthetic gate0 task" for t in backup["data"]["tasks"])
        print("PASS five screens and persisted task")
        # Restore through the real file-input handler and its confirmation.
        import json
        backup["data"]["notes"] = [{"id": "synthetic-note", "title": "Synthetic", "body": "restore marker"}]
        page.on("dialog", lambda dialog: dialog.accept())
        page.locator('#profileSettingsTrigger').click()
        page.locator('#importData').set_input_files({"name": "synthetic.json", "mimeType": "application/json", "buffer": json.dumps(backup).encode()})
        page.wait_for_timeout(300)
        assert page.evaluate("gate0.backup().data.notes[0].id") == "synthetic-note"
        assert page.evaluate("!!localStorage.getItem('alexander_os_pre_import_backup')")
        page.reload()
        page.wait_for_function("window.gate0 !== undefined")
        assert page.evaluate("gate0.backup().data.notes[0].id") == "synthetic-note"
        print("PASS JSON restore, pre-import backup, persistence")
        # Force quota failure after boot; the latest in-memory task must remain exportable.
        page.evaluate("""() => {const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='alexander_os_v1')throw new DOMException('synthetic quota','QuotaExceededError');return original.call(this,k,v)}}""")
        new_task(page, "Unsaved synthetic task")
        page.locator('#aosPersistenceWarning').wait_for(state='visible', timeout=5000)
        assert page.evaluate("gate0.backup().data.tasks.some(t=>t.title==='Unsaved synthetic task')")
        assert not page.evaluate("JSON.parse(localStorage.getItem('alexander_os_v1')).tasks.some(t=>t.title==='Unsaved synthetic task')")
        print("PASS quota warning and export of unsaved session")
        assert not errors, errors
        context.close()
        context = browser.new_context(service_workers="block")
        context.add_init_script("localStorage.setItem('alexander_os_v1','{corrupt synthetic')")
        page = context.new_page()
        page.goto(base)
        page.locator('#aosPersistenceWarning').wait_for(state='visible', timeout=5000)
        assert page.evaluate("localStorage.getItem('alexander_os_v1')") == "{corrupt synthetic"
        print("PASS corrupt startup retains original disk bytes")
        context.close()
        # Actual service-worker offline navigation (without routing/instrumentation).
        context = browser.new_context()
        context.add_init_script("sessionStorage.setItem('alexander_os_sw_reloaded', '1')")
        page = context.new_page()
        page.goto(base)
        page.evaluate("navigator.serviceWorker.ready.then(()=>true)")
        page.wait_for_function("navigator.serviceWorker.controller !== null")
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        page.locator('.nav-item[data-screen="tasks"]').click()
        assert len(page.locator('#app').inner_text()) > 50
        assert page.evaluate("typeof window.__AOS_SHEETS_LOCAL_PERSISTED") != "undefined"
        print("PASS service-worker offline boot includes Sheets module")
        context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
