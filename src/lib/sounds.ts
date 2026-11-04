// Sons da loja (public/sons). Tocam com o app aberto; com o app fechado quem avisa é a
// notificação push (som padrão do celular). Se o arquivo falhar, toca o bipe.
import { BASE_PATH } from './appUrl';

export type SoundName = 'novo-pedido' | 'entregador-acionado';

const cache = new Map<SoundName, HTMLAudioElement>();
let audioCtx: AudioContext | null = null;

/** Dois bipes curtos (Web Audio: funciona mesmo sem arquivo). */
export function playBeep() {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t = audioCtx.currentTime;
    [0, 0.28].forEach((offset) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, t + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.22);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.24);
    });
  } catch {
    // navegador sem Web Audio: o aviso visual continua
  }
}

export function playSound(name: SoundName) {
  try {
    let audio = cache.get(name);
    if (!audio) {
      audio = new Audio(`${BASE_PATH}/sons/${name}.wav`);
      audio.preload = 'auto';
      cache.set(name, audio);
    }
    audio.currentTime = 0;
    audio.play().catch(playBeep);
  } catch {
    playBeep();
  }
}

/**
 * O navegador só libera áudio depois de um toque na página. No primeiro toque/clique,
 * "aquece" os sons (toca mudo) para que os avisos seguintes saiam sem bloqueio.
 */
export function unlockSoundsOnFirstTouch() {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    (['novo-pedido', 'entregador-acionado'] as SoundName[]).forEach((name) => {
      const audio = cache.get(name) ?? new Audio(`${BASE_PATH}/sons/${name}.wav`);
      cache.set(name, audio);
      audio.muted = true;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {})
        .finally(() => {
          audio.muted = false;
        });
    });
    try {
      audioCtx ??= new AudioContext();
      void audioCtx.resume();
    } catch {
      // sem Web Audio
    }
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
