const DEVICE_STORAGE_KEY = "xerotv_device_id";
const SESSION_STORAGE_KEY = "xerotv_session_id";
const SESSION_METADATA_KEY = "xerotv_session_meta";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = `dev_${generateUUID()}`;
      localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return "volatile_device";
  }
}

export function touchSession(): void {
  try {
    const metaStr = sessionStorage.getItem(SESSION_METADATA_KEY);
    if (metaStr) {
      const meta = JSON.parse(metaStr) as { lastActiveAt: number };
      meta.lastActiveAt = Date.now();
      sessionStorage.setItem(SESSION_METADATA_KEY, JSON.stringify(meta));
    }
  } catch {
    // ignore
  }
}

export function getSessionId(): string {
  try {
    let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = `sess_${generateUUID()}`;
      sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      const meta = {
        sessionId,
        deviceId: getDeviceId(),
        startedAt: Date.now(),
        lastActiveAt: Date.now(),
      };
      sessionStorage.setItem(SESSION_METADATA_KEY, JSON.stringify(meta));
    } else {
      touchSession();
    }
    return sessionId;
  } catch {
    return "volatile_session";
  }
}
