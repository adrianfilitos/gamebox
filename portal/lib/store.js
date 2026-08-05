const fs = require('fs');
const path = require('path');

class Store {
  constructor(file, seed) {
    this.file = file;
    this.data = this.load();
    if (Object.keys(this.data).length === 0 && seed) this.data = seed;
  }
  load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch { return {}; }
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
      return true;
    } catch { return false; }
  }
  get(k, dflt) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : dflt; }
  set(k, v) { this.data[k] = v; this.save(); }
  remove(k) { delete this.data[k]; this.save(); }
}

module.exports = { Store };
