import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import type { SpotSubmissionDraft, SpotSubmissionMediaAsset } from '../types';

const draftStoragePrefix = 'cebspot:spot-submission-draft:v1';
const draftFolderName = 'spot-submission-drafts';

function storageKey(userId: string) {
  return `${draftStoragePrefix}:${userId}`;
}

function safeUserId(userId: string) {
  return userId.replace(/[^a-zA-Z0-9-]/g, '');
}

function userDraftDirectory(userId: string) {
  if (!FileSystem.documentDirectory) {
    throw new Error('Draft storage is unavailable on this device.');
  }
  return `${FileSystem.documentDirectory}${draftFolderName}/${safeUserId(userId)}/`;
}

function extensionForAsset(asset: SpotSubmissionMediaAsset) {
  const fileNameExtension = asset.fileName?.split('.').pop();
  const uriExtension = asset.uri.split('?')[0]?.split('.').pop();
  const mimeExtension = asset.mimeType?.split('/').pop();
  const raw = fileNameExtension || uriExtension || mimeExtension || (asset.type === 'video' ? 'mp4' : 'jpg');
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'quicktime') return 'mov';
  if (normalized === 'jpeg') return 'jpg';
  return normalized || (asset.type === 'video' ? 'mp4' : 'jpg');
}

async function readDraft(userId: string) {
  const stored = await AsyncStorage.getItem(storageKey(userId));
  if (!stored) return null;
  try {
    return JSON.parse(stored) as SpotSubmissionDraft;
  } catch {
    await AsyncStorage.removeItem(storageKey(userId));
    return null;
  }
}

async function deleteManagedAsset(asset: SpotSubmissionMediaAsset) {
  if (!asset.isDraftFile || !asset.uri.startsWith('file:')) return;
  await FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => undefined);
}

async function persistMedia(userId: string, media: SpotSubmissionMediaAsset[]) {
  const directory = userDraftDirectory(userId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const persisted: SpotSubmissionMediaAsset[] = [];
  for (const asset of media) {
    if (asset.isDraftFile && asset.uri.startsWith(directory)) {
      persisted.push(asset);
      continue;
    }

    const targetUri = `${directory}${asset.id}.${extensionForAsset(asset)}`;
    await FileSystem.copyAsync({ from: asset.uri, to: targetUri });
    persisted.push({ ...asset, uri: targetUri, isDraftFile: true });
  }
  return persisted;
}

export const spotSubmissionDraftService = {
  async get(userId: string) {
    const draft = await readDraft(userId);
    if (!draft) return null;

    const availableMedia: SpotSubmissionMediaAsset[] = [];
    for (const asset of draft.media ?? []) {
      if (!asset.isDraftFile) {
        availableMedia.push(asset);
        continue;
      }
      const info = await FileSystem.getInfoAsync(asset.uri);
      if (info.exists) availableMedia.push(asset);
    }

    return { ...draft, media: availableMedia };
  },

  async save(userId: string, draft: SpotSubmissionDraft) {
    const previousDraft = await readDraft(userId);
    const media = await persistMedia(userId, draft.media);
    const savedDraft = { ...draft, media, updatedAt: new Date().toISOString() };

    const retainedUris = new Set(media.map((asset) => asset.uri));
    await Promise.all(
      (previousDraft?.media ?? [])
        .filter((asset) => !retainedUris.has(asset.uri))
        .map(deleteManagedAsset)
    );

    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(savedDraft));
    return savedDraft;
  },

  async clear(userId: string) {
    await AsyncStorage.removeItem(storageKey(userId));
    if (!FileSystem.documentDirectory) return;
    await FileSystem.deleteAsync(userDraftDirectory(userId), { idempotent: true }).catch(() => undefined);
  },

  async clearIfMatches(userId: string, draftId: string) {
    const draft = await readDraft(userId);
    if (draft?.id === draftId) await this.clear(userId);
  },

  async deleteMediaAsset(asset: SpotSubmissionMediaAsset) {
    await deleteManagedAsset(asset);
  },
};
