import { format, formatDistanceToNow, isToday, isYesterday, isThisYear } from 'date-fns';

export function formatEmailDate(dateStr: string | number): string {
  const date = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
}

export function formatFullDate(dateStr: string | number): string {
  const date = typeof dateStr === 'number' ? new Date(dateStr) : new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return format(date, 'MMM d, yyyy h:mm a');
}

export function formatRelativeDate(unix: number): string {
  return formatDistanceToNow(new Date(unix * 1000), { addSuffix: true });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extractEmailAddress(str: string): string {
  const match = str.match(/<([^>]+)>/);
  return match ? match[1] : str.trim();
}

export function extractDisplayName(str: string): string {
  const match = str.match(/^([^<]+)</);
  return match ? match[1].trim().replace(/^"|"$/g, '') : extractEmailAddress(str);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
