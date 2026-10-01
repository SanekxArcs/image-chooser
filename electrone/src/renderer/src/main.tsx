import React from 'react'
import ReactDOM from 'react-dom/client'

import { platform } from './api'
import './theme'
import App from './App'
import './index.css'

document.documentElement.classList.add(`platform-${platform}`)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
