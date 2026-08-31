// Cloud persistence via Firestore. FIREBASE_CONFIG is defined by the optional
// js/firebase-config.js module (skipped by build.py when the file is missing).

const SCHEMA_VERSION = 1;
const SAVES_COLLECTION = 'saves';

let db = null;
let cloudReady = false;

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

export function initSaves() {
  let cfg = null;
  if (typeof FIREBASE_CONFIG !== 'undefined'
    && FIREBASE_CONFIG
    && FIREBASE_CONFIG.projectId
    && FIREBASE_CONFIG.projectId !== 'YOUR_PROJECT_ID') {
    cfg = FIREBASE_CONFIG;
  }
  if (!cfg || typeof firebase === 'undefined') return false;
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    db = firebase.firestore();
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

export async function saveCloudSave(name, data) {
  if (!isCloudEnabled()) return false;
  const id = normalizeName(name);
  if (!id) return false;
  const displayName = (name || '').trim().slice(0, 32);
  try {
    await db.collection(SAVES_COLLECTION).doc(id).set({
      displayName,
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION,
      data,
    });
    return true;
  } catch (e) {
    console.warn('Cloud save failed:', e);
    return false;
  }
}
