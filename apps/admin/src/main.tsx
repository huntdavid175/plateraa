import './index.css';
import './lib/theme'; // sets light or dark before the first paint
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { queryClient } from './lib/query';
import { router } from './router';
import { Toasts } from './ui/Toast';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

async function start() {
  // Dev only: `?preview` (or `?preview=SUPPORT`) shows every screen with sample data, no login.
  if (import.meta.env.DEV) {
    const { previewWanted, installPreview } = await import('./dev/preview');
    const role = previewWanted();
    if (role) installPreview(role);
  }
  createRoot(root!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
        <Toasts />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start();
