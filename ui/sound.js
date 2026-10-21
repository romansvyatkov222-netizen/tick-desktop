// Сигнал о завершении: играет WAV-файл (Kenney Interface Sounds, CC0),
// повторяется каждые SOUND_REPEAT_MS и отключается через SOUND_AUTO_STOP_MS.

import { CONFIG } from './config.js';

const audio = new Audio(CONFIG.sound.file);
audio.volume = CONFIG.sound.volume;

let repeatTimer = null;
let stopTimer = null;

/** Один прогон звука с самого начала. */
function playChunk() {
  try {
    audio.currentTime = 0;
  } catch {
    // файл ещё не готов к перемотке — играем с места, где остановились
  }
  audio.play().catch(() => {
    // автоплей запрещён политикой браузера — молча ждём следующего повтора
  });
}

export function startAlarm() {
  stopAlarm();
  playChunk();
  repeatTimer = setInterval(playChunk, CONFIG.soundRepeatMs);
  stopTimer = setTimeout(stopAlarm, CONFIG.soundAutoStopMs);
}

export function stopAlarm() {
  clearInterval(repeatTimer);
  clearTimeout(stopTimer);
  repeatTimer = null;
  stopTimer = null;
  audio.pause();
}
