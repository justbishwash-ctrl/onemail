import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Login page route handled separately from the authenticated shell.
// The worker redirects /auth/* and the SPA handles everything else.
const path = window.location.pathname;

// Render login at root if no session cookie present.
// AuthGuard in App.tsx handles the actual session validation.
if (path === '/' || path === '/login') {
  // Check if this is a fresh unauthenticated visit.
  // We let AuthGuard decide — if /api/me fails, it redirects back to /.
  // Login page is rendered from App.tsx route guard redirect to '/'.
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
