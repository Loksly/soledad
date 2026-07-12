import { render } from 'preact';
import { Capacitor } from '@capacitor/core';
import { App } from './app/App';
import { attach } from './app/store';
import { attachClock, session } from './app/session';
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
  /**
   * ACTUALIZACIÓN AUTOMÁTICA, sin que el usuario tenga que hacer nada.
   *
   * Quien usa esta app puede no saber qué es recargar una página, y desde luego no tiene por qué
   * saberlo. Así que la app se actualiza sola: no hay botón, ni aviso, ni "hay una versión nueva
   * disponible". Simplemente, la próxima vez que la abra con conexión, será la nueva.
   *
   * El problema que esto resuelve: cuando entra un service worker nuevo, la página que ya está
   * abierta SIGUE ejecutando el código viejo, y ese código viejo puede pedir un fichero que la
   * caché nueva acaba de borrar. Para quien sabe recargar es un incordio; para quien no, la app
   * "se ha roto". `controllerchange` avisa de ese relevo y se recarga una vez.
   *
   * El guardia contra el bucle no es paranoia: sin él, `clients.claim()` en la PRIMERA instalación
   * también dispara `controllerchange`, y la app se recargaría en cada visita inicial.
   */
  let reloading = false;

  /**
   * Recargar A MITAD DE PARTIDA la sacaría del tablero y la dejaría en la pantalla de inicio.
   * La partida no se pierde (se autoguarda), pero para alguien que estaba concentrado en su
   * solitario, que el juego "se cierre solo" es exactamente la clase de susto que hace que la
   * gente deje de usar una app y vuelva a la que le pone anuncios.
   *
   * Así que si está jugando, la actualización ESPERA a que la app pase a segundo plano. Ahí la
   * recarga no la ve nadie, y al volver ya está en la versión nueva.
   */
  const reloadWhenSafe = (): void => {
    if (reloading) return;

    if (session.value !== null && document.visibilityState === 'visible') {
      document.addEventListener('visibilitychange', reloadWhenSafe, { once: true });
      return;
    }
    reloading = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Sin controlador previo = primera instalación, no una actualización. No se recarga.
    if (!navigator.serviceWorker.controller) return;
    reloadWhenSafe();
  });

  window.addEventListener('load', () => {
    // La ruta y el ámbito salen de la base de publicación, no de '/'. Registrar '/sw.js' bajo
    // GitHub Pages da 404, y además un service worker sólo puede controlar su propio directorio
    // hacia abajo: con scope '/' el navegador lo rechazaría de plano.
    // Un fallo al registrarlo NO puede impedir jugar: como mucho, se pierde el modo offline.
    void navigator.serviceWorker
      .register(asset('sw.js'), { scope: BASE })
      .then((registration) => {
        // Y se busca versión nueva en cada arranque, sin esperar a que el navegador decida.
        void registration.update().catch(() => undefined);
      })
      .catch(() => undefined);
  });
}
