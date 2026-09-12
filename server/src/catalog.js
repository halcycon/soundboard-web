import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'teal', 'pink'];

/**
 * @typedef {{ id: string, text: string, file: string, color: string, category: string, shortcut?: string }} Sound
 */

export class Catalog {
  /** @param {string} dataDir */
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.soundsDir = path.join(dataDir, 'sounds');
    this.catalogPath = path.join(dataDir, 'catalog.json');
    /** @type {Sound[]} */
    this.sounds = [];
  }

  async init() {
    await mkdir(this.soundsDir, { recursive: true });
    if (existsSync(this.catalogPath)) {
      const raw = await readFile(this.catalogPath, 'utf8');
      this.sounds = JSON.parse(raw);
    } else {
      this.sounds = [];
      await this.save();
    }
  }

  async save() {
    await writeFile(this.catalogPath, JSON.stringify(this.sounds, null, 2));
  }

  list() {
    return this.sounds;
  }

  /** @param {string} id */
  get(id) {
    return this.sounds.find((s) => s.id === id) ?? null;
  }

  /** @param {string} id */
  filePath(id) {
    const sound = this.get(id);
    if (!sound) return null;
    return path.join(this.soundsDir, sound.file);
  }

  /**
   * @param {{ text: string, category?: string, color?: string, shortcut?: string, originalName: string, buffer: Buffer }} input
   */
  async add(input) {
    const ext = path.extname(input.originalName).toLowerCase() || '.mp3';
    const id = nanoid(10);
    const file = `${id}${ext}`;
    await writeFile(path.join(this.soundsDir, file), input.buffer);
    /** @type {Sound} */
    const sound = {
      id,
      text: input.text.trim() || path.basename(input.originalName, ext),
      file,
      color: COLORS.includes(input.color ?? '') ? /** @type {string} */ (input.color) : 'blue',
      category: (input.category || 'General').trim() || 'General',
      shortcut: input.shortcut?.trim() || undefined,
    };
    this.sounds.push(sound);
    await this.save();
    return sound;
  }

  /**
   * @param {string} id
   * @param {{ text?: string, category?: string, color?: string, shortcut?: string | null }} patch
   */
  async update(id, patch) {
    const sound = this.get(id);
    if (!sound) return null;
    if (patch.text !== undefined) sound.text = patch.text.trim() || sound.text;
    if (patch.category !== undefined) sound.category = patch.category.trim() || 'General';
    if (patch.color !== undefined && COLORS.includes(patch.color)) sound.color = patch.color;
    if (patch.shortcut !== undefined) {
      sound.shortcut = patch.shortcut?.trim() || undefined;
    }
    await this.save();
    return sound;
  }

  /** @param {string} id */
  async remove(id) {
    const idx = this.sounds.findIndex((s) => s.id === id);
    if (idx === -1) return false;
    const [sound] = this.sounds.splice(idx, 1);
    await this.save();
    try {
      await unlink(path.join(this.soundsDir, sound.file));
    } catch {
      /* ignore missing file */
    }
    return true;
  }
}

export { COLORS };
