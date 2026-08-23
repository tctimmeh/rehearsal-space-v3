import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './ui/theme.css'
import './ui/primitives/primitives.css'
import './ui/shell/shell.css'
import './ui/views/views.css'
import './ui/tools/tools.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
