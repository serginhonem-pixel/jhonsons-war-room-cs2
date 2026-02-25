import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Cs2App from './cs2app.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Cs2App />
  </React.StrictMode>,
)
