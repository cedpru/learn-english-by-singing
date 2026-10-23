import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LyricLineDto, SourceLang } from '../common/types';

const MODEL = 'Xenova/opus-mt-en-fr';
const MAX_BATCH = 16;

type Translator = (
  lines: string[],
  options?: { max_new_tokens?: number },
) => Promise<{ translation_text: string }[]>;

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  env: { cacheDir: string; allowLocalModels: boolean };
}

/**
 * OPUS-MT EN→FR runs locally through transformers.js: no API key, and the
 * lyrics never leave the machine. A song is translated once, then cached on disk.
 */
@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly cacheFile: string;
  private readonly modelDir: string;

  private cache: Record<string, string> | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private translatorPromise: Promise<Translator> | null = null;

  constructor(configService: ConfigService) {
    this.cacheFile = path.resolve(
      configService.get<string>('CACHE_DIR') || 'data',
      'translations.json',
    );
    this.modelDir = path.resolve(configService.get<string>('MODEL_DIR') || 'data/models');
  }

  /** Very small heuristic: enough to tell French songs apart from English ones. */
  detectLanguage(text: string): SourceLang {
    const clean = text.toLowerCase().slice(0, 4000);
    const words = clean.match(/[a-zà-ÿ']+/g) ?? [];
    if (!words.length) return SourceLang.OTHER;

    const fr = new Set([
      'le', 'la', 'les', 'des', 'une', 'et', 'je', 'tu', 'nous', 'vous', 'est', 'pas',
      'que', 'qui', 'dans', 'pour', 'avec', 'mon', 'ton', 'ma', 'sur', 'mais', 'plus',
      'comme', 'elle', 'il', 'on', 'ce', 'cette', 'sans', 'tout', 'moi', 'toi', 'quand',
      'jamais', 'rien', 'encore', 'fait', 'être', 'avoir', "j'ai", "c'est", 'ne', 'au',
      'aux', 'du', 'son', 'sa', 'ses', 'leur', 'y', 'en',
    ]);
    const en = new Set([
      'the', 'you', 'and', 'to', 'of', 'i', 'a', 'in', 'that', 'it', 'my', 'we', 'is',
      'me', 'be', 'on', 'your', 'love', 'when', 'dont', "don't", "can't", "i'm", 'im',
      'all', 'know', 'was', 'for', 'with', 'she', 'he', 'they', 'got', 'no', 'so', 'up',
      'out', 'like', 'just', 'but', 'not', 'are', 'this', 'what',
    ]);

    let f = 0;
    let e = 0;
    for (const word of words) {
      if (fr.has(word)) f += 1;
      if (en.has(word)) e += 1;
    }
    if (/[àâçéèêëîïôûùœ]/.test(clean)) f += words.length * 0.05;
    if (f === 0 && e === 0) return SourceLang.OTHER;
    if (f >= e * 1.6) return SourceLang.FR;
    if (e >= f * 1.6) return SourceLang.EN;
    return SourceLang.OTHER;
  }

  /**
   * The local model is English → French only: feeding it Korean or Japanese
   * would output plausible-looking nonsense, so those songs get no translation.
   */
  isLatinScript(text: string): boolean {
    const nonLatin =
      text.match(
        /[\u0400-\u04ff\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/gu,
      )?.length ?? 0;
    if (!nonLatin) return true;
    const latin = text.match(/[A-Za-z\u00c0-\u00ff]/g)?.length ?? 0;
    return latin > nonLatin * 2;
  }

  private key(text: string): string {
    return createHash('sha1').update(`en>fr|${text}`).digest('hex').slice(0, 16);
  }

  private async loadCache(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await readFile(this.cacheFile, 'utf8')) as Record<string, string>;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void (async () => {
        try {
          await mkdir(path.dirname(this.cacheFile), { recursive: true });
          await writeFile(this.cacheFile, JSON.stringify(this.cache ?? {}), 'utf8');
        } catch (error) {
          // The cache is best-effort: failing to write it must not fail a request.
          this.logger.warn(`cache de traduction non enregistré : ${(error as Error).message}`);
        }
      })();
    }, 800);
  }

  private getTranslator(): Promise<Translator> {
    if (!this.translatorPromise) {
      this.translatorPromise = (async () => {
        const { pipeline, env } = (await import('@huggingface/transformers')) as unknown as TransformersModule;
        env.cacheDir = this.modelDir;
        env.allowLocalModels = true;
        const pipe = await pipeline('translation', MODEL, { dtype: 'q8' });
        return pipe as unknown as Translator;
      })().catch((error) => {
        this.translatorPromise = null;
        throw error;
      });
    }
    return this.translatorPromise;
  }

  /**
   * Translates lyric lines EN → FR, returning one string per line. Lines already
   * cached are not sent to the model; a failed batch leaves its lines empty.
   */
  async translateLines(lines: LyricLineDto[]): Promise<string[]> {
    const store = await this.loadCache();
    const out: string[] = new Array(lines.length).fill('');
    const missing: { index: number; text: string }[] = [];

    lines.forEach((line, index) => {
      const cached = store[this.key(line.text)];
      if (cached) out[index] = cached;
      else missing.push({ index, text: line.text });
    });

    if (!missing.length) return out;

    let translate: Translator;
    try {
      translate = await this.getTranslator();
    } catch (error) {
      this.logger.warn(`modèle de traduction indisponible : ${(error as Error).message}`);
      return out;
    }

    for (let i = 0; i < missing.length; i += MAX_BATCH) {
      const batch = missing.slice(i, i + MAX_BATCH);
      try {
        const result = await translate(
          batch.map((item) => item.text),
          { max_new_tokens: 96 },
        );
        batch.forEach((item, j) => {
          const text = (result[j]?.translation_text ?? '').trim();
          if (text) {
            out[item.index] = text;
            store[this.key(item.text)] = text;
          }
        });
      } catch (error) {
        this.logger.warn(`lot de traduction échoué : ${(error as Error).message}`);
      }
    }

    this.persist();
    return out;
  }
}
