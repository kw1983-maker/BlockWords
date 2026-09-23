// Cloud persistence via Firestore. FIREBASE_CONFIG is defined by the optional
// js/firebase-config.js module (skipped by build.py when the file is missing).

const SCHEMA_VERSION = 1;
const SAVES_COLLECTION = 'saves';
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.14.0';

let db = null;
let auth = null;
let cloudReady = false;
let authUid = null;
let sdkLoading = null;

export function normalizeName(name) {
  const n = (name || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return n.slice(0, 32);
}

export function localSaveKey(name) {
  const n = normalizeName(name);
  return n ? `blockwords.save.${n}` : 'blockwords.save.v1';
}

export function isCloudEnabled() {
  return cloudReady && db !== null;
}

export function getAuthUid() {
  return authUid;
}

function firebaseConfig() {
  if (typeof FIREBASE_CONFIG !== 'undefined'
    && FIREBASE_CONFIG
    && FIREBASE_CONFIG.projectId
    && FIREBASE_CONFIG.projectId !== 'YOUR_PROJECT_ID') {
    return FIREBASE_CONFIG;
  }
  return null;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function ensureFirebaseSdk() {
  if (typeof firebase !== 'undefined') return;
  if (sdkLoading) return sdkLoading;
  sdkLoading = (async () => {
    await loadScript(`${FIREBASE_SDK}/firebase-app-compat.js`);
    await loadScript(`${FIREBASE_SDK}/firebase-auth-compat.js`);
    await loadScript(`${FIREBASE_SDK}/firebase-firestore-compat.js`);
  })();
  return sdkLoading;
}

export async function initSaves() {
  const cfg = firebaseConfig();
  if (!cfg) return false;
  try {
    await ensureFirebaseSdk();
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    auth = firebase.auth();
    db = firebase.firestore();
    const cred = await auth.signInAnonymously();
    authUid = cred.user.uid;
    cloudReady = true;
    return true;
  } catch (e) {
    console.warn('Firebase init failed:', e);
    return false;
  }
}

export async function hasCloudSave(name) {
  if (!isCloudEnabled()) return false;
  const id = normalizeName(name);
  if (!id) return false;
  try {
    const snap = await db.collection(SAVES_COLLECTION).doc(id).get();
    return snap.exists;
  } catch (e) {
    console.warn('Cloud save check failed:', e);
    return false;
  }
}

export async function loadCloudSave(name) {
  if (!isCloudEnabled()) return null;
  const id = normalizeName(name);
  if (!id) return null;
  try {
    const snap = await db.collection(SAVES_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const doc = snap.data();
    return doc && doc.data ? doc.data : null;
  } catch (e) {
    console.warn('Cloud load failed:', e);
    return null;
  }
}

export async function saveCloudSave(name, data, meta = {}) {
  if (!isCloudEnabled()) return false;
  const id = normalizeName(name);
  if (!id || !authUid) return false;
  const displayName = (name || '').trim().slice(0, 32);
  try {
    await db.collection(SAVES_COLLECTION).doc(id).set({
      displayName,
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION,
      uid: authUid,
      classCode: meta.classCode || '',
      data,
    });
    return true;
  } catch (e) {
    console.warn('Cloud save failed:', e);
    return false;
  }
}

export function listLocalSaves() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('blockwords.save.')) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      out.push({
        name: key.replace('blockwords.save.', ''),
        displayName: data.playerName || key.replace('blockwords.save.', ''),
        updatedAt: data.savedAt || null,
        data,
      });
    } catch (e) { /* skip corrupt */ }
  }
  return out;
}

export async function listCloudSaves() {
  if (!isCloudEnabled()) return [];
  try {
    const snap = await db.collection(SAVES_COLLECTION).limit(200).get();
    return snap.docs.map((doc) => {
      const d = doc.data();
      return {
        name: doc.id,
        displayName: d.displayName || doc.id,
        updatedAt: d.updatedAt || null,
        classCode: d.classCode || '',
        data: d.data || {},
      };
    });
  } catch (e) {
    console.warn('Cloud list failed:', e);
    return [];
  }
}

export function saveRowFromData(entry) {
  const d = entry.data || {};
  const learned = Array.isArray(d.learned) ? d.learned : [];
  return {
    name: entry.displayName || entry.name,
    year: d.year || '',
    pack: d.packId || '',
    wordsLearned: learned.length,
    questsCompleted: d.questsCompleted || 0,
    emeralds: d.emeralds || 0,
    classCode: entry.classCode || d.classCode || '',
    updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : '',
  };
}

export function savesToCsv(rows) {
  const headers = ['name', 'year', 'pack', 'wordsLearned', 'questsCompleted', 'emeralds', 'classCode', 'updatedAt'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => {
      const v = String(r[h] ?? '');
      return v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  }
  return lines.join('\n');
}

export async function exportTeacherCsv(classCode = '') {
  const local = listLocalSaves().map(saveRowFromData);
  let cloud = [];
  if (isCloudEnabled()) {
    const all = await listCloudSaves();
    cloud = all
      .filter((e) => !classCode || e.classCode === classCode)
      .map(saveRowFromData);
  }
  const merged = new Map();
  for (const row of [...local, ...cloud]) merged.set(row.name.toLowerCase(), row);
  return savesToCsv([...merged.values()]);
}
