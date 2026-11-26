import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Theme } from '@astryxdesign/core/theme'
import App from './App'
// Tailwind 的 preflight 会重置 button/input 背景，必须先加载，
// 再加载 Astryx 的组件样式与主题，保证按钮、输入框按主题正确着色。
import './styles/index.css'
import '@astryxdesign/core/reset.css'
import '@astryxdesign/core/astryx.css'
import { themes, defaultThemeSlug } from './astryx-themes'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Theme>
  </React.StrictMode>,
)
