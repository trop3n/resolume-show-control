import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import { installMockBackend } from './platform/mockBackend'

// Outside Electron (npm run web), stand up a mock backend so the UI runs in a browser.
if (installMockBackend()) document.documentElement.dataset.preview = '1'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
