export function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function collectTopTags(items: Array<{ aiTags: string[] }>, limit = 7): Array<[string, number]> {
  const counts = new Map<string, number>();
  items.forEach((item) => item.aiTags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

