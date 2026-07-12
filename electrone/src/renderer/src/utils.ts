export function folderBaseName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function truncateName(name: string, maxLength: number | null): string {
  if (!maxLength || name.length <= maxLength) return name;
  return name.slice(0, maxLength) + '…';
}
