import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

/**
 * Sonido y háptica. Toda la app funciona sin ninguno de los dos (docs/09 §5): son un adorno,
 * no un canal de información. Nada se comunica SÓLO con un sonido o una vibración.
 *
 * El sonido se sintetiza con WebAudio en vez de empaquetar ficheros: pesan, y un "clic" de
 * carta no merece un asset en un APK que prometimos mantener por debajo de 15 MB.
 */

export interface Feedback {
  tap(): void;
  drop(): void;
  foundation(): void;
  win(): void;
  invalid(): void;
}

let audioContext: AudioContext | null = null;
let soundEnabled = false;
let hapticsEnabled = true;

export const configureFeedback = (options: { sound: boolean; haptics: boolean }): void => {
  soundEnabled = options.sound;
  hapticsEnabled = options.haptics;
};

const context = (): AudioContext | null => {
  if (!soundEnabled) return null;
  if (typeof AudioContext === 'undefined') return null;
  audioContext ??= new AudioContext();
  return audioContext;
};

const beep = (frequency: number, duration: number, gain = 0.04): void => {
  const ctx = context();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const volume = ctx.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = 'triangle';
  volume.gain.setValueAtTime(gain, ctx.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  oscillator.connect(volume).connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
};

const vibrate = (style: ImpactStyle): void => {
  if (!hapticsEnabled) return;
  if (!Capacitor.isNativePlatform()) return;
  // Un fallo de háptica jamás puede tumbar una partida: se traga y se sigue jugando.
  void Haptics.impact({ style }).catch(() => undefined);
};

export const feedback: Feedback = {
  tap: () => beep(440, 0.03, 0.02),
  drop: () => {
    beep(320, 0.05);
    vibrate(ImpactStyle.Light);
  },
  foundation: () => {
    beep(660, 0.08);
    vibrate(ImpactStyle.Medium);
  },
  win: () => {
    [523, 659, 784, 1047].forEach((note, index) => {
      setTimeout(() => beep(note, 0.18, 0.05), index * 110);
    });
    vibrate(ImpactStyle.Heavy);
  },
  invalid: () => beep(180, 0.06, 0.02),
};
