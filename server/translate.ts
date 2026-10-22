import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LyricLine } from './types.js';

const CACHE_FILE = path.resolve('data/translations.json');
const MODEL_DIR = path.resolve('data/models');
const MODEL = 'Xenova/opus-mt-en-fr';

type Cache = Record<string, string>;
let cache: Cache | null = null;

async function loadCache(): Promise<Cache> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CACHE_FILE, 'utf8')) as Cache;
  } catch {
    cache = {};
  }
  return cache;
}

let saveTimer: NodeJS.Timeout | null = null;
async function persist(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await mkdir(path.dirname(CACHE_FILE), { recursive: true });
      await writeFile(CACHE_FILE, JSON.stringify(cache ?? {}), 'utf8');
    } catch {
      /* cache is best-effort */
    }
  }, 800);
}

const key = (text: string) => createHash('sha1').update(`en>fr|${text}`).digest('hex').slice(0, 16);

type Translator = (lines: string[], opts?: Record<string, unknown>) => Promise<{ translation_text: string }[]>;
let translatorPromise: Promise<Translator> | null = null;

async function getTranslator(): Promise<Translator> {
  if (!translatorPromise) {
    translatorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = MODEL_DIR;
      env.allowLocalModels = true;
      const pipe = await pipeline('translation', MODEL, { dtype: 'q8' });
      return pipe as unknown as Translator;
    })().catch((err) => {
      translatorPromise = null;
      throw err;
    });
  }
  return translatorPromise;
}

/** Very small heuristic: enough to tell French songs apart from English ones. */
export function detectLanguage(text: string): 'fr' | 'en' | 'other' {
  const clean = text.toLowerCase().slice(0, 4000);
  const words = clean.match(/[a-zà-ÿ']+/g) ?? [];
  if (!words.length) return 'other';
  const fr = new Set(['le', 'la', 'les', 'des', 'une', 'et', 'je', 'tu', 'nous', 'vous', 'est', 'pas', 'que', 'qui', 'dans', 'pour', 'avec', 'mon', 'ton', 'ma', 'sur', 'mais', 'plus', 'comme', 'elle', 'il', 'on', 'ce', 'cette', 'sans', 'tout', 'moi', 'toi', 'quand', 'jamais', 'rien', 'encore', 'fait', 'être', 'avoir', 'j\'ai', 'c\'est', 'ne', 'au', 'aux', 'du', 'son', 'sa', 'ses', 'leur', 'y', 'en']);
  const en = new Set(['the', 'you', 'and', 'to', 'of', 'i', 'a', 'in', 'that', 'it', 'my', 'we', 'is', 'me', 'be', 'on', 'your', 'love', 'when', 'dont', "don't", "can't", "i'm", 'im', 'all', 'know', 'was', 'for', 'with', 'she', 'he', 'they', 'got', 'got', 'no', 'so', 'up', 'out', 'like', 'just', 'but', 'not', 'are', 'this', 'what']);
  let f = 0;
  let e = 0;
  for (const w of words) {
    if (fr.has(w)) f += 1;
    if (en.has(w)) e += 1;
  }
  if (/[àâçéèêëîïôûùœ]/.test(clean)) f += words.length * 0.05;
  if (f === 0 && e === 0) return 'other';
  if (f >= e * 1.6) return 'fr';
  if (e >= f * 1.6) return 'en';
  return 'other';
}

/**
 * OPUS-MT here is English → French only: feeding it Korean or Japanese would
 * output plausible-looking nonsense, so those songs get no translation at all.
 */
export function isLatinScript(text: string): boolean {
  const nonLatin =
    text.match(/[\u0400-\u04ff\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/gu)
      ?.length ?? 0;
  if (!nonLatin) return true;
  const latin = text.match(/[A-Za-z\u00c0-\u00ff]/g)?.length ?? 0;
  return latin > nonLatin * 2;
}

const MAX_BATCH = 16;

/**
 * Translates lyric lines EN → FR. Results are cached on disk so a song is only
 * translated once, and the local OPUS-MT model never leaves the machine.
 */
export async function translateLines(lines: LyricLine[]): Promise<string[]> {
  const store = await loadCache();
  const texts = lines.map((l) => l.text);
  const out: string[] = new Array(texts.length).fill('');
  const missing: { index: number; text: string }[] = [];

  texts.forEach((text, index) => {
    const cached = store[key(text)];
    if (cached) out[index] = cached;
    else missing.push({ index, text });
  });

  if (!missing.length) return out;

  const translate = await getTranslator();
  for (let i = 0; i < missing.length; i += MAX_BATCH) {
    const batch = missing.slice(i, i + MAX_BATCH);
    try {
      const result = await translate(
        batch.map((b) => b.text),
        { max_new_tokens: 96 },
      );
      batch.forEach((item, j) => {
        const text = (result[j]?.translation_text ?? '').trim();
        if (text) {
          out[item.index] = text;
          store[key(item.text)] = text;
        }
      });
    } catch (err) {
      console.warn('[translate] batch failed:', (err as Error).message);
    }
  }
  await persist();
  return out;
}

export async function preloadTranslator(): Promise<boolean> {
  try {
    await getTranslator();
    return true;
  } catch (err) {
    console.warn('[translate] model unavailable:', (err as Error).message);
    return false;
  }
}
