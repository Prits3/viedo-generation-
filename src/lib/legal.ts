// Operator details for the imprint and the privacy notice. They come from environment variables of the
// deployment (Netlify: Project configuration -> Environment variables), so no personal data is in git.
//   LEGAL_NAME     full name of the person or company responsible
//   LEGAL_ADDRESS  postal address, lines separated by "|"
//   LEGAL_EMAIL    contact email
export interface Operator {
  name: string;
  address: string[];
  email: string;
}

export function operator(): Operator | null {
  const name = process.env.LEGAL_NAME?.trim();
  const address = process.env.LEGAL_ADDRESS?.split("|").map((s) => s.trim()).filter(Boolean) ?? [];
  const email = process.env.LEGAL_EMAIL?.trim();
  return name && address.length && email ? { name, address, email } : null;
}
