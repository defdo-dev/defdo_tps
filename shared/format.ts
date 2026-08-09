export function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined
  const formatted = value >= 100 ? Math.round(value).toString() : value >= 10 ? value.toFixed(1) : value.toFixed(2)
  return `${formatted} t/s`
}

export function formatTtft(value: number) {
  if (!Number.isFinite(value) || value < 0) return undefined
  return `${value.toFixed(1)}s`
}
