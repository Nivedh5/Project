import { createGlobalStyle } from 'styled-components'

export const GlobalStyle = createGlobalStyle`
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: ${({ theme }) => theme.font.body};
    background: ${({ theme }) => theme.color.bg};
    color: ${({ theme }) => theme.color.ink};
    min-height: 100vh;
  }
`
