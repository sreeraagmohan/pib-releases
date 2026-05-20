// Shared email helpers. Uses Gmail SMTP via nodemailer.

const nodemailer = require('nodemailer');

let _transporter;
function transporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return _transporter;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEmail({ to, subject, html }) {
  await transporter().sendMail({
    from: `PIB Alerts <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}

// Tricolor strip used in both templates (inline table — most reliable in email clients)
const TRICOLOR = `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;">
    <tr>
      <td width="33.33%" height="4" style="background:#FF9933;font-size:0;line-height:0;">&nbsp;</td>
      <td width="33.33%" height="4" style="background:#f8fafc;font-size:0;line-height:0;">&nbsp;</td>
      <td width="33.34%" height="4" style="background:#138808;font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>`;

function breakingAlertHtml({ title, headline, url, unsubscribeUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;border-radius:12px;overflow:hidden;border:1px solid #2d3448;">

    ${TRICOLOR}

    <div style="background:#0f1117;padding:24px 28px;">
      <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">☸ PIB Alerts</p>
      <p style="margin:0 0 12px;color:#FF9933;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;">⚡ Breaking &nbsp;·&nbsp; PIB Alert</p>
      <h1 style="margin:0;color:#f8fafc;font-size:20px;line-height:1.45;font-weight:700;">${esc(title)}</h1>
    </div>

    <div style="background:#ffffff;padding:24px 28px;">
      <p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.75;">${esc(headline)}</p>
      <a href="${url}" style="display:inline-block;background:#FF9933;color:#1a0f00;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">Read full release →</a>
    </div>

    <div style="padding:14px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
        Press Information Bureau of India &nbsp;·&nbsp;
        <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe from breaking alerts</a>
      </p>
    </div>

  </div>
</body></html>`;
}

function digestHtml({ dateLabel, bullets, topArticles, unsubscribeUrl }) {
  const bulletRows = bullets
    .filter(b => b.trim())
    .map(b => b.replace(/^[•\-*]\s*/, '').trim())
    .map(b => `
    <tr>
      <td style="padding:6px 0;vertical-align:top;width:18px;color:#FF9933;font-size:16px;font-weight:700;">•</td>
      <td style="padding:6px 0 6px 10px;color:#1e293b;font-size:15px;line-height:1.7;">${esc(b)}</td>
    </tr>`)
    .join('');

  const articleLinks = topArticles.slice(0, 6).map(a => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
        <a href="${a.url}" style="color:#0f1117;font-size:13px;text-decoration:none;font-weight:500;">${esc(a.title)}</a>
        <span style="display:inline-block;margin-left:8px;background:#fff7ed;color:#c2410c;font-size:11px;padding:1px 7px;border-radius:4px;vertical-align:middle;">${esc((a.category || 'general').replace(/_/g, ' '))}</span>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;border-radius:12px;overflow:hidden;border:1px solid #2d3448;">

    ${TRICOLOR}

    <div style="background:#0f1117;padding:24px 28px;">
      <p style="margin:0 0 4px;font-size:13px;color:#94a3b8;">☸ PIB Alerts</p>
      <p style="margin:0 0 8px;color:#FF9933;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;">Evening Brief</p>
      <h1 style="margin:0;color:#f8fafc;font-size:22px;font-weight:700;">${esc(dateLabel)}</h1>
    </div>

    <div style="background:#ffffff;padding:24px 28px 8px;">
      <table style="width:100%;border-collapse:collapse;">${bulletRows}</table>
    </div>

    ${topArticles.length ? `
    <div style="background:#ffffff;padding:8px 28px 24px;">
      <p style="margin:0 0 10px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Source Releases</p>
      <table style="width:100%;border-collapse:collapse;">${articleLinks}</table>
    </div>` : ''}

    <div style="padding:14px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
        Press Information Bureau of India &nbsp;·&nbsp;
        <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe from digest</a>
      </p>
    </div>

  </div>
</body></html>`;
}

module.exports = { sendEmail, breakingAlertHtml, digestHtml };
