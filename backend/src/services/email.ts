import nodemailer from 'nodemailer';
import { IIncident, IAnalysis } from '../models/Incident';

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const SEVERITY_COLOR: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

export async function sendIncidentAlert(incident: IIncident, analysis: IAnalysis): Promise<void> {
  const to = process.env.ALERT_EMAIL;
  if (!to || !process.env.SMTP_HOST) return;

  const color = SEVERITY_COLOR[incident.severity] || '#94a3b8';
  const appUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f0f17;color:#e2e8f0;padding:24px;border-radius:12px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <span style="background:${color};color:#000;font-weight:700;font-size:11px;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.05em;">${incident.severity}</span>
        <span style="color:#64748b;font-size:13px;font-family:monospace;">${incident.incidentId}</span>
      </div>

      <h2 style="margin:0 0 6px;font-size:18px;color:#f1f5f9;">${incident.title}</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#64748b;">
        Service: <strong style="color:#94a3b8;">${incident.service}</strong> &nbsp;·&nbsp;
        Category: <strong style="color:#94a3b8;">${incident.category}</strong>
      </p>

      <div style="background:#1e1e2e;border:1px solid #1e293b;border-radius:8px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#475569;">Root Cause</p>
        <p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.6;">${analysis.rootCause}</p>
      </div>

      <div style="background:#1e1e2e;border:1px solid #1e293b;border-radius:8px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#475569;">Suggested Fix</p>
        <p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.6;white-space:pre-line;">${analysis.suggestedFix}</p>
      </div>

      <a href="${appUrl}/incidents" style="display:inline-block;background:#6366f1;color:#fff;font-size:13px;font-weight:600;padding:10px 20px;border-radius:8px;text-decoration:none;">
        View in DevSight →
      </a>

      <p style="margin:20px 0 0;font-size:11px;color:#334155;">
        Confidence: ${(analysis.confidence * 100).toFixed(0)}% &nbsp;·&nbsp; ${new Date().toUTCString()}
      </p>
    </div>
  `;

  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[${incident.severity.toUpperCase()}] ${incident.title} — DevSight`,
    html,
  });
}
