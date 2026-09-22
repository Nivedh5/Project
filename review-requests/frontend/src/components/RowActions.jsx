import { App, Button } from 'antd'

export default function RowActions({ request }) {
  const { message } = App.useApp()

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(request.customer_email)
      message.success('Email copied')
    } catch {
      // Clipboard access is blocked outside a secure context.
      message.warning('Could not copy — your browser blocked clipboard access')
    }
  }

  return (
    <Button type="link" size="small" onClick={copyEmail}>
      Copy email
    </Button>
  )
}
