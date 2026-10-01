import type { Bindings } from '../types'

function escapeHtml(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch))
}

export async function sendCustomerReplyEmail(
  env: Bindings,
  params: { to: string; subject: string; content: string; replyTo?: string },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const apiKey = String(env.RESEND_API_KEY || '').trim()
  if (!apiKey) return { ok: false, error: '未配置 RESEND_API_KEY' }

  const settingsRow = await env.DB.prepare("SELECT key, value FROM settings WHERE key IN ('email_from','email_reply_to','site_name')").all()
  const settings: Record<string, string> = {}
  for (const row of (settingsRow.results as any[])) settings[String(row.key)] = String(row.value || '')
  const from = String(settings.email_from || '').trim()
  if (!from) return { ok: false, error: '未配置邮箱发件地址 email_from' }
  const replyTo = String(params.replyTo || settings.email_reply_to || '').trim()
  const html = '<div style="font-family:Arial,sans-serif;line-height:1.7;white-space:pre-wrap">' +
    '<p>' + escapeHtml(params.content).replace(/\n/g, '<br>') + '</p>' +
    '</div>'

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
      }),
    })
    const body = await response.text()
    if (!response.ok) return { ok: false, error: '邮件服务返回 HTTP ' + response.status + '：' + body.slice(0, 300) }
    let id = ''
    try { id = String(JSON.parse(body)?.id || '') } catch {}
    return { ok: true, id }
  } catch (error: any) {
    return { ok: false, error: String(error?.message || error || '邮件发送失败') }
  }
}
