#!/usr/bin/env python3
"""Apply focused Alexander OS Sheets persistence hotfix to repository checkout.
Requires the repository's original app.js, brand-sheets.js, index.html, sw.js.
Fails closed on unknown versions; does not edit finance records or user data.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
# On GitHub Actions users place installer script in scripts/ inside root repo.
# When invoked on this staging zip, the real repo files are not present.
TAG = '15.8.1-sync-hotfix'

def one(text, old, new, file):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{file}: expected exactly one occurrence, found {count}: {old[:95]!r}')
    return text.replace(old, new, 1)

def main():
    names = ['app.js','brand-sheets.js','index.html','sw.js']
    sources = {p: (ROOT / p).read_text(encoding='utf-8') for p in names}
    app = sources['app.js']
    app = one(app,
        'try { window.localStorage.setItem(key, value); } catch (error) { memoryStorage.set(key, String(value)); }',
        '''try { window.localStorage.setItem(key, value); return true; } catch (error) {
        memoryStorage.set(key, String(value));
        console.error('[Alexander OS] Не удалось сохранить данные в localStorage:', error);
        return false;
      }''', 'app.js')
    old_save = '    if (options.snapshot !== false) recordSnapshot();\n    safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));'
    new_save = '''    if (options.snapshot !== false) recordSnapshot();
    let persisted = safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!persisted) {
      // Storage quota can be exceeded by deeply nested undo snapshots.
      // Preserve ALL accounts, transactions, obligations, projects and notes.
      // Reduce only old undo-history entries, if needed, to regain durable storage.
      const previousHistory = Array.isArray(state.history) ? state.history : [];
      for (const keep of [6, 3, 1, 0]) {
        if (!previousHistory.length || keep >= previousHistory.length) continue;
        state.history = previousHistory.slice(0, keep);
        persisted = safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (persisted) {
          console.warn('[Alexander OS] Сокращён журнал отмены для восстановления сохранения.');
          window.__AOS_HISTORY_COMPACTED = true;
          break;
        }
      }
      if (!persisted) state.history = previousHistory;
    }
    // Bridge only finance fields from the live state to Sheets. This works even
    // if localStorage rejected a write, and never exports notes or passwords.
    window.__AOS_LIVE_FINANCE_STATE = {
      accounts: state.accounts, transactions: state.transactions,
      accountTransfers: state.accountTransfers, obligations: state.obligations
    };
    window.__AOS_STORAGE_PERSISTED = persisted;
    window.dispatchEvent(new Event('aos-finance-updated'));
    if (!persisted && !window.__AOS_STORAGE_WARNING_SHOWN) {
      window.__AOS_STORAGE_WARNING_SHOWN = true;
      setTimeout(() => alert('Не удалось сохранить изменения на iPhone. Открой Настройки → Экспорт полной копии JSON до закрытия приложения. Google Sheets может принять расходы, но локальное хранение требует исправления.'), 400);
    }'''
    app=one(app,old_save,new_save,'app.js')
    app=one(app,"navigator.serviceWorker.register('./sw.js?v=14.3.0')",
                 "navigator.serviceWorker.register('./sw.js?v=15.8.1-sync-hotfix')",'app.js')
    sheets = sources['brand-sheets.js']
    sheets=one(sheets, "    const source = load(STATE_KEY);",
               "    const source = window.__AOS_LIVE_FINANCE_STATE || load(STATE_KEY);",'brand-sheets.js')
    sheets=one(sheets, "      setStatus('Синхронизировано: '+rows[0].length+' операций, '+rows[1].length+' переводов, '+rows[2].length+' обязательств. '+new Date().toLocaleTimeString('ru-RU'), 'success');",
        """      const remoteOK = 'Синхронизировано: '+rows[0].length+' операций, '+rows[1].length+' переводов, '+rows[2].length+' обязательств. '+new Date().toLocaleTimeString('ru-RU');
      const localOK = window.__AOS_STORAGE_PERSISTED !== false;
      setStatus(localOK ? remoteOK : remoteOK + ' ВНИМАНИЕ: iPhone не сохранил данные локально. Создай полную резервную копию JSON перед закрытием.', localOK ? 'success' : 'error');""",'brand-sheets.js')
    sheets=one(sheets, "    setInterval(queueSync,7000);", 
            "    window.addEventListener('aos-finance-updated', queueSync);\n    setInterval(queueSync,7000);", 'brand-sheets.js')
    index = sources['index.html']
    index=one(index, '<meta name="alexander-os-build" content="15.8.0-brand1" />',
              f'<meta name="alexander-os-build" content="{TAG}" />', 'index.html')
    index=one(index, "window.ALEXANDER_OS_BUILD = '15.8.0';", f"window.ALEXANDER_OS_BUILD = '{TAG}';", 'index.html')
    index=one(index, "key.includes('v15-8')", "key.includes('v15-8-1-sync')",'index.html')
    index=one(index, 'brand-sheets.js?v=15.8.0-brand1', f'brand-sheets.js?v={TAG}', 'index.html')
    index=one(index, 'app.js?v=15.8.0', f'app.js?v={TAG}', 'index.html')
    sw = sources['sw.js']
    sw=one(sw, "const CACHE = 'alexander-os-v15-8-tasks-weekly';", "const CACHE = 'alexander-os-v15-8-1-sync';", 'sw.js')
    sw=one(sw, "'./app.js?v=15.8.0',", f"'./app.js?v={TAG}',\n  './brand-sheets.js?v={TAG}',", 'sw.js')
    sw=one(sw,"clients.openWindow('./?build=15.8.0')", f"clients.openWindow('./?build={TAG}')",'sw.js')
    outputs={'app.js':app,'brand-sheets.js':sheets,'index.html':index,'sw.js':sw}
    for name,content in outputs.items():
        (ROOT/name).write_text(content,encoding='utf-8')
    print('Fixed: ' + ', '.join(outputs))
    print('Preserved: records, accounts, transactions and all unrelated features.')

if __name__=='__main__':
    main()
