import { Q } from './quantity.js';
import { SAVE_VERSION } from './progression-config.js';
import { check, safeTree } from './save-primitives.js';
import { validateSession } from './save-validation.js';
import { mapSessionQuantities } from './save-quantities.js';
import { migrateRecord } from './save-migrations.js';
import { toSaveRecord, fromSaveRecord } from './save-record.js';
export { validateSession } from './save-validation.js';
export { mapSessionQuantities } from './save-quantities.js';

// Storage keys stay stable across format migrations.
export const SAVE_KEY = 'before-the-stars.incremental.v1';
export const BACKUP_KEY = `${SAVE_KEY}.backup`;
export const DEBUG_SAVE_KEY = 'before-the-stars.debug.v1';
export const MAX_SAVE_BYTES = 2_000_000;

export function serializeSession(session) {
  validateSession(session);
  const record = toSaveRecord(session);
  mapSessionQuantities(record, Q.encode);
  const text = JSON.stringify(record, (key, value) => key === 'maxRange' && value === Infinity ? 'unbounded' : value);
  check(text.length <= MAX_SAVE_BYTES, '文件大小');
  return text;
}
export function parseSession(text) {
  check(typeof text === 'string' && text.length <= MAX_SAVE_BYTES, '文件大小');
  let record = JSON.parse(text, (key, value) => key === 'maxRange' && value === 'unbounded' ? Infinity : value);
  safeTree(record);
  check(Number.isInteger(record?.version) && record.version >= 1 && record.version <= SAVE_VERSION, '不支持的存档版本');
  if (record.version >= 7) mapSessionQuantities(record, Q.decode);
  record = migrateRecord(record);
  const session = fromSaveRecord(record);
  return validateSession(session);
}

// Both permanent rewards and the settlement marker are committed in ONE record.
// A corrupt/unknown record blocks automatic writes until explicit recovery/import/reset.
export function createSaveStore(getStorage = () => globalThis.localStorage, { debug = false } = {}) {
  const saveKey = debug ? DEBUG_SAVE_KEY : SAVE_KEY, backupKey = `${saveKey}.backup`;
  let blocked = false, observed = null;
  function checkMode(session) {
    check((session.debug === true) === debug, '正式存档与调试存档不能互相导入');
    return session;
  }
  const parse = raw => checkMode(parseSession(raw));
  const valid = raw => { try { return raw ? parse(raw) : null; } catch { return null; } };
  const errorResult = error => ({ ok: false, error: error.message || '本地存储不可用，请导出存档。' });
  function load() {
    try {
      const storage = getStorage();
      observed = storage.getItem(saveKey);
      const backupRaw = storage.getItem(backupKey), backup = valid(backupRaw);
      if (observed === null && backupRaw === null) return { session: null, ok: true };
      try { return { session: parse(observed), ok: true, migrated: JSON.parse(observed).version !== SAVE_VERSION }; }
      catch (error) { blocked = true; return { ...errorResult(error), session: null, backupAvailable: Boolean(backup), blocked: true }; }
    } catch (error) { return { ...errorResult(error), session: null }; }
  }
  function write(session, replace = false) {
    try {
      if (blocked && !replace) throw new Error('原存档已受保护：请恢复备份、导入有效存档或明确清空后再保存。');
      const raw = serializeSession(checkMode(session)), storage = getStorage();
      const previous = storage.getItem(saveKey);
      if (!replace && previous !== observed) {
        blocked = true;
        throw new Error('另一页面已更新存档。请刷新读取最新进度；当前进度可先导出。');
      }
      if (valid(previous)) storage.setItem(backupKey, previous);
      storage.setItem(saveKey, raw);
      observed = raw; blocked = false;
      return { ok: true };
    } catch (error) { return errorResult(error); }
  }
  return {
    load, save: session => write(session), replace: session => write(session, true),
    recover() {
      try {
        const session = parse(getStorage().getItem(backupKey));
        const result = write(session, true);
        return { ...result, session: result.ok ? session : null };
      } catch (error) { return errorResult(error); }
    },
    clear(session) {
      try {
        const raw = serializeSession(checkMode(session)), storage = getStorage();
        // Do not report a failed reset after having already replaced the main record.
        storage.removeItem(backupKey);
        storage.setItem(saveKey, raw);
        observed = raw; blocked = false;
        return { ok: true };
      } catch (error) { return errorResult(error); }
    },
  };
}
