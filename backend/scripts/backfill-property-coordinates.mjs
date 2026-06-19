/**
 * Backfill latitude/longitude for properties that have none, so they appear on
 * the Maps module. Two passes per property:
 *   1. If coordinates already exist in `metadata`, copy them to the top-level
 *      latitude/longitude columns (no network call).
 *   2. Otherwise geocode the address via Nominatim (OpenStreetMap, free).
 *
 * Nominatim policy: max 1 request/second and a valid User-Agent. This script
 * throttles to ~1.1s/request, so a few thousand addresses can take a while —
 * it is safe to stop (Ctrl-C) and re-run; it only processes properties that are
 * still missing coordinates.
 *
 * Run locally:
 *   node scripts/backfill-property-coordinates.mjs
 * Run against production (on the server, via the backend container which already
 * has DATABASE_URL and network access to postgres):
 *   docker compose -f docker-compose.prod.yml run --rm \
 *     -v "$(pwd)/backend/scripts:/scripts" backend \
 *     node /scripts/backfill-property-coordinates.mjs
 *
 * Optional flags:
 *   --limit=N   process at most N properties this run
 *   --dry       show what would change without writing
 */

import { PrismaClient } from '@prisma/client';

// Load .env files when present (local dev). In the prod container the env is
// already set, so a missing dotenv is fine.
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
} catch {
  /* dotenv not installed / not needed */
}

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(0, parseInt(limitArg.split('=')[1], 10) || 0) : 0;

const BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1100;
const USER_AGENT = 'DG-CRM-geocoder/1.0 (admin@dg-property.co.za)';

let lastRequestAt = 0;
async function throttle() {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function geocodeOnce(q) {
  await throttle();
  const url = `${BASE}/search?format=jsonv2&addressdetails=0&limit=1&countrycodes=za&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
    if (!res.ok) return null;
    const json = await res.json();
    const first = Array.isArray(json) && json.length ? json[0] : null;
    if (!first) return null;
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

// Try the full address, then progressively broader fallbacks so street-level
// addresses the free geocoder can't match still land near the right place.
async function geocode(address) {
  const full = String(address || '').trim();
  if (!full) return null;

  const variants = [full];
  // Drop a leading street number ("154 Constantia St, ..." -> "Constantia St, ...")
  const noNumber = full.replace(/^\s*\d+[a-zA-Z]?\s+/, '').trim();
  if (noNumber && noNumber !== full) variants.push(noNumber);
  // Progressively drop leading segments (street -> suburb -> city -> postcode)
  // so an address whose exact street isn't in OSM still lands near the right place.
  const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = 1; i < parts.length; i += 1) variants.push(parts.slice(i).join(', '));

  const seen = new Set();
  for (const v of variants) {
    if (!v || v.length < 3 || seen.has(v)) continue;
    seen.add(v);
    const hit = await geocodeOnce(v);
    if (hit) return hit;
  }
  return null;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const prisma = new PrismaClient();

const main = async () => {
  const missing = await prisma.property.findMany({
    where: { deletedAt: null, OR: [{ latitude: null }, { longitude: null }] },
    select: { id: true, address: true, metadata: true },
    orderBy: { createdAt: 'desc' },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  console.log(`Properties missing coordinates: ${missing.length}${DRY ? '  (dry run)' : ''}`);
  let copied = 0;
  let geocoded = 0;
  let failed = 0;
  let i = 0;

  for (const p of missing) {
    i += 1;
    const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
    let lat = num(meta.latitude);
    let lng = num(meta.longitude);
    let source = 'metadata';

    if (lat === null || lng === null) {
      // Try the address, the centre name, and name+area — addresses are often
      // just the centre name, so the extra candidates improve the hit rate.
      const area = String(meta.areaName || '').trim();
      const candidates = [
        p.address,
        meta.displayName,
        area && meta.displayName ? `${meta.displayName}, ${area}` : '',
      ]
        .map((s) => String(s || '').trim())
        .filter((s) => s.length > 2);

      for (const c of Array.from(new Set(candidates))) {
        const geo = await geocode(c);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          source = 'geocode';
          break;
        }
      }
    }

    if (lat === null || lng === null) {
      failed += 1;
      console.log(`  [${i}/${missing.length}] ✗ no result — ${String(p.address || '').slice(0, 60)}`);
      continue;
    }

    if (!DRY) {
      await prisma.property.update({ where: { id: p.id }, data: { latitude: lat, longitude: lng } });
    }
    if (source === 'metadata') copied += 1; else geocoded += 1;
    if (i % 25 === 0 || source === 'geocode') {
      console.log(`  [${i}/${missing.length}] ✓ ${source} ${lat.toFixed(5)},${lng.toFixed(5)} — ${String(p.address || '').slice(0, 50)}`);
    }
  }

  console.log('—'.repeat(40));
  console.log(`Done. copied-from-metadata: ${copied} | geocoded: ${geocoded} | failed: ${failed}`);
  if (failed) console.log('Failed ones usually have vague/empty addresses — fix the address and re-run.');
  await prisma.$disconnect();
};

main().catch(async (e) => {
  console.error('Backfill failed:', e?.message || e);
  await prisma.$disconnect();
  process.exit(1);
});
