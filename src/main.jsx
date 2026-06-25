import { StrictMode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import { AppFeedbackProvider } from './components/AppFeedback'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppFeedbackProvider>
        <App />
      </AppFeedbackProvider>
    </BrowserRouter>
  </StrictMode>,
)