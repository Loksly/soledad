import { render } from 'preact';
import { Capacitor } from '@capacitor/core';
import { App } from './app/App';
import { attach } from './app/store';
import { attachClock } from './app/session';
import { IndexedDbRepository } from './services/storage/repository';
import { systemClock } from './services/clock';
import { asset, BASE } from './services/base';
import './ui/theme/styles.css';

/**
 * El ÚNICO sitio donde se instancian implementaciones concretas (docs/02 ADR-4). Todo lo demás
 * habla con interfaces, y por eso los tests pueden inyectar un repositorio en memoria y un
 * reloj fijo sin tocar una línea de la app.
 */
const repository = new IndexedDbRepository();
attach(repository, systemClock);
attachClock(systemClock);

const root = document.getElementById('app');
if (root) render(<App />, root);

/**
 * Service Worker: es lo que convierte esto en una app instalable desde el navegador y que
 * funciona sin conexión.
 *
 * Sólo en producción y sólo en la web: dentro del APK de Capacitor los ficheros ya están en el
 * dispositivo y un SW encima no aportaría nada más que una capa de caché que puede quedarse
 * desincronizada.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    // La ruta y el ámbito salen de la base de publicación, no de '/'. Registrar '/sw.js' bajo
    // GitHub Pages da 404, y además un service worker sólo puede controlar su propio directorio
    // hacia abajo: con scope '/' el navegador lo rechazaría de plano.
    // Un fallo al registrarlo NO puede impedir jugar: como mucho, se pierde el modo offline.
    void navigator.serviceWorker.register(asset('sw.js'), { scope: BASE }).catch(() => undefined);
  });
}
