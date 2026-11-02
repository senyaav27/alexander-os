# /// script
# requires-python = ">=3.11"
# dependencies = ["playwright==1.62.0"]
# ///
"""Synthetic Chromium checks. No Google API calls or real browser profiles."""
import functools
import http.server
import os
import json
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
instrumented = source[:pos] + "window.gate0={backup:()=>createBackupPayload(state), read:()=>safeStorage.getItem(STORAGE_KEY), validate:validateBackupData, encrypt:encryptBackupPayload, decrypt:decryptBackupPayload};\n" + source[pos:]
instrumented = instrumented.replace(
    "addEventListener('change', importData)",
    "addEventListener('change', async event => {try {await importData(event);} finally {window.__gate0ImportDone=true;}})",
)



def import_backup(page, payload, name):
    page.evaluate("window.__gate0ImportDone=false")
    page.locator('#importData').set_input_files({
        "name": name, "mimeType": "application/json", "buffer": json.dumps(payload).encode()
    })
    page.wait_for_function("window.__gate0ImportDone === true")


def new_task(page, title):
    page.locator('#globalAdd').click()
    page.locator('[data-quick="task"]').click()
    page.locator('#modal input[name="title"]').fill(title)
    page.locator('#modal input[name="due"]').fill('')
    page.locator('#modalSubmit').click()


try:
    with sync_playwright() as p:
        executable = os.environ.get("AOS_CHROMIUM_EXECUTABLE")
        if not executable and Path("/usr/bin/chromium").is_file():
            executable = "/usr/bin/chromium"
        browser = p.chromium.launch(executable_path=executable, args=["--no-sandbox"])
        context = browser.new_context(service_workers="block")
        context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(base + "/") else route.abort())
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
        backup["data"]["notes"] = [{"id": "synthetic-note", "title": "Synthetic", "body": "restore marker"}]
        page.on("dialog", lambda dialog: dialog.accept())
        page.locator('#profileSettingsTrigger').click()
        import_backup(page, backup, "synthetic.json")
        assert page.evaluate("gate0.backup().data.notes[0].id") == "synthetic-note"
        assert page.evaluate("!!localStorage.getItem('alexander_os_pre_import_backup')")
        page.reload()
        page.wait_for_function("window.gate0 !== undefined")
        assert page.evaluate("gate0.backup().data.notes[0].id") == "synthetic-note"
        print("PASS JSON restore, pre-import backup, persistence")
        original_backup = page.evaluate("gate0.backup().data")
        original_raw = page.evaluate("localStorage.getItem('alexander_os_v1')")
        invalid = json.loads(json.dumps(backup))
        invalid["data"]["tasks"] = [{"id": "duplicate", "title": "a"}, {"id": "duplicate", "title": "b"}]
        page.locator('#profileSettingsTrigger').click()
        import_backup(page, invalid, "invalid.json")
        assert page.evaluate("localStorage.getItem('alexander_os_v1')") == original_raw
        assert page.evaluate("gate0.backup().data") == original_backup
        print("PASS invalid JSON restore does not change original data")
        # A real storage failure during restore must preserve both disk and session.
        candidate = json.loads(json.dumps(backup))
        candidate["data"]["notes"][0]["id"] = "failed-restore-candidate"
        page.evaluate("""() => {window.beforeRestoreSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='alexander_os_v1')throw new DOMException('synthetic restore quota','QuotaExceededError');return window.beforeRestoreSet.call(this,k,v)}}""")
        import_backup(page, candidate, "quota.json")
        assert page.evaluate("localStorage.getItem('alexander_os_v1')") == original_raw
        assert page.evaluate("gate0.backup().data") == original_backup
        assert page.evaluate("gate0.read()") == original_raw
        page.evaluate("() => {Storage.prototype.setItem=window.beforeRestoreSet}")
        print("PASS failed restore preserves disk, session and next storage read")
        # A successful explicit restore recovers from the persistence warning.
        import_backup(page, backup, "recovery.json")
        page.wait_for_function("window.__AOS_STORAGE_UNSAFE === false")
        assert page.evaluate("gate0.backup().data.notes[0].id") == "synthetic-note"
        page.locator('#modalClose').click()
        roundtrip = page.evaluate("""async () => {const b=gate0.backup();const encrypted=await gate0.encrypt(b,'synthetic-password');return JSON.stringify((await gate0.decrypt(encrypted,'synthetic-password')).data)===JSON.stringify(b.data)}""")
        assert roundtrip
        assert page.evaluate("""async () => {const e=await gate0.encrypt(gate0.backup(),'synthetic-password');try{await gate0.decrypt(e,'wrong-password');return false}catch{return true}}""")
        print("PASS encrypted backup roundtrip and wrong-password rejection")
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
        context = browser.new_context(service_workers="block")
        context.route("**/app.js?*", lambda route: route.fulfill(body=instrumented, content_type="application/javascript"))
        first = context.new_page()
        first.goto(base)
        first.wait_for_function("window.gate0 !== undefined")
        second = context.new_page()
        second.goto(base)
        second.wait_for_function("window.gate0 !== undefined")
        # Loading a second tab may normalize persisted state; the last-loaded
        # tab is the current writer and the earlier tab must fail closed.
        new_task(second, "Device B synthetic task")
        assert second.evaluate("JSON.parse(localStorage.getItem('alexander_os_v1')).tasks.some(t=>t.title==='Device B synthetic task')")
        new_task(first, "Device A unsaved task")
        first.locator('#aosPersistenceWarning').wait_for(state='visible')
        assert first.evaluate("JSON.parse(localStorage.getItem('alexander_os_v1')).tasks.some(t=>t.title==='Device B synthetic task')")
        assert not first.evaluate("JSON.parse(localStorage.getItem('alexander_os_v1')).tasks.some(t=>t.title==='Device A unsaved task')")
        assert first.evaluate("gate0.backup().data.tasks.some(t=>t.title==='Device A unsaved task')")
        print("PASS stale browser tab retains both disk and unsaved session copies")
        context.close()
        # Actual service-worker offline navigation (without routing/instrumentation).
        context = browser.new_context()
        context.add_init_script("sessionStorage.setItem('alexander_os_sw_reloaded', '1')")
        page = context.new_page()
        page.goto(base + '/synthetic-cache-seed-not-found')
        page.evaluate("""async () => {const c=await caches.open('synthetic-old-release');await c.put('./index.html',new Response('<html><body>STALE_CACHE_SENTINEL</body></html>',{headers:{'content-type':'text/html'}}))}""")
        page.goto(base)
        page.evaluate("navigator.serviceWorker.ready.then(()=>true)")
        page.wait_for_function("navigator.serviceWorker.controller !== null")
        context.set_offline(True)
        page.reload(wait_until="domcontentloaded")
        page.locator('.nav-item[data-screen="tasks"]').click()
        assert len(page.locator('#app').inner_text()) > 50
        assert page.evaluate("typeof window.__AOS_SHEETS_LOCAL_PERSISTED") != "undefined"
        assert "STALE_CACHE_SENTINEL" not in page.locator('body').inner_text()
        assert page.evaluate("caches.has('synthetic-old-release')")
        print("PASS offline boot uses current release while retaining old cache")
        context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
