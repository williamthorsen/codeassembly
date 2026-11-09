/**
 * Turns a prompt's name into a file-safe base name: lowercase ASCII letters and digits, every other run replaced by `-`,
 * at most 60 characters, and `prompt` when nothing is left.
 */
export function sanitizeName(name: string): string {
  const baseName = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .slice(0, 60)
    .replaceAll(/^-+|-+$/g, '');
  return baseName === '' ? 'prompt' : baseName;
}
