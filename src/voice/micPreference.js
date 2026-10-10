import { voiceStorage } from './realtimePreferences.js';

// Fork (gev.beric.ca): a microphone picker for the voice dock. Without it the
// app takes Chrome's per-site default, which can be a different input than the
// one the user talks into, and voice then hears nothing.
export const VOICE_MIC_STORAGE_KEY = 'godsEyeView.voiceMic.deviceId';

const pickers = new Map();

/** Read the saved input deviceId; '' means the browser default. Never throws. */
export function readStoredMic(storage) {
  try {
    return voiceStorage(storage)?.getItem(VOICE_MIC_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/** Save the input deviceId ('' clears it). Never throws. */
export function writeStoredMic(deviceId, storage) {
  const value = String(deviceId || '');
  try {
    const store = voiceStorage(storage);
    if (value) store?.setItem(VOICE_MIC_STORAGE_KEY, value);
    else store?.removeItem(VOICE_MIC_STORAGE_KEY);
  } catch {
    /* best effort */
  }
  return value;
}

/**
 * Add the saved microphone to getUserMedia audio constraints. The saved id is
 * used only while that device is present, so an unplugged mic falls back to
 * the browser default instead of failing with OverconstrainedError.
 * @param {MediaTrackConstraints} audio
 * @param {{storage?: Storage, devices?: MediaDeviceInfo[]}} [options]
 * @returns {MediaTrackConstraints}
 */
export function withPreferredMic(audio, { storage, devices = [] } = {}) {
  const saved = readStoredMic(storage);
  const present = devices.some(
    (device) => device.kind === 'audioinput' && device.deviceId === saved,
  );
  return saved && present ? { ...audio, deviceId: { exact: saved } } : audio;
}

/** Lists audio inputs; empty when the browser cannot enumerate. */
export async function listMics(
  mediaDevices = globalThis.navigator?.mediaDevices,
) {
  try {
    const devices = (await mediaDevices?.enumerateDevices?.()) || [];
    return devices.filter((device) => device.kind === 'audioinput');
  } catch {
    return [];
  }
}

/** getUserMedia audio constraints with the saved microphone applied. */
export async function preferredMicAudio(audio, options = {}) {
  return withPreferredMic(audio, {
    ...options,
    devices: options.devices || (await listMics()),
  });
}

/**
 * Short dock label for a device: the first word of its name, without the
 * "Default - " prefix and USB ids, upper-cased ("DJI", "RAZER", "MACBOOK").
 * @param {string} label
 * @returns {string}
 */
export function shortMicLabel(label) {
  const name = String(label || '')
    .replace(/^default\s*-\s*/i, '')
    .replace(/\([0-9a-f]{4}:[0-9a-f]{4}\)/i, '')
    .trim();
  return (name.split(/\s+/)[0] || 'MIC').toUpperCase().slice(0, 8);
}

/**
 * Puts a microphone select in the voice dock heading, before the tier toggle.
 * Device names appear once the site has microphone permission, so the list
 * refreshes on device changes and after each voice start.
 * @param {HTMLElement} root The #gev-voice-control element.
 * @returns {{refresh: () => Promise<void>} | null}
 */
export function installMicPicker(root) {
  const cluster = root?.querySelector?.('.gev-voice-cost');
  if (!cluster) return null;
  let select = cluster.querySelector('#gev-voice-mic');
  if (!select) {
    select = document.createElement('select');
    select.id = 'gev-voice-mic';
    // Borrows the tier toggle's look so no stylesheet change is needed.
    select.className = 'gev-voice-tier-btn';
    select.setAttribute('aria-label', 'Voice microphone');
    Object.assign(select.style, {
      maxWidth: '2.6rem',
      appearance: 'none',
      textOverflow: 'ellipsis',
      overflow: 'hidden',
    });
    cluster.insertBefore(select, cluster.firstChild);
  }

  // Full names while the list is open; the selected short name once closed.
  const relabel = (full) => {
    for (const option of select.options) {
      option.textContent =
        full || option.value !== select.value
          ? option.dataset.full
          : option.dataset.short;
    }
    const current = select.options[select.selectedIndex];
    select.title = `Microphone: ${current?.dataset.full || 'Browser default'} (applies next session)`;
  };

  const refresh = async () => {
    const mics = await listMics();
    const saved = readStoredMic();
    const options = [{ value: '', full: 'Browser default', short: 'MIC' }];
    for (const mic of mics) {
      if (!mic.deviceId || mic.deviceId === 'default') continue;
      options.push({
        value: mic.deviceId,
        full: mic.label || 'Microphone',
        short: shortMicLabel(mic.label),
      });
    }
    select.replaceChildren(
      ...options.map((option) => {
        const element = document.createElement('option');
        element.value = option.value;
        element.dataset.full = option.full;
        element.dataset.short = option.short;
        return element;
      }),
    );
    select.value = options.some((option) => option.value === saved)
      ? saved
      : '';
    relabel(document.activeElement === select);
  };

  if (!select.dataset.bound) {
    select.dataset.bound = 'true';
    select.addEventListener('focus', () => relabel(true));
    select.addEventListener('blur', () => relabel(false));
    select.addEventListener('change', () => {
      writeStoredMic(select.value);
      relabel(false);
    });
    navigator.mediaDevices?.addEventListener?.('devicechange', () => refresh());
  }
  pickers.set(root, refresh);
  refresh();
  return { refresh };
}

/**
 * Refreshes every installed picker. Called after getUserMedia succeeds, since
 * that is when the browser first reveals device names.
 */
export function refreshMicPickers() {
  for (const [root, refresh] of pickers) {
    if (root.isConnected) refresh();
    else pickers.delete(root);
  }
}
