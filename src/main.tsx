import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { PaperProvider } from './components/Paper';
import App from './App';
// 霞鹜文楷 GB Screen (OFL): split by character ranges, so a page loads only the pieces it uses
import 'lxgw-wenkai-screen-webfont/lxgwwenkaigbscreen.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PaperProvider>
          <App />
        </PaperProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
