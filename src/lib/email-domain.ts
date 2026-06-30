const DEFAULT_ALLOWED_EMAIL_DOMAINS = ['vt.edu'];
const FALSE_VALUES = new Set(['false', '0', 'off', 'no']);

function normalizeEnvValue(value: string): string {
  const trimmedValue = value.trim();

  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    return trimmedValue.slice(1, -1).trim();
  }

  return trimmedValue;
}

export function isEmailDomainRestrictionEnabled(): boolean {
  const rawValue =
    process.env.EMAIL_DOMAIN_RESTRICTION_ENABLED ??
    process.env.ENFORCE_EMAIL_DOMAIN_RESTRICTION;

  if (rawValue === undefined) {
    return true;
  }

  return !FALSE_VALUES.has(normalizeEnvValue(rawValue).toLowerCase());
}

export function getAllowedEmailDomains(): string[] {
  const configuredDomains = process.env.ALLOWED_EMAIL_DOMAINS
    ?.split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  return configuredDomains && configuredDomains.length > 0
    ? configuredDomains
    : DEFAULT_ALLOWED_EMAIL_DOMAINS;
}

export function isEmailDomainAllowed(email: string): boolean {
  if (!isEmailDomainRestrictionEnabled()) {
    return true;
  }

  const domain = email.split('@')[1]?.toLowerCase();
  return Boolean(domain && getAllowedEmailDomains().includes(domain));
}

export function getAllowedEmailDomainsLabel(): string {
  return getAllowedEmailDomains().join(', ');
}
