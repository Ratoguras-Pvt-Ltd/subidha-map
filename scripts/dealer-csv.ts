/**
 * Reading a dealer-list CSV export. Kept apart from scripts/import-phones.ts so the
 * parsing and the name matching can be tested without a database.
 */
import { extractPhone } from "./kml";

/** Punctuation and spacing the two dealer lists disagree on, folded away. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `nameKey` without the trailing place the CSV appends to every name — "Aarti Gas
 * Pasal, Itr" against "Aarti Gas Pasal" here. Exact names resolved 4 of 344 measured;
 * dropping the place lifts it to ~99, which is why it is the key the import uses.
 */
export function placelessNameKey(name: string): string {
  return nameKey(name.split(/[,(]/)[0]);
}

/**
 * One CSV line into fields. Dealer names contain commas and are therefore quoted
 * ("Aakansha Jeneral Store,Birendra Bazar"), which a plain split cannot handle; a
 * doubled quote inside a quoted field is a literal quote.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (line[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      fields.push(field);
      field = "";
    } else field += c;
  }
  fields.push(field);
  return fields.map((f) => f.trim());
}

export type PhoneRow = { name: string; phone: string };

export type PhoneCsv = {
  rows: PhoneRow[];
  /** Rows naming a dealer but leaving Phone empty. */
  noPhone: number;
  /** Rows whose Phone is not a Nepali mobile number, as "name => raw value". */
  unusable: string[];
};

/**
 * Pulls `Dealer Name` and `Phone` out of a dealer-list CSV. Columns are located by
 * header rather than position, so extra columns (Area, Latitude…) and reordering are
 * both fine.
 */
export function readPhoneCsv(text: string): PhoneCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.toLowerCase());
  const nameAt = header.findIndex((h) => h.includes("name"));
  const phoneAt = header.findIndex((h) => h.includes("phone"));
  if (nameAt === -1 || phoneAt === -1) {
    throw new Error(`need a "Dealer Name" and a "Phone" column, found: ${header.join(", ") || "nothing"}`);
  }

  const rows: PhoneRow[] = [];
  const unusable: string[] = [];
  let noPhone = 0;

  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const name = fields[nameAt];
    if (!name) continue;

    const raw = fields[phoneAt] ?? "";
    if (!raw) {
      noPhone++;
      continue;
    }
    // Same validation the KML import uses: ten digits starting 96/97/98, country code
    // and separators tolerated. Anything else is a landline, a note, or a typo.
    const phone = extractPhone(raw);
    if (!phone) {
      unusable.push(`${name} => ${raw}`);
      continue;
    }
    rows.push({ name, phone });
  }

  return { rows, noPhone, unusable };
}
