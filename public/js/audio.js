let activeAudio = null;
let activeBtn = null;
let activeFill = null;

export function stopActiveAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
  if (activeBtn) {
    activeBtn.textContent = '▶';
    activeBtn = null;
  }
  if (activeFill) {
    activeFill.style.width = '0%';
    activeFill = null;
  }
}

function escapeAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderVoicePlayerHtml(url, durationSec = 4, lightMode = false, label = 'Note vocale') {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!/^(https?:\/\/|\/(?!\/)|data:audio\/)/i.test(trimmed)) return '';
  const safeDur = Math.max(0, Math.floor(Number(durationSec) || 4));
  const mins = Math.floor(safeDur / 60);
  const secs = String(safeDur % 60).padStart(2, '0');
  return `
    <div class="voice-play-bar ${lightMode ? 'light-mode' : ''}" data-voice-url="${escapeAttr(trimmed)}">
      <button type="button" class="voice-toggle-btn" aria-label="Écouter la note vocale">▶</button>
      <div class="voice-progress-track">
        <div class="voice-progress-fill"></div>
      </div>
      <span class="voice-meta-txt">${escapeAttr(label)} • ${mins}:${secs}</span>
    </div>
  `;
}

export function bindVoicePlayers(root = document) {
  root.querySelectorAll('.voice-play-bar').forEach((bar) => {
    const btn = bar.querySelector('.voice-toggle-btn');
    const fill = bar.querySelector('.voice-progress-fill');
    const url = bar.dataset.voiceUrl;
    if (!btn || !url || btn.dataset.bound === '1') return;

    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      if (activeAudio && activeBtn === btn) {
        stopActiveAudio();
        return;
      }

      stopActiveAudio();
      const audio = new Audio(url);
      activeAudio = audio;
      activeBtn = btn;
      activeFill = fill;
      btn.textContent = '❚❚';

      audio.addEventListener('timeupdate', () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          fill.style.width = `${Math.min(100, (audio.currentTime / audio.duration) * 100)}%`;
        }
      });

      audio.addEventListener('ended', () => {
        stopActiveAudio();
      });

      audio.play().catch(() => {
        stopActiveAudio();
      });
    });
  });
}

export async function recordMicrophoneClip(maxMs = 8000) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('Enregistrement micro non disponible dans ce navigateur.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  const startedAt = Date.now();

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();

  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              audioBase64: reader.result,
              mimeType: blob.type || 'audio/webm',
              durationSec: Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
            });
          };
          reader.readAsDataURL(blob);
        };
        recorder.stop();
      }),
    autoStopMs: maxMs,
  };
}

export function generateDemoVoiceBase64() {
  const sampleRate = 22050;
  const freqs = [261.63, 329.63, 392.0, 523.25];
  const noteDur = 0.55;
  const totalSamples = Math.floor(sampleRate * noteDur * freqs.length);
  const dataSize = totalSamples * 2;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < totalSamples; i++) {
    const idx = Math.min(freqs.length - 1, Math.floor(i / (sampleRate * noteDur)));
    const t = (i % Math.floor(sampleRate * noteDur)) / sampleRate;
    const env = Math.exp(-t * 4.5) * Math.min(1, t * 40);
    const val = Math.sin(2 * Math.PI * freqs[idx] * t) * env * 0.32;
    view.setInt16(44 + i * 2, Math.round(val * 32767), true);
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return {
    audioBase64: `data:audio/wav;base64,${btoa(binary)}`,
    mimeType: 'audio/wav',
    durationSec: 2,
  };
}
