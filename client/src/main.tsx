import '@fontsource-variable/rubik'
import '@fontsource/suez-one'
import '@fontsource/karantina/400.css'
import '@fontsource/karantina/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
