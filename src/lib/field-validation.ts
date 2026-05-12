export type FieldIssue = {
  field: string;
  message: string;
  severity: "error" | "warning";
};

const PHONE_ALLOWED = /^\+?[0-9\s().-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const STREET_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.' -]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|terrace|ter|circle|cir)\b/i;
const ZIP_RE = /\b\d{5}(?:-\d{4})?\b/;
const TIME_RE = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:AM|PM|a\.m\.|p\.m\.)?\b/i;

export function isPlausiblePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!PHONE_ALLOWED.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return true;
  return digits.length === 10;
}

export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || EMAIL_RE.test(trimmed);
}

export function isPlausibleAddress(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return STREET_RE.test(trimmed) && ZIP_RE.test(trimmed);
}

export function isPlausibleTime(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || TIME_RE.test(trimmed);
}

export function isPlausibleUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateStructuredFields(input: {
  contact: {
    phone: string;
    email: string;
    address: string;
    phones?: Array<{ value: string }>;
    addresses?: Array<{ value: string }>;
  };
  policies: { check_in: string; check_out: string };
  images: string[];
}): FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (!isPlausiblePhone(input.contact.phone)) {
    issues.push({
      field: "contact.phone",
      severity: "error",
      message: "Use a 10-digit phone number, optionally with +1, spaces, dashes, or parentheses.",
    });
  }
  input.contact.phones?.forEach((entry, index) => {
    if (!isPlausiblePhone(entry.value)) {
      issues.push({
        field: `contact.phones.${index}`,
        severity: "error",
        message: `Additional phone ${index + 1} must use a valid 10-digit phone format.`,
      });
    }
  });
  if (!isPlausibleEmail(input.contact.email)) {
    issues.push({
      field: "contact.email",
      severity: "error",
      message: "Use a standard email address like frontdesk@example.com.",
    });
  }
  if (!isPlausibleAddress(input.contact.address)) {
    issues.push({
      field: "contact.address",
      severity: "error",
      message: "Default address check expects a street address and ZIP code.",
    });
  }
  input.contact.addresses?.forEach((entry, index) => {
    if (!isPlausibleAddress(entry.value)) {
      issues.push({
        field: `contact.addresses.${index}`,
        severity: "error",
        message: `Additional address ${index + 1} must include a street address and ZIP code.`,
      });
    }
  });
  if (!isPlausibleTime(input.policies.check_in)) {
    issues.push({
      field: "policies.check_in",
      severity: "warning",
      message: "Use a recognizable time like 3:00 PM.",
    });
  }
  if (!isPlausibleTime(input.policies.check_out)) {
    issues.push({
      field: "policies.check_out",
      severity: "warning",
      message: "Use a recognizable time like 11:00 AM.",
    });
  }

  input.images.forEach((url, index) => {
    if (!isPlausibleUrl(url)) {
      issues.push({
        field: `images.${index}`,
        severity: "error",
        message: `Image ${index + 1} must be an http(s) URL.`,
      });
    }
  });

  return issues;
}
