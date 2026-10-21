import './style.css';
import { App } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('#app introuvable');
try {
  const app = new App(root);
  if (import.meta.env.DEV) (window as unknown as { duchesse: App }).duchesse = app;
} catch (e) {
  // Pas de WebGL (accélération graphique désactivée, navigateur ancien) : un message plutôt qu'une page vide.
  console.error(e);
  root.innerHTML =
    '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:18px/1.5 Georgia,serif;color:#5b1f2a;background:#fbf3e8">' +
    '<div><b>Les 1001 Services de La Duchesse ne peuvent pas démarrer.</b><br>Le jeu a besoin de WebGL : mettez votre navigateur à jour ' +
    'ou activez l’accélération matérielle.</div></div>';
  throw e;
}
