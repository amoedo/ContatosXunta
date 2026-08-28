export function withBase(path: string, base = import.meta.env.BASE_URL) {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}