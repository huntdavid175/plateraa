import './index.css';
import './lib/theme'; // sets light or dark before the first paint
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { queryClient } from './lib/query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { router } from './router';
import { Toasts } from './ui/Toast';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
      <Toasts />
    </QueryClientProvider>
  </StrictMode>,
);
