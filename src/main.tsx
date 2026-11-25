import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

async function prepareApp(): Promise<void> {
  if (typeof window !== 'undefined') {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledFrame: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js',
      },
      ...({ onUnhandledRequest: 'bypass' } as Record<string, unknown>),
    });
  }
}

prepareApp().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
