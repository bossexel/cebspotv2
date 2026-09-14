import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const env = { ...process.env };
for (const file of ['.env.local', '.env.test.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i);
    if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const projectUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const publicKey = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const email = env.TEST_OWNER_EMAIL || env.TEST_USER_EMAIL;
const password = env.TEST_OWNER_PASSWORD || env.TEST_USER_PASSWORD;
const targetSpotId = '66666666-6666-4666-8666-666666666666';
const bucket = 'spot-images';
const inputFiles = process.argv.slice(2);
const checkAccessOnly = inputFiles.length === 1 && inputFiles[0] === '--check-access';

if (!projectUrl || !publicKey || !email || !password) {
  console.error('BLOCKED: Supabase and test-user credentials are not configured.');
  process.exit(2);
}

if (!checkAccessOnly && inputFiles.length !== 3) {
  console.error('Usage: node scripts/replace-test-club-images.mjs [--check-access | <first-image> <second-image> <third-main-image>]');
  process.exit(2);
}

const resolvedFiles = checkAccessOnly ? [] : inputFiles.map((file) => path.resolve(file));
const missingFiles = resolvedFiles.filter((file) => !fs.existsSync(file) || !fs.statSync(file).isFile());
if (missingFiles.length) {
  console.error(`BLOCKED: image files are missing: ${missingFiles.join(', ')}`);
  process.exit(2);
}

function contentTypeFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  throw new Error(`Unsupported image format: ${extension || '(none)'}`);
}

const client = createClient(projectUrl, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) }) },
});

const uploadedPaths = [];
let updateComplete = false;

try {
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const userId = signedIn.data.user?.id;
  if (!userId) throw new Error('The test account did not establish an authenticated session.');

  const current = await client
    .from('spots')
    .select('id,name,images,owner_id')
    .eq('id', targetSpotId)
    .single();
  if (current.error) throw current.error;
  if (current.data.name !== 'Test Cebspot Club') {
    throw new Error(`Safety check failed: target row is named ${current.data.name}.`);
  }

  const delegatedAccess = current.data.owner_id === userId
    ? { data: [], error: null }
    : await client
      .from('owner_spot_access')
      .select('id')
      .eq('spot_id', targetSpotId)
      .eq('owner_id', userId)
      .limit(1);
  if (delegatedAccess.error) throw delegatedAccess.error;

  const canManageSpot = current.data.owner_id === userId || delegatedAccess.data.length > 0;
  if (checkAccessOnly) {
    console.log(JSON.stringify({
      authenticated: true,
      targetSpot: current.data.name,
      ownsSpot: current.data.owner_id === userId,
      hasDelegatedAccess: delegatedAccess.data.length > 0,
      canManageSpot,
    }, null, 2));
    if (!canManageSpot) process.exitCode = 1;
    updateComplete = true;
  } else {
    if (!canManageSpot) {
      throw new Error('The configured test account does not have permission to manage Test Cebspot Club.');
    }

    // The app treats images[0] as the hero/profile image.
    const orderedFiles = [resolvedFiles[2], resolvedFiles[0], resolvedFiles[1]];
    const uploadStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const publicUrls = [];

    for (let index = 0; index < orderedFiles.length; index += 1) {
      const file = orderedFiles[index];
      const extension = path.extname(file).toLowerCase() || '.jpg';
      const objectPath = `${userId}/test-cebspot-club/${uploadStamp}-${index + 1}${extension}`;
      const uploaded = await client.storage.from(bucket).upload(objectPath, fs.readFileSync(file), {
        contentType: contentTypeFor(file),
        cacheControl: '3600',
        upsert: false,
      });
      if (uploaded.error) throw uploaded.error;
      uploadedPaths.push(objectPath);
      publicUrls.push(client.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl);
    }

    const updated = await client
      .from('spots')
      .update({ images: publicUrls, updated_at: new Date().toISOString() })
      .eq('id', targetSpotId)
      .select('id,name,images')
      .single();
    if (updated.error) throw updated.error;
    if (JSON.stringify(updated.data.images) !== JSON.stringify(publicUrls)) {
      throw new Error('The saved image order did not match the requested order.');
    }

    updateComplete = true;
    console.log(JSON.stringify({
      updated: true,
      spot: updated.data.name,
      spotId: updated.data.id,
      mainImage: updated.data.images[0],
      galleryImages: updated.data.images.slice(1),
    }, null, 2));
  }
} catch (error) {
  console.error(`Image replacement failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (!updateComplete && uploadedPaths.length) {
    const cleanup = await client.storage.from(bucket).remove(uploadedPaths);
    if (cleanup.error) console.error(`Upload cleanup failed: ${cleanup.error.message}`);
  }
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
