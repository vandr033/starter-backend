function normalizeStringEnv(value?: string | null): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function getWasenderPersonalAccessToken(): string | null {
  return (
    normalizeStringEnv(process.env.WASENDER_PERSONAL_ACCESS_TOKEN) ||
    normalizeStringEnv(process.env.WASENDER_PAT)
  );
}
