import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_MIC_STORAGE_KEY,
  readStoredMic,
  shortMicLabel,
  withPreferredMic,
  writeStoredMic,
} from './micPreference.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  };
}

const base = { echoCancellation: true, channelCount: 1 };
const devices = [
  { kind: 'audioinput', deviceId: 'default', label: 'Default - DJI Mic' },
  {
    kind: 'audioinput',
    deviceId: 'dji',
    label: 'DJI Mic Mini-21EDCF (Bluetooth)',
  },
  { kind: 'audiooutput', deviceId: 'speaker', label: 'Speakers' },
];

test('no saved mic leaves the constraints unchanged', () => {
  assert.deepEqual(
    withPreferredMic(base, { storage: memoryStorage(), devices }),
    base,
  );
});

test('a saved mic that is present becomes an exact deviceId', () => {
  const storage = memoryStorage();
  writeStoredMic('dji', storage);
  assert.deepEqual(withPreferredMic(base, { storage, devices }), {
    ...base,
    deviceId: { exact: 'dji' },
  });
});

test('a saved mic that is unplugged falls back to the browser default', () => {
  const storage = memoryStorage();
  writeStoredMic('gone', storage);
  assert.deepEqual(withPreferredMic(base, { storage, devices }), base);
});

test('an output device id never counts as a microphone', () => {
  const storage = memoryStorage();
  writeStoredMic('speaker', storage);
  assert.deepEqual(withPreferredMic(base, { storage, devices }), base);
});

test('writing an empty id clears the saved mic', () => {
  const storage = memoryStorage();
  writeStoredMic('dji', storage);
  assert.equal(storage.map.get(VOICE_MIC_STORAGE_KEY), 'dji');
  writeStoredMic('', storage);
  assert.equal(readStoredMic(storage), '');
  assert.equal(storage.map.has(VOICE_MIC_STORAGE_KEY), false);
});

test('storage that throws reads as the browser default', () => {
  const storage = {
    getItem() {
      throw new Error('blocked');
    },
  };
  assert.equal(readStoredMic(storage), '');
});

test('short labels drop the default prefix and USB ids', () => {
  assert.equal(
    shortMicLabel('Default - DJI Mic Mini-21EDCF (Bluetooth)'),
    'DJI',
  );
  assert.equal(
    shortMicLabel('Razer Audio Controller - Chat (1532:0520)'),
    'RAZER',
  );
  assert.equal(shortMicLabel('MacBook Pro Microphone (Built-in)'), 'MACBOOK');
  assert.equal(shortMicLabel(''), 'MIC');
});
