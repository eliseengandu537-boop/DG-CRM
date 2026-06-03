// LOCAL-ONLY Master Database import. Reads the two CSVs and pushes records to
// the local backend at http://localhost:5000/api. Will NOT touch production.
// Run with: node backend/scripts/import-master-database-local.mjs <email> <password>
//
// Example:
//   node backend/scripts/import-master-database-local.mjs admin@local.test mypass
//
// Default if no args: tries elisee@dg-property.co.za / admin123 (only useful if
// you have that user seeded locally). Otherwise pass your local admin creds.
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const API = 'http://localhost:5000/api';
const EMAIL = process.argv[2] || 'elisee@dg-property.co.za';
const PASSWORD = process.argv[3] || 'admin123';
const DELAY_MS = 60;

const POTENTIAL_CSV = 'c:/Users/Savhannah/Documents/database-m-potential-bs.csv';
const BUYERS_CSV = 'c:/Users/Savhannah/Documents/database-m-buyers-looking.csv';

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function pick(row, ...keys) {
  for (const k of keys) {
    const v = clean(row[k] || row[`${k} `] || row[k.toUpperCase()]);
    if (v) return v;
  }
  return '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) {
    console.error(`Login failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const body = await res.json();
  const token = body?.data?.tokens?.accessToken || body?.data?.token || body?.token;
  if (!token) {
    console.error('No access token in login response.');
    process.exit(1);
  }
  return token;
}

async function postRecord(token, payload) {
  const res = await fetch(`${API}/custom-records`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    return { ok: false, status: res.status, body: (await res.text()).slice(0, 200) };
  }
  return { ok: true };
}

async function importPotential(token) {
  const raw = readFileSync(POTENTIAL_CSV, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });

  let success = 0;
  let failed = 0;
  const errors = [];
  console.log(`\n── Potential B&S — ${rows.length} rows ─────────`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = pick(row, 'NAME', 'Name');
    const surname = pick(row, 'SURNAME', 'Surname');
    const email = pick(row, 'E-MAIL', 'EMAIL', 'Email');
    const contactNumber = pick(row, 'CONTACT NUMBER', 'Contact Number');
    const altContactNumber = pick(row, 'ALT CONTACT NUMBER', 'Alt Contact Number');

    if (!name && !email) continue;

    const displayName = `${name} ${surname}`.trim() || email || 'Unnamed';

    const payload = {
      entityType: 'master_db_potential',
      name: displayName,
      payload: {
        name,
        surname,
        email,
        contactNumber,
        altContactNumber,
        assetTypes: [],
      },
    };

    const res = await postRecord(token, payload);
    if (res.ok) {
      success++;
    } else {
      failed++;
      errors.push(`${displayName}: ${res.status} ${res.body}`);
    }
    if (i % 20 === 0 && i > 0) console.log(`  …${i}/${rows.length}`);
    await sleep(DELAY_MS);
  }

  console.log(`  → ${success} succeeded, ${failed} failed`);
  if (errors.length) errors.slice(0, 5).forEach((e) => console.log('    ' + e));
  return { total: rows.length, success, failed };
}

async function importBuyers(token) {
  const raw = readFileSync(BUYERS_CSV, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });

  let success = 0;
  let failed = 0;
  const errors = [];
  console.log(`\n── Buyers Looking — ${rows.length} rows ─────────`);

  for (const row of rows) {
    const area = pick(row, 'area');
    const category = pick(row, 'category');
    const zoning = pick(row, 'zoning');
    const size = pick(row, 'size');
    const description = pick(row, 'description', 'desciption');
    const company = pick(row, 'company');
    const price = pick(row, 'price');
    const name = pick(row, 'name');
    const surname = pick(row, 'surname');
    const email = pick(row, 'email');
    const contactNumber = pick(row, 'contact_number', 'contact number');
    const comments = pick(row, 'comments', 'Comments');

    if (!name && !email && !description) continue;

    const displayName = `${name} ${surname}`.trim() || email || company || 'Unnamed';
    const assetTypes = inferAssetTypes(category);

    const payload = {
      entityType: 'master_db_buyer',
      name: displayName,
      payload: {
        name,
        surname,
        email,
        contactNumber,
        company,
        area,
        category,
        zoning,
        size,
        price,
        description,
        comments,
        assetTypes,
      },
    };

    const res = await postRecord(token, payload);
    if (res.ok) {
      success++;
      console.log(`  ✓ ${displayName}`);
    } else {
      failed++;
      errors.push(`${displayName}: ${res.status} ${res.body}`);
      console.log(`  ✗ ${displayName} — ${res.status}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`  → ${success} succeeded, ${failed} failed`);
  if (errors.length) errors.forEach((e) => console.log('    ' + e));
  return { total: rows.length, success, failed };
}

// Map free-text category to the canonical PROPERTY_TYPE_OPTIONS list so the
// asset-type filter actually finds these records.
function inferAssetTypes(category) {
  const c = String(category || '').toLowerCase();
  const out = new Set();
  if (/retail|shopping|mall|centre|center/.test(c)) out.add('Retail');
  if (/resid|apartment|flat|house|hous/.test(c)) out.add('Residential');
  if (/industrial|warehouse|fenc/.test(c)) out.add('Commercial');
  if (/office|commercial|business|bus 1|bus 2/.test(c)) out.add('Commercial');
  if (/mixed/.test(c)) out.add('Mixed-use Building');
  if (/land|vacant|plot/.test(c)) out.add('Land');
  if (/school|education/.test(c)) out.add('Schools & Education');
  if (/petrol|filling|garage|service station/.test(c)) out.add('Petrol Stations');
  if (/hotel|hospitality/.test(c)) out.add('Hospitality');
  if (/medical|hospital|clinic/.test(c)) out.add('Medical');
  if (/church/.test(c)) out.add('Churches');
  if (/sectional/.test(c)) out.add('Sectional Titles');
  return Array.from(out);
}

async function main() {
  console.log(`Logging in to ${API} as ${EMAIL}...`);
  const token = await login();
  console.log('Login successful.');

  const potential = await importPotential(token);
  const buyers = await importBuyers(token);

  console.log('\n────────────────────────────────────');
  console.log(`Potential B&S: ${potential.success} / ${potential.total}`);
  console.log(`Buyers Looking: ${buyers.success} / ${buyers.total}`);
  console.log(`TOTAL: ${potential.success + buyers.success} imported`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
