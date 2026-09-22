// One source of tokens for both styling layers: `theme` feeds the
// styled-components ThemeProvider, `antdTheme` feeds antd's ConfigProvider, so
// the two never drift apart.
export const theme = {
  color: {
    blue: '#0065b1',
    blueLight: '#00a4eb',
    bluePale: '#e8f1fb',
    blueInk: '#b8d4f0',
    bg: '#f3f6fa',
    surface: '#fff',
    line: '#d5d9e0',
    ink: '#212121',
    muted: '#888',
    green: '#1e7a45',
    amber: '#96650a',
    star: '#f0a01e',
    red: '#e53935',
    redPale: '#fdecea',
    redLine: '#f5c6c2',
  },
  font: {
    body: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  radius: {
    md: '4px',
  },
}

export const antdTheme = {
  token: {
    colorPrimary: theme.color.blue,
    colorLink: theme.color.blue,
    colorBorder: theme.color.line,
    colorBorderSecondary: theme.color.line,
    colorText: theme.color.ink,
    colorTextDescription: theme.color.muted,
    colorSuccess: theme.color.green,
    colorWarning: theme.color.amber,
    colorError: theme.color.red,
    borderRadius: 4,
    fontFamily: theme.font.body,
    fontSize: 13,
  },
  components: {
    Table: {
      headerBg: '#fafbfd',
      headerColor: theme.color.muted,
      rowHoverBg: '#fafcfe',
      cellPaddingBlock: 11,
    },
    Statistic: {
      contentFontSize: 28,
    },
    Rate: {
      starColor: theme.color.star,
      starSize: 13,
    },
  },
}
