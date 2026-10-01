export function folderBaseName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function truncateName(name: string, maxLength: number | null): string {
  if (!maxLength || name.length <= maxLength) return name;
  return name.slice(0, maxLength) + '…';
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const numberFormat = new Intl.NumberFormat();

export function formatDate(ms: number): string {
  return dateFormat.format(new Date(ms));
}

export function formatCount(n: number): string {
  return numberFormat.format(n);
}
