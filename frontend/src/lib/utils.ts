import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function timeAgo(date: string | Date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function severityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'text-red-400 bg-red-400/10 border-red-400/20'
    case 'high': return 'text-orange-400 bg-orange-400/10 border-orange-400/20'
    case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
    case 'low': return 'text-green-400 bg-green-400/10 border-green-400/20'
    default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  }
}

export function statusColor(status: string) {
  switch (status) {
    case 'open': return 'text-red-400 bg-red-400/10 border-red-400/20'
    case 'investigating': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
    case 'resolved': return 'text-green-400 bg-green-400/10 border-green-400/20'
    default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20'
  }
}

export function confidenceColor(score: number) {
  if (score >= 0.8) return 'text-green-400'
  if (score >= 0.5) return 'text-yellow-400'
  return 'text-red-400'
}
