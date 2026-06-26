import { bootstrap } from './bootstrap';

bootstrap().catch((err: Error) => {
  console.error(err);
  const ui = document.getElementById('ui');
  if (ui) ui.textContent = `Error: ${err.message}`;
});
