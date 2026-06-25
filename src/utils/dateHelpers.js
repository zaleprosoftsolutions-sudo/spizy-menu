export function formatDate(value) {
  if (!value) return 'Not set'

  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function getTrialText(value) {
  if (!value) return 'No trial date'

  const today = new Date()
  const trialEnd = new Date(value)
  const diff = Math.ceil((trialEnd.getTime() - today.getTime()) / 86400000)

  if (diff > 1) return `${diff} days left`
  if (diff === 1) return '1 day left'
  if (diff === 0) return 'Ends today'

  return `${Math.abs(diff)} days ago`
}