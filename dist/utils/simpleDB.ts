import { existsSync, mkdirSync, writeFileSync, readFileSync, watchFile, unwatchFile, Stats } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import fg from 'fast-glob';
import { EventEmitter } from 'tseep';

interface SimpleDBOptions {
  dbPath?: string;
  watchFiles?: boolean;
  watchInterval?: number;
}

class SimpleDB extends EventEmitter {
  collections: Map<string, boolean>;
  collectionInstances: Map<string, Collection>;
  dbPath: string;
  initPromise: Promise<SimpleDB>;
  watchFiles: boolean;
  watchInterval: number;

  constructor(options: SimpleDBOptions = {}) {
    super();
    this.dbPath = options.dbPath || join(process.cwd(), 'db');
    this.watchFiles = options.watchFiles !== false; // Default to true
    this.watchInterval = options.watchInterval || 100; // Check every 100ms
    this.collections = new Map();
    this.collectionInstances = new Map();
    
    !existsSync(this.dbPath) && mkdirSync(this.dbPath, { recursive: true });
    
    this.initPromise = this.init();
  }

  async init() {
    const files = await fg('*.json', { cwd: this.dbPath });
    files.forEach(file => this.collections.set(file.replace('.json', ''), true));
    return this;
  }

  collection(name: string) {
    if (this.collectionInstances.has(name)) {
      return this.collectionInstances.get(name)!;
    }

    const filePath = join(this.dbPath, `${name}.json`);
    
    if (!this.collections.has(name) && !existsSync(filePath)) {
      writeFileSync(filePath, '[]');
      this.collections.set(name, true);
    }

    const collection = new Collection(name, filePath, {
      watchFiles: this.watchFiles,
      watchInterval: this.watchInterval
    });
    
    this.collectionInstances.set(name, collection);
    
    // Forward collection events
    collection.on('change', (eventType, data) => {
      this.emit('collectionChange', { collection: name, eventType, data });
    });
    
    return collection;
  }

  close() {
    // Clean up all collections
    this.collectionInstances.forEach(collection => {
      collection.close();
    });
    this.collectionInstances.clear();
    this.removeAllListeners();
  }
}

interface CollectionOptions {
  watchFiles?: boolean;
  watchInterval?: number;
}

class Collection extends EventEmitter {
  name: string;
  filePath: string;
  data: Map<string, any>;
  indices: Map<string, Map<any, Set<string>>>;
  dirty: boolean;
  _saveTimer: any;
  _saveDelay: number;
  _lastModified: Date;
  _watchFiles: boolean;
  _watchInterval: number;
  _isWatching: boolean;

  constructor(name: string, filePath: string, options: CollectionOptions = {}) {
    super();
    this.name = name;
    this.filePath = filePath;
    this.data = new Map(); // _id to doc
    this.indices = new Map(); // field to (value to Set<_id>)
    this.dirty = false;
    this._saveTimer = null;
    this._saveDelay = 50; // Reduced save delay for better performance
    this._lastModified = new Date(0);
    this._watchFiles = options.watchFiles !== false;
    this._watchInterval = options.watchInterval || 100;
    this._isWatching = false;
    
    // Ensure _id index
    this.ensureIndex('_id');
    
    // Load data immediately
    this.load();
    
    // Start watching if enabled
    if (this._watchFiles) {
      this.startWatching();
    }
  }

  private startWatching() {
    if (this._isWatching) return;
    
    this._isWatching = true;
    watchFile(this.filePath, { interval: this._watchInterval }, (curr: Stats, prev: Stats) => {
      // Check if file was modified by someone else (not us)
      if (curr.mtime > this._lastModified && !this.dirty) {
        this.reload();
      }
    });
  }

  private stopWatching() {
    if (!this._isWatching) return;
    
    this._isWatching = false;
    unwatchFile(this.filePath);
  }

  private reload() {
    const oldData = new Map(this.data);
    this.data.clear();
    this.indices.clear();
    this.ensureIndex('_id');
    
    this.load();
    
    // Emit change event
    this.emit('change', 'reload', {
      oldSize: oldData.size,
      newSize: this.data.size
    });
  }

  load() {
    try {
      if (existsSync(this.filePath)) {
        const stats = readFileSync(this.filePath, 'utf8');
        this._lastModified = new Date();
        
        const docs = JSON.parse(stats);
        docs.forEach((doc: any) => {
          if (doc._id) {
            this.data.set(doc._id, doc);
            // Update indices
            this.indices.forEach((indexMap, field) => {
              const value = doc[field];
              if (value !== undefined) {
                if (!indexMap.has(value)) {
                  indexMap.set(value, new Set());
                }
                indexMap.get(value)!.add(doc._id);
              }
            });
          } else {
            console.error('Document without _id:', doc);
          }
        });
      }
    } catch (err) {
      console.error('Error loading collection:', err);
      this.data = new Map();
    }
    return this;
  }

  save() {
    if (!this.dirty) return true;
    
    this._saveTimer && clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      const docs = Array.from(this.data.values());
      writeFileSync(this.filePath, JSON.stringify(docs, null, 2));
      this._lastModified = new Date();
      this.dirty = false;
      this._saveTimer = null;
    }, this._saveDelay);

    return true;
  }

  ensureIndex(field: string) {
    if (this.indices.has(field)) return;
    
    const indexMap = new Map(); // value to Set<_id>
    this.data.forEach((doc, _id) => {
      const value = doc[field];
      if (value !== undefined) {
        if (!indexMap.has(value)) {
          indexMap.set(value, new Set());
        }
        indexMap.get(value).add(_id);
      }
    });
    
    this.indices.set(field, indexMap);
  }

  insert(docs: any | any[]) {
    const items = Array.isArray(docs) ? docs : [docs];
    const insertedItems: any[] = [];
    
    items.forEach(doc => {
      if (!doc._id) {
        doc._id = randomBytes(12).toString('hex');
      }
      if (this.data.has(doc._id)) {
        throw new Error('Duplicate _id: ' + doc._id);
      }
      this.data.set(doc._id, doc);
      insertedItems.push(doc);
      
      // Update all existing indices
      this.indices.forEach((indexMap, field) => {
        const value = doc[field];
        if (value !== undefined) {
          if (!indexMap.has(value)) {
            indexMap.set(value, new Set());
          }
          indexMap.get(value)!.add(doc._id);
        }
      });
    });

    this.dirty = true;
    this.save();
    
    // Emit change event
    this.emit('change', 'insert', { docs: insertedItems });
    
    return items.length === 1 ? items[0] : items;
  }

  find(query: any = {}) {
    if (!Object.keys(query).length) {
      return Array.from(this.data.values());
    }

    const fields = Object.keys(query);
    if (fields.length === 1 && typeof query[fields[0]] !== 'object') {
      const field = fields[0];
      const value = query[field];
      this.ensureIndex(field);
      if (this.indices.has(field)) {
        const indexMap = this.indices.get(field)!;
        if (indexMap.has(value)) {
          const ids = indexMap.get(value)!;
          return Array.from(ids).map(_id => this.data.get(_id));
        } else {
          return [];
        }
      }
    }

    // Fallback to full scan
    return Array.from(this.data.values()).filter(doc => this.matchDocument(doc, query));
  }

  findOne(query: any = {}) {
    const results = this.find(query);
    return results.length > 0 ? results[0] : null;
  }

  findById(id: string) {
    return this.data.get(id) || null;
  }

  update(query: any, updates: any) {
    const matchingDocs = this.find(query);
    let count = 0;
    const updatedDocs: any[] = [];
    
    matchingDocs.forEach(doc => {
      const oldDoc = { ...doc };
      Object.assign(doc, updates);
      updatedDocs.push({ old: oldDoc, new: doc });
      
      // Update indices
      Object.keys(updates).forEach(field => {
        if (this.indices.has(field)) {
          const oldVal = oldDoc[field];
          const newVal = doc[field];
          if (oldVal !== newVal) {
            // Remove from oldVal
            if (oldVal !== undefined) {
              const indexMap = this.indices.get(field)!;
              if (indexMap.has(oldVal)) {
                const set = indexMap.get(oldVal)!;
                set.delete(doc._id);
                if (set.size === 0) {
                  indexMap.delete(oldVal);
                }
              }
            }
            // Add to newVal
            if (newVal !== undefined) {
              const indexMap = this.indices.get(field)!;
              if (!indexMap.has(newVal)) {
                indexMap.set(newVal, new Set());
              }
              indexMap.get(newVal)!.add(doc._id);
            }
          }
        }
      });
      count++;
    });

    this.dirty = true;
    this.save();
    
    // Emit change event
    this.emit('change', 'update', { docs: updatedDocs, count });
    
    return count;
  }

  delete(query: any) {
    const matchingDocs = this.find(query);
    let count = 0;
    const deletedDocs: any[] = [];
    
    matchingDocs.forEach(doc => {
      this.data.delete(doc._id);
      deletedDocs.push(doc);
      
      // Remove from all indices
      this.indices.forEach((indexMap, field) => {
        const value = doc[field];
        if (value !== undefined && indexMap.has(value)) {
          const set = indexMap.get(value)!;
          set.delete(doc._id);
          if (set.size === 0) {
            indexMap.delete(value);
          }
        }
      });
      count++;
    });

    this.dirty = true;
    this.save();
    
    // Emit change event
    this.emit('change', 'delete', { docs: deletedDocs, count });
    
    return count;
  }

  matchDocument(doc: any, query: any) {
    for (const key in query) {
      if (!(key in doc)) return false;
      const queryVal = query[key];
      if (typeof queryVal !== 'object') {
        if (doc[key] !== queryVal) return false;
      } else {
        // Handle operators
        for (const op in queryVal) {
          const val = queryVal[op];
          switch (op) {
            case '$gt': if (!(doc[key] > val)) return false; break;
            case '$gte': if (!(doc[key] >= val)) return false; break;
            case '$lt': if (!(doc[key] < val)) return false; break;
            case '$lte': if (!(doc[key] <= val)) return false; break;
            case '$ne': if (doc[key] === val) return false; break;
            case '$in': if (!Array.isArray(val) || !val.includes(doc[key])) return false; break;
            default: return false;
          }
        }
      }
    }
    return true;
  }

  count(query: any = {}) {
    if (!Object.keys(query).length) return this.data.size;
    
    const fields = Object.keys(query);
    if (fields.length === 1 && typeof query[fields[0]] !== 'object') {
      const field = fields[0];
      const value = query[field];
      this.ensureIndex(field);
      if (this.indices.has(field)) {
        const indexMap = this.indices.get(field)!;
        if (indexMap.has(value)) {
          return indexMap.get(value)!.size;
        } else {
          return 0;
        }
      }
    }
    
    return this.find(query).length;
  }

  createIndex(field: string) {
    return this.ensureIndex(field);
  }

  bulkWrite(operations: any[]) {
    let insertCount = 0, updateCount = 0, deleteCount = 0;

    operations.forEach(op => {
      if (op.insert) {
        const count = Array.isArray(op.insert) ? op.insert.length : 1;
        this.insert(op.insert);
        insertCount += count;
      } else if (op.update && op.query) {
        updateCount += this.update(op.query, op.update);
      } else if (op.delete) {
        deleteCount += this.delete(op.delete);
      }
    });

    return { insertCount, updateCount, deleteCount };
  }

  // Method to manually refresh data from file
  refresh() {
    this.reload();
  }

  // Method to check if collection is being watched
  isWatching() {
    return this._isWatching;
  }

  // Clean up resources
  close() {
    this.stopWatching();
    this._saveTimer && clearTimeout(this._saveTimer);
    this.removeAllListeners();
  }
}

export { SimpleDB, Collection };