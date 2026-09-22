import React from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp, ConfigProvider } from 'antd'
import { ThemeProvider } from 'styled-components'
import App from './App.jsx'
import { GlobalStyle } from './GlobalStyle.js'
import { antdTheme, theme } from './theme.js'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={antdTheme}>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        {/* antd's App supplies the message context used by the row actions. */}
        <AntApp>
          <App />
        </AntApp>
      </ThemeProvider>
    </ConfigProvider>
  </React.StrictMode>,
)
