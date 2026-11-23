/**
 * Generate 8 soft-3D nut mascot images (square 1024x1024) for profile avatars.
 * Raw squares go to scripts/avatar-raw/; a later PIL step crops them to circles.
 * Re-running skips files that already exist (retry-friendly).
 */
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const OUT_DIR = '/home/z/my-project/scripts/avatar-raw';

const CHARACTERS = [
  {
    file: 'almond',
    desc: 'A cute teardrop-shaped brown almond nut character standing, with textured warm brown skin',
  },
  {
    file: 'walnut',
    desc: 'A cute walnut nut character with a wrinkled light-brown brain-like ridged shell',
  },
  {
    file: 'pistachio',
    desc: 'A cute pistachio character, a smiling bright green kernel peeking out of a half-open beige shell',
  },
  {
    file: 'hazelnut',
    desc: 'A cute round glossy hazelnut character with smooth brown skin and a small light-brown cap on top',
  },
  {
    file: 'cashew',
    desc: 'A cute curved cream-colored cashew nut character with smooth soft skin',
  },
  {
    file: 'peanut',
    desc: 'A cute light-tan peanut character with textured ridged skin, oval figure-eight shape',
  },
  {
    file: 'raisin',
    desc: 'A cute plump raisin character made of one dark purple-brown wrinkled dried grape, glossy smooth wrinkled dried-fruit skin, absolutely no fur, no hair, not an animal, no ears, no nose, no snout',
  },
  {
    file: 'mulberry',
    desc: 'A cute pale cream-white elongated dried white mulberry berry character with bumpy berry texture',
  },
];

const STYLE =
  'Soft 3D render in Pixar animation style, adorable mascot character, big round glossy expressive eyes, gentle happy smile, tiny arms and legs, soft diffused studio lighting, smooth premium finish, plain soft warm cream background, character perfectly centered filling about 60 percent of the frame with clear empty margin on all four edges, clean simple composition, high quality, detailed, no text, no letters, no watermark';

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();
  const results = [];

  for (const c of CHARACTERS) {
    const out = path.join(OUT_DIR, `${c.file}.png`);

    // skip already-generated files so re-runs only retry failures
    if (fs.existsSync(out) && fs.statSync(out).size > 10000) {
      console.log(`skip existing: ${out}`);
      results.push({ file: c.file, ok: true, skipped: true });
      continue;
    }

    let ok = false;
    let lastErr = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const prompt = `${c.desc}, ${STYLE}`;
        const resp = await zai.images.generations.create({ prompt, size: '1024x1024' });
        const b64 = resp?.data?.[0]?.base64;
        if (!b64) throw new Error('empty base64 in response');
        const buf = Buffer.from(b64, 'base64');
        if (buf.length < 10000) throw new Error(`image suspiciously small: ${buf.length} bytes`);
        fs.writeFileSync(out, buf);
        console.log(`OK ${c.file}: ${buf.length} bytes (attempt ${attempt})`);
        ok = true;
        break;
      } catch (e) {
        lastErr = e?.message || String(e);
        console.error(`attempt ${attempt} failed for ${c.file}: ${lastErr}`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }

    results.push({ file: c.file, ok, error: ok ? null : lastErr });
  }

  console.log('SUMMARY:', JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`FAILED files: ${failed.map((f) => f.file).join(', ')}`);
    process.exit(1);
  }
  console.log('ALL DONE');
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
