const TRUNC_LIMIT = 200;

const truncateString = (s: string, limit = TRUNC_LIMIT) => {
  if (s.length <= limit) return s;
  return s.slice(0, limit) + `… (truncated, ${s.length} chars)`;
};

const truncateDeep = (value: any): any => {
  // strings
  if (typeof value === "string") return truncateString(value);

  // numbers/booleans/null/undefined
  if (value == null || typeof value !== "object") return value;

  // arrays
  if (Array.isArray(value)) return value.map(truncateDeep);

  // objects
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    const key = truncateString(String(k));
    out[key] = truncateDeep(v);
  }
  return out;
};

export default truncateDeep
