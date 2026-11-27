// @ts-check
// Standalone zero-CDN WebGL2 3D Viewer for Mini-Dungeon Blueprint v1 & ARCH3D inspection.

import { Arch3dFile } from '../formats/arch3dFile.js';
import { TextureFile, texName } from '../formats/textureFile.js';
import { DFPalette } from '../formats/dfPalette.js';
import { bitmapToColor32 } from '../formats/color32Order.js';
import { dfMeshToModel, GLOBAL_SCALE } from '../world/meshReader.js';
import { meshHasDungeonEntrance } from '../systems/travel/travelDungeonModels.js';
import {
  CURATED_ARCH3D_CATALOG,
  MINI_DUNGEON_SAMPLE_BLUEPRINTS,
  buildMiniDungeonInteriorRecord,
  resolveRemappedArchive,
  validateMiniDungeonBlueprint,
} from '../world/miniDungeons/miniDungeonBlueprint.js';

function calcBillboardSize(tf, record) {
  const sz = tf.getSize(record);
  const sc = tf.getScale(record);
  const cw = Math.trunc((sz.width * sc.x) / 256);
  const ch = Math.trunc((sz.height * sc.y) / 256);
  return {
    w: (sz.width + cw) * GLOBAL_SCALE,
    h: (sz.height + ch) * GLOBAL_SCALE,
  };
}

const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Minimal column-major mat4 helpers
// ---------------------------------------------------------------------------
function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function mat4Mul(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function mat4Perspective(fovRad, aspect, near, far) {
  const f = 1 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / Math.max(0.01, aspect), 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4LookAt(eye, target, up) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len;
  zy /= len;
  zz /= len;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len;
  xy /= len;
  xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

function mat4Trs(x, y, z, yawRad, sx = 1, sy = 1, sz = 1) {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  return new Float32Array([
    c * sx, 0, -s * sx, 0,
    0, sy, 0, 0,
    s * sz, 0, c * sz, 0,
    x, y, z, 1,
  ]);
}

// ---------------------------------------------------------------------------
// Local / Dev ARENA2 Data Store
// ---------------------------------------------------------------------------
class Arena2Store {
  constructor() {
    /** @type {Map<string, any>} */
    this.localFiles = new Map();
    /** @type {Map<string, any>} */
    this.localHandles = new Map();
    this.devMode = false;
    /** @type {DFPalette | null} */
    this.palette = null;
    /** @type {Arch3dFile | null} */
    this.arch3d = null;
    /** @type {Map<number, TextureFile | null>} */
    this.textures = new Map();
    /** @type {Map<number, Promise<TextureFile | null>>} */
    this.texPromises = new Map();
    /** @type {Map<number, any>} */
    this.cpuCache = new Map();
  }

  get ready() {
    return Boolean(this.palette && this.arch3d);
  }

  resetCaches() {
    this.textures.clear();
    this.texPromises.clear();
    this.cpuCache.clear();
  }

  async readBytes(name) {
    const upper = String(name).toUpperCase();
    const handle = this.localHandles.get(upper);
    if (handle) {
      const f = await handle.getFile();
      return new Uint8Array(await f.arrayBuffer());
    }
    const file = this.localFiles.get(upper);
    if (file) {
      return new Uint8Array(await file.arrayBuffer());
    }
    if (this.devMode) {
      const res = await fetch(`./arena2/${upper}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${upper}`);
      return new Uint8Array(await res.arrayBuffer());
    }
    throw new Error(`${upper} not found in ARENA2`);
  }

  async loadCoreFromHandles(handleMap, onProgress = null) {
    this.localFiles.clear();
    this.localHandles = new Map(handleMap);
    this.devMode = false;
    this.resetCaches();
    await this._initCore(onProgress);
  }

  async loadCoreFromLocal(fileList, onProgress = null) {
    this.localHandles.clear();
    this.localFiles.clear();
    this.devMode = false;
    this.resetCaches();
    onProgress?.(10, `Indexing ${fileList.length} files...`);
    for (const f of fileList) {
      const n = (f.name || '').toUpperCase();
      if (n) this.localFiles.set(n, f);
    }
    await this._initCore(onProgress);
  }

  async loadCoreFromDev(onProgress = null) {
    this.localHandles.clear();
    this.localFiles.clear();
    this.devMode = true;
    this.resetCaches();
    await this._initCore(onProgress);
  }

  async _initCore(onProgress = null) {
    onProgress?.(20, 'Reading ART_PAL.COL...');
    const palBytes = await this.readBytes('ART_PAL.COL');
    const pal = new DFPalette();
    pal.load(palBytes, 'ART_PAL.COL');
    this.palette = pal;

    onProgress?.(45, 'Reading ARCH3D.BSA...');
    const archBytes = await this.readBytes('ARCH3D.BSA');
    onProgress?.(85, 'Parsing ARCH3D.BSA...');
    const arch = new Arch3dFile();
    arch.load(archBytes);
    this.arch3d = arch;
    onProgress?.(100, 'Ready!');
  }

  async getTexture(archive) {
    const archNum = Number(archive);
    if (!Number.isInteger(archNum) || archNum < 0) return null;
    if (this.textures.has(archNum)) return this.textures.get(archNum) ?? null;
    if (this.texPromises.has(archNum)) return this.texPromises.get(archNum);

    const p = (async () => {
      try {
        const name = texName(archNum);
        const bytes = await this.readBytes(name);
        const tf = new TextureFile();
        if (!tf.load(bytes, name, this.palette)) {
          this.textures.set(archNum, null);
          return null;
        }
        this.textures.set(archNum, tf);
        return tf;
      } catch {
        this.textures.set(archNum, null);
        return null;
      }
    })();
    this.texPromises.set(archNum, p);
    return p;
  }

  async getCpuModel(modelId) {
    const id = Number(modelId);
    if (this.cpuCache.has(id)) return this.cpuCache.get(id);
    if (!this.arch3d) return null;
    const recIdx = this.arch3d.getRecordIndex(id);
    if (recIdx === -1) return null;
    const dfMesh = this.arch3d.getMesh(recIdx);
    if (!dfMesh) return null;

    // Preload submesh textures so UVs get authentic texture dimensions
    const archives = new Set();
    for (const sm of dfMesh.subMeshes ?? []) {
      archives.add(sm.textureArchive);
    }
    await Promise.all([...archives].map((a) => this.getTexture(a)));

    const getTextureSize = (archive, record) => {
      const tf = this.textures.get(archive);
      if (tf && record >= 0 && record < tf.recordCount) {
        const sz = tf.getSize(record);
        if (sz?.width > 0 && sz?.height > 0) return sz;
      }
      return { width: 64, height: 64 };
    };

    const built = dfMeshToModel(dfMesh, getTextureSize);
    // Compute bounding box
    const pos = built.positions;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < minX) minX = pos[i];
      if (pos[i] > maxX) maxX = pos[i];
      if (pos[i + 1] < minY) minY = pos[i + 1];
      if (pos[i + 1] > maxY) maxY = pos[i + 1];
      if (pos[i + 2] < minZ) minZ = pos[i + 2];
      if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
    }
    const entry = {
      modelId: id,
      ...built,
      dfMesh,
      box: Number.isFinite(minX) ? [minX, minY, minZ, maxX, maxY, maxZ] : [0, 0, 0, 1, 1, 1],
    };
    this.cpuCache.set(id, entry);
    return entry;
  }
}

// ---------------------------------------------------------------------------
// Pure WebGL2 Renderer
// ---------------------------------------------------------------------------
const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNorm;
layout(location=2) in vec2 aUv;
uniform mat4 uMvp;
uniform mat4 uModel;
out vec3 vNorm;
out vec2 vUv;
void main() {
  gl_Position = uMvp * vec4(aPos, 1.0);
  vNorm = mat3(uModel) * aNorm;
  vUv = aUv;
}`;

const MESH_FS = `#version 300 es
precision mediump float;
in vec3 vNorm;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uWire;
uniform vec3 uTint;
out vec4 fragColor;
void main() {
  if (uWire > 0.5) {
    fragColor = vec4(0.95, 0.85, 0.45, 1.0);
    return;
  }
  vec4 texel = texture(uTex, vUv);
  if (texel.a < 0.5) discard;
  vec3 n = normalize(vNorm);
  vec3 sunDir = normalize(vec3(0.45, 0.82, 0.35));
  float ndl = max(dot(n, sunDir), 0.0);
  float hemi = 0.48 + 0.16 * n.y;
  vec3 lit = texel.rgb * uTint * (hemi + 0.62 * ndl);
  fragColor = vec4(lit, texel.a);
}`;

const COLOR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec4 aCol;
uniform mat4 uMvp;
out vec4 vCol;
void main() {
  gl_Position = uMvp * vec4(aPos, 1.0);
  vCol = aCol;
}`;

const COLOR_FS = `#version 300 es
precision mediump float;
in vec4 vCol;
out vec4 fragColor;
void main() {
  fragColor = vCol;
}`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'Shader compile failed');
  }
  return sh;
}

function linkProgram(gl, vsSrc, fsSrc) {
  const prog = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'Program link failed');
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

class ViewerRenderer {
  /** @param {any} canvas @param {Arena2Store} store */
  constructor(canvas, store) {
    this.canvas = canvas;
    this.store = store;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    this.meshProg = linkProgram(gl, MESH_VS, MESH_FS);
    this.uMeshMvp = gl.getUniformLocation(this.meshProg, 'uMvp');
    this.uMeshModel = gl.getUniformLocation(this.meshProg, 'uModel');
    this.uMeshTex = gl.getUniformLocation(this.meshProg, 'uTex');
    this.uMeshWire = gl.getUniformLocation(this.meshProg, 'uWire');
    this.uMeshTint = gl.getUniformLocation(this.meshProg, 'uTint');

    this.colorProg = linkProgram(gl, COLOR_VS, COLOR_FS);
    this.uColorMvp = gl.getUniformLocation(this.colorProg, 'uMvp');

    this.gpuMeshes = new Map();
    this.gpuTextures = new Map();
    this.fallbackTex = this._makeCheckerTex();
    this.quadGpu = this._makeBillboardQuad();
    this.colorBatch = this._makeColorBatch();
  }

  _makeCheckerTex() {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const data = new Uint8Array([
      130, 130, 145, 255, 85, 85, 98, 255,
      85, 85, 98, 255, 130, 130, 145, 255,
    ]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  }

  _makeBillboardQuad() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const pos = new Float32Array([
      -0.5, 0, 0,
      0.5, 0, 0,
      0.5, 1, 0,
      -0.5, 1, 0,
    ]);
    const norm = new Float32Array([
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    ]);
    const uv = new Float32Array([
      0, 1, 1, 1, 1, 0, 0, 0,
    ]);
    const idx = new Uint32Array([0, 1, 2, 0, 2, 3]);
    this._bindAttr(0, pos, 3);
    this._bindAttr(1, norm, 3);
    this._bindAttr(2, uv, 2);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: 6 };
  }

  _makeColorBatch() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    return { vao, vbo };
  }

  _bindAttr(loc, data, size) {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
  }

  getOrUploadMesh(cpu) {
    if (!cpu) return null;
    if (this.gpuMeshes.has(cpu.modelId)) return this.gpuMeshes.get(cpu.modelId);
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this._bindAttr(0, cpu.positions, 3);
    this._bindAttr(1, cpu.normals, 3);
    this._bindAttr(2, cpu.uvs, 2);
    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cpu.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const gpu = { vao, subMeshes: cpu.subMeshes, box: cpu.box, totalTriangles: cpu.indices.length / 3 };
    this.gpuMeshes.set(cpu.modelId, gpu);
    return gpu;
  }

  async getOrUploadTexture(archive, record, clamp = false) {
    const key = `${archive}_${record}_${clamp ? 1 : 0}`;
    if (this.gpuTextures.has(key)) return this.gpuTextures.get(key);
    const tf = await this.store.getTexture(archive);
    if (!tf || record < 0 || record >= tf.recordCount || !this.store.palette) {
      return null;
    }
    const bmp = tf.getDFBitmap(record, 0);
    const sz = tf.getSize(record);
    if (!sz || sz.width <= 0 || sz.height <= 0) return null;
    const c32 = bitmapToColor32(bmp, this.store.palette, 0);
    const rgba = new Uint8Array(c32.colors.buffer);
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sz.width, sz.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT);
    const entry = { tex, width: sz.width, height: sz.height, c32 };
    this.gpuTextures.set(key, entry);
    return entry;
  }

  resizeIfNeeded() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    return w / Math.max(1, h);
  }

  render(vp, drawCmds, flatCmds, colorTris, colorLines, wireframe = false) {
    const gl = this.gl;
    gl.clearColor(0.08, 0.1, 0.14, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // 1. Vertex-colored ground / terrain / markers
    if (colorTris.length > 0) {
      gl.disable(gl.CULL_FACE);
      gl.useProgram(this.colorProg);
      gl.uniformMatrix4fv(this.uColorMvp, false, vp);
      gl.bindVertexArray(this.colorBatch.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBatch.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colorTris), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, colorTris.length / 7);
    }

    // 2. Textured 3D meshes
    gl.useProgram(this.meshProg);
    gl.uniform1i(this.uMeshTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.CULL_FACE);
    for (const cmd of drawCmds) {
      const mvp = mat4Mul(vp, cmd.matrix);
      gl.uniformMatrix4fv(this.uMeshMvp, false, mvp);
      gl.uniformMatrix4fv(this.uMeshModel, false, cmd.matrix);
      gl.uniform3f(this.uMeshTint, cmd.tint[0], cmd.tint[1], cmd.tint[2]);
      gl.uniform1f(this.uMeshWire, 0);
      gl.bindVertexArray(cmd.gpu.vao);
      for (const sm of cmd.gpu.subMeshes) {
        const tex = cmd.resolveTex(sm.textureArchive, sm.textureRecord) ?? this.fallbackTex;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.drawElements(gl.TRIANGLES, sm.primitiveCount * 3, gl.UNSIGNED_INT, sm.startIndex * 4);
      }
      if (wireframe) {
        gl.uniform1f(this.uMeshWire, 1);
        for (const sm of cmd.gpu.subMeshes) {
          gl.drawElements(gl.LINES, sm.primitiveCount * 3, gl.UNSIGNED_INT, sm.startIndex * 4);
        }
      }
    }

    // 3. Billboard flats
    if (flatCmds.length > 0) {
      gl.uniform1f(this.uMeshWire, 0);
      gl.uniform3f(this.uMeshTint, 1, 1, 1);
      gl.bindVertexArray(this.quadGpu.vao);
      for (const fl of flatCmds) {
        const mvp = mat4Mul(vp, fl.matrix);
        gl.uniformMatrix4fv(this.uMeshMvp, false, mvp);
        gl.uniformMatrix4fv(this.uMeshModel, false, fl.matrix);
        gl.bindTexture(gl.TEXTURE_2D, fl.tex ?? this.fallbackTex);
        gl.drawElements(gl.TRIANGLES, this.quadGpu.count, gl.UNSIGNED_INT, 0);
      }
    }

    // 4. Grid & debug lines
    if (colorLines.length > 0) {
      gl.useProgram(this.colorProg);
      gl.uniformMatrix4fv(this.uColorMvp, false, vp);
      gl.bindVertexArray(this.colorBatch.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBatch.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colorLines), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.LINES, 0, colorLines.length / 7);
    }
    gl.bindVertexArray(null);
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers for ground, slope, island & markers
// ---------------------------------------------------------------------------
function pushColorTri(arr, a, b, c, r, g, bl, alpha = 1) {
  arr.push(
    a[0], a[1], a[2], r, g, bl, alpha,
    b[0], b[1], b[2], r, g, bl, alpha,
    c[0], c[1], c[2], r, g, bl, alpha,
  );
}

function pushColorLine(arr, a, b, r, g, bl, alpha = 1) {
  arr.push(
    a[0], a[1], a[2], r, g, bl, alpha,
    b[0], b[1], b[2], r, g, bl, alpha,
  );
}

function pushMarkerDiamond(tris, x, y, z, radius, height, r, g, b) {
  const top = [x, y + height, z];
  const bot = [x, y, z];
  const midY = y + height * 0.5;
  const pts = [
    [x + radius, midY, z],
    [x, midY, z + radius],
    [x - radius, midY, z],
    [x, midY, z - radius],
  ];
  for (let i = 0; i < 4; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % 4];
    pushColorTri(tris, top, p0, p1, r, g, b, 1);
    pushColorTri(tris, bot, p1, p0, r * 0.7, g * 0.7, b * 0.7, 1);
  }
}

function buildGroundGeometry(groundMode, slopeDeg, climateBase, tris, lines) {
  const half = 18;
  const step = 2;
  const slopeTan = groundMode === 'slope' ? Math.tan(slopeDeg * DEG2RAD) : 0;

  // Climate ground tint
  let gr = 0.22;
  let gg = 0.31;
  let gb = 0.19;
  if (climateBase === 0) {
    gr = 0.55; gg = 0.47; gb = 0.31;
  } else if (climateBase === 100) {
    gr = 0.32; gg = 0.33; gb = 0.35;
  } else if (climateBase === 400) {
    gr = 0.19; gg = 0.25; gb = 0.2;
  }

  if (groundMode === 'sea') {
    // Sea plane at y = 0 + procedural small island cone at origin
    pushColorTri(tris, [-28, -0.05, -28], [28, -0.05, -28], [28, -0.05, 28], 0.08, 0.24, 0.38, 1);
    pushColorTri(tris, [-28, -0.05, -28], [28, -0.05, 28], [-28, -0.05, 28], 0.08, 0.24, 0.38, 1);
    const segs = 24;
    const rad = 14;
    const peak = 2.6;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const r0 = rad * (0.9 + 0.12 * Math.sin(i * 2.1));
      const r1 = rad * (0.9 + 0.12 * Math.sin((i + 1) * 2.1));
      const p0 = [Math.cos(a0) * r0, -0.4, Math.sin(a0) * r0];
      const p1 = [Math.cos(a1) * r1, -0.4, Math.sin(a1) * r1];
      const m0 = [Math.cos(a0) * (r0 * 0.55), peak * 0.65, Math.sin(a0) * (r0 * 0.55)];
      const m1 = [Math.cos(a1) * (r1 * 0.55), peak * 0.65, Math.sin(a1) * (r1 * 0.55)];
      const top = [0, peak, 0];
      pushColorTri(tris, p0, p1, m1, 0.45, 0.42, 0.32, 1);
      pushColorTri(tris, p0, m1, m0, 0.45, 0.42, 0.32, 1);
      pushColorTri(tris, m0, m1, top, gr, gg, gb, 1);
    }
    return (x, z) => {
      const d = Math.hypot(x, z);
      if (d >= rad) return -0.4;
      const t = 1 - d / rad;
      return t > 0.45 ? peak * (0.65 + 0.35 * ((t - 0.45) / 0.55)) : -0.4 + (peak * 0.65 + 0.4) * (t / 0.45);
    };
  }

  const heightAt = (_x, z) => z * slopeTan;
  for (let z = -half; z < half; z += step) {
    for (let x = -half; x < half; x += step) {
      const y00 = heightAt(x, z);
      const y10 = heightAt(x + step, z);
      const y11 = heightAt(x + step, z + step);
      const y01 = heightAt(x, z + step);
      const shade = ((x + z) / step) % 2 === 0 ? 1.0 : 0.93;
      pushColorTri(tris, [x, y00, z], [x + step, y10, z], [x + step, y11, z + step], gr * shade, gg * shade, gb * shade, 1);
      pushColorTri(tris, [x, y00, z], [x + step, y11, z + step], [x, y01, z + step], gr * shade, gg * shade, gb * shade, 1);
      pushColorLine(lines, [x, y00 + 0.01, z], [x + step, y10 + 0.01, z], 0.16, 0.2, 0.16, 1);
      pushColorLine(lines, [x, y00 + 0.01, z], [x, y01 + 0.01, z + step], 0.16, 0.2, 0.16, 1);
    }
  }
  return heightAt;
}

// ---------------------------------------------------------------------------
// Application Controller
// ---------------------------------------------------------------------------
const store = new Arena2Store();
const canvas = /** @type {any} */ (document.getElementById('viewport'));
const minimapCanvas = /** @type {any} */ (document.getElementById('minimap'));
const renderer = new ViewerRenderer(canvas, store);

const state = {
  tab: 'blueprint',
  viewMode: 'exterior', // 'exterior' | 'interior' | 'overworld'
  camMode: 'orbit',     // 'orbit' | 'walk'
  climateBase: 300,
  season: 0,
  groundMode: 'flat',
  slopeDeg: 25,
  cutaway: true,
  showMarkers: true,
  wireframe: false,
  showMinimap: true,
  blueprint: /** @type {any} */ (structuredClone(MINI_DUNGEON_SAMPLE_BLUEPRINTS[0])),
  catalogCategory: 'entrances',
  catalogModelId: 43514,
  scannedEntrances: /** @type {Array<{id:number, label:string, doors:number}>} */ ([]),
  // Camera state
  orbitYaw: 0.65,
  orbitPitch: 0.45,
  orbitDist: 20,
  orbitTarget: [0, 1.2, 0],
  walkPos: [0, 1.6, -8],
  walkYaw: 0,
  walkPitch: -0.05,
  keys: new Set(),
  // Built scene draw lists
  drawCmds: /** @type {any[]} */ ([]),
  flatCmds: /** @type {any[]} */ ([]),
  colorTris: /** @type {number[]} */ ([]),
  colorLines: /** @type {number[]} */ ([]),
  lastBuildId: 0,
};

const dom = {
  arenaStatus: document.getElementById('arenaStatus'),
  errBanner: document.getElementById('errBanner'),
  loadProgWrap: document.getElementById('loadProgWrap'),
  loadProgBar: document.getElementById('loadProgBar'),
  loadProgText: document.getElementById('loadProgText'),
  hudStats: document.getElementById('hudStats'),
  presetSel: /** @type {any} */ (document.getElementById('presetSel')),
  climateSel: /** @type {any} */ (document.getElementById('climateSel')),
  seasonSel: /** @type {any} */ (document.getElementById('seasonSel')),
  groundSel: /** @type {any} */ (document.getElementById('groundSel')),
  slopeDeg: /** @type {any} */ (document.getElementById('slopeDeg')),
  slopeVal: document.getElementById('slopeVal'),
  chkCutaway: /** @type {any} */ (document.getElementById('chkCutaway')),
  chkMarkers: /** @type {any} */ (document.getElementById('chkMarkers')),
  chkWire: /** @type {any} */ (document.getElementById('chkWire')),
  chkMinimap: /** @type {any} */ (document.getElementById('chkMinimap')),
  minimapSec: document.getElementById('minimapSec'),
  jsonEditor: /** @type {any} */ (document.getElementById('jsonEditor')),
  valBox: document.getElementById('valBox'),
  modelSummary: document.getElementById('modelSummary'),
  bpSwatches: document.getElementById('bpSwatches'),
  catSel: /** @type {any} */ (document.getElementById('catSel')),
  catList: document.getElementById('catList'),
  modelIdInput: /** @type {any} */ (document.getElementById('modelIdInput')),
  catInfo: document.getElementById('catInfo'),
  catSwatches: document.getElementById('catSwatches'),
};

function makeSwatchTile(archive, record, remappedArch, c32, width, height) {
  const tile = document.createElement('div');
  tile.className = 'swatch';
  const cv = /** @type {any} */ (document.createElement('canvas'));
  cv.width = Math.max(1, width);
  cv.height = Math.max(1, height);
  if (c32 && width > 0 && height > 0) {
    const img = new ImageData(new Uint8ClampedArray(c32.colors.buffer), width, height);
    cv.getContext('2d').putImageData(img, 0, 0);
  }
  const sid = document.createElement('div');
  sid.className = 'sid';
  sid.textContent = `${archive}/${record}`;
  const srem = document.createElement('div');
  srem.className = 'srem';
  srem.textContent = remappedArch !== archive ? `-> ${remappedArch}/${record}` : `${width}x${height}`;
  tile.append(cv, sid, srem);
  return tile;
}

function drawMinimap() {
  if (!state.showMinimap || state.tab !== 'blueprint') return;
  const ctx = minimapCanvas.getContext('2d');
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  ctx.fillStyle = '#0c0e13';
  ctx.fillRect(0, 0, w, h);

  const bp = state.blueprint;
  const cx = w / 2;
  const cy = h / 2;
  const scale = state.viewMode === 'interior' ? 14 : 9;

  // Grid lines
  ctx.strokeStyle = '#1b202c';
  ctx.lineWidth = 1;
  for (let gx = -12; gx <= 12; gx += 2) {
    ctx.beginPath();
    ctx.moveTo(cx + gx * scale, 0);
    ctx.lineTo(cx + gx * scale, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, cy - gx * scale);
    ctx.lineTo(w, cy - gx * scale);
    ctx.stroke();
  }

  if (state.viewMode === 'interior' && bp.interior?.cells?.length) {
    const cellM = 3.2;
    for (const [ci, cj] of bp.interior.cells) {
      const mx = ci * cellM + 0.625;
      const mz = (cj + 0.5) * cellM;
      ctx.fillStyle = '#252c3d';
      ctx.strokeStyle = '#627296';
      ctx.fillRect(cx + (mx - cellM / 2) * scale, cy - (mz + cellM / 2) * scale + 35, cellM * scale, cellM * scale);
      ctx.strokeRect(cx + (mx - cellM / 2) * scale, cy - (mz + cellM / 2) * scale + 35, cellM * scale, cellM * scale);
    }
    const builtInt = buildMiniDungeonInteriorRecord(bp, 1);
    for (const c of builtInt.containersMeta) {
      ctx.fillStyle = c.role === 'main' ? '#f0c243' : '#4cc9f0';
      ctx.beginPath();
      ctx.arc(cx + c.x * scale, cy - c.z * scale + 35, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const sp of builtInt.spawnPointsMeta) {
      ctx.fillStyle = '#f25f5c';
      ctx.beginPath();
      ctx.arc(cx + sp.x * scale, cy - sp.z * scale + 35, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Exterior minimap
  for (const m of bp.exterior?.models ?? []) {
    ctx.fillStyle = '#536280';
    ctx.fillRect(cx + m.dx * scale - 4, cy - m.dz * scale - 4, 8, 8);
  }
  if (bp.exterior?.entrance) {
    const e = bp.exterior.entrance;
    ctx.fillStyle = '#68d391';
    ctx.fillRect(cx + e.dx * scale - 5, cy - e.dz * scale - 5, 10, 10);
  }
  for (const fl of bp.exterior?.flats ?? []) {
    if (fl.archive === 210) {
      ctx.fillStyle = '#f6e05e';
      ctx.beginPath();
      ctx.arc(cx + fl.dx * scale, cy - fl.dz * scale, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const c of bp.containers ?? []) {
    if (c.where !== 'exterior') continue;
    ctx.fillStyle = c.role === 'main' ? '#f0c243' : '#4cc9f0';
    ctx.beginPath();
    ctx.arc(cx + c.dx * scale, cy - c.dz * scale, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const sp of bp.encounters?.spawnPoints ?? []) {
    if (sp.where !== 'exterior') continue;
    ctx.fillStyle = '#f25f5c';
    ctx.beginPath();
    ctx.arc(cx + sp.dx * scale, cy - sp.dz * scale, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function rebuildScene() {
  const buildId = ++state.lastBuildId;
  state.drawCmds = [];
  state.flatCmds = [];
  state.colorTris = [];
  state.colorLines = [];
  drawMinimap();

  if (!store.ready) {
    // Still render ground & markers even before ARENA2 is loaded
    const heightAt = buildGroundGeometry(
      state.viewMode === 'interior' ? 'flat' : state.groundMode,
      state.slopeDeg,
      state.climateBase,
      state.colorTris,
      state.colorLines,
    );
    if (state.tab === 'blueprint' && state.showMarkers) {
      addBlueprintMarkers(heightAt);
    }
    dom.hudStats.textContent = 'No ARENA2 loaded (showing ground/markers only)';
    return;
  }

  if (state.tab === 'catalog') {
    await buildCatalogScene(buildId);
  } else {
    await buildBlueprintScene(buildId);
  }
}

function addBlueprintMarkers(heightAt) {
  const bp = state.blueprint;
  if (state.viewMode === 'interior') {
    const builtInt = buildMiniDungeonInteriorRecord(bp, 1);
    for (const c of builtInt.containersMeta) {
      if (c.role === 'main') pushMarkerDiamond(state.colorTris, c.x, 1.1, c.z, 0.3, 0.55, 0.95, 0.78, 0.22);
      else pushMarkerDiamond(state.colorTris, c.x, 1.0, c.z, 0.24, 0.45, 0.25, 0.82, 0.95);
    }
    for (const sp of builtInt.spawnPointsMeta) {
      pushMarkerDiamond(state.colorTris, sp.x, 0.2, sp.z, 0.32, 1.4, 0.95, 0.28, 0.28);
    }
    return;
  }

  if (bp.exterior?.entrance) {
    const e = bp.exterior.entrance;
    const ey = heightAt(e.dx, e.dz);
    pushMarkerDiamond(state.colorTris, e.dx, ey + 2.4, e.dz, 0.35, 0.7, 0.35, 0.9, 0.55);
  }
  for (const c of bp.containers ?? []) {
    if (c.where !== 'exterior') continue;
    const cy = heightAt(c.dx, c.dz) + (Number(c.dy) || 0);
    if (c.role === 'main') pushMarkerDiamond(state.colorTris, c.dx, cy + 1.0, c.dz, 0.3, 0.6, 0.95, 0.78, 0.22);
    else pushMarkerDiamond(state.colorTris, c.dx, cy + 0.9, c.dz, 0.24, 0.45, 0.25, 0.82, 0.95);
  }
  for (const sp of bp.encounters?.spawnPoints ?? []) {
    if (sp.where !== 'exterior') continue;
    const sy = heightAt(sp.dx, sp.dz);
    pushMarkerDiamond(state.colorTris, sp.dx, sy + 0.1, sp.dz, 0.32, 1.4, 0.95, 0.28, 0.28);
  }
  for (const fl of bp.exterior?.flats ?? []) {
    if (fl.archive === 210) {
      const fy = heightAt(fl.dx, fl.dz) + (Number(fl.dy) || 0);
      pushMarkerDiamond(state.colorTris, fl.dx, fy + 1.4, fl.dz, 0.22, 0.4, 0.98, 0.88, 0.32);
    }
  }
}

async function resolveDrawTexMap(cpu, restyleSet = null) {
  const map = new Map();
  const swatchEntries = [];
  for (const sm of cpu.subMeshes ?? []) {
    const k = `${sm.textureArchive}_${sm.textureRecord}`;
    if (map.has(k)) continue;
    const remapped = resolveRemappedArchive(sm.textureArchive, sm.textureRecord, state.climateBase, state.season, restyleSet);
    let gpuTex = await renderer.getOrUploadTexture(remapped, sm.textureRecord, false);
    let actualArch = remapped;
    if (!gpuTex && remapped !== sm.textureArchive) {
      gpuTex = await renderer.getOrUploadTexture(sm.textureArchive, sm.textureRecord, false);
      actualArch = sm.textureArchive;
    }
    map.set(k, gpuTex?.tex ?? null);
    swatchEntries.push({
      archive: sm.textureArchive,
      record: sm.textureRecord,
      remappedArch: actualArch,
      gpuTex,
    });
  }
  return { map, swatchEntries };
}

async function buildBlueprintScene(buildId) {
  const bp = state.blueprint;
  const gMode = state.viewMode === 'interior' ? 'flat' : state.groundMode;
  const heightAt = buildGroundGeometry(gMode, state.slopeDeg, state.climateBase, state.colorTris, state.colorLines);

  const placements = [];
  const flatSpecs = [];
  let restyleSet = null;

  if (state.viewMode === 'overworld') {
    const iconId = bp.overworldIcon?.modelId ?? bp.exterior?.models?.[0]?.modelId ?? 43509;
    const cpu = await store.getCpuModel(iconId);
    if (buildId !== state.lastBuildId) return;
    if (cpu) {
      const rawH = Math.max(0.5, cpu.box[4] - Math.max(0, cpu.box[1]));
      const targetH = Number(bp.overworldIcon?.heightM) || 15;
      const scale = Math.min(12, Math.max(1, targetH / rawH));
      placements.push({ modelId: iconId, matrix: mat4Trs(0, 0, 0, 0, scale, scale, scale), tint: [1, 1, 1] });
    }
  } else if (state.viewMode === 'interior') {
    if (bp.kind !== 'underground' || !bp.interior) {
      dom.modelSummary.textContent = 'This blueprint is overworld-only (no interior layout).';
      dom.bpSwatches.innerHTML = '';
      return;
    }
    const built = buildMiniDungeonInteriorRecord(bp, 1);
    restyleSet = built.restyleSet;
    for (const obj of built.interior.block3dObjectRecords ?? []) {
      const mid = Number(obj.modelIdNum);
      if (state.cutaway && mid >= 2000 && mid < 3000 && mid % 100 === 0) continue;
      const x = obj.xPos * GLOBAL_SCALE;
      const y = -obj.yPos * GLOBAL_SCALE;
      const z = obj.zPos * GLOBAL_SCALE;
      const yaw = -(obj.yRotation / 2048) * Math.PI * 2;
      const sx = obj.xScale ?? 1;
      const sy = obj.yScale ?? 1;
      const sz = obj.zScale ?? 1;
      placements.push({ modelId: mid, matrix: mat4Trs(x, y, z, yaw, sx, sy, sz), tint: [1, 1, 1] });
    }
    for (const fl of built.interior.blockFlatObjectRecords ?? []) {
      if (fl.textureArchive === 199) continue;
      flatSpecs.push({
        archive: fl.textureArchive,
        record: fl.textureRecord,
        x: fl.xPos * GLOBAL_SCALE,
        y: -fl.yPos * GLOBAL_SCALE,
        z: fl.zPos * GLOBAL_SCALE,
      });
    }
  } else {
    // Exterior
    if (bp.exterior?.entrance) {
      const e = bp.exterior.entrance;
      const ey = heightAt(e.dx, e.dz) - (Number(e.sinkM) || 0);
      placements.push({
        modelId: Number(e.modelId),
        matrix: mat4Trs(e.dx, ey, e.dz, (Number(e.yawDeg) || 0) * DEG2RAD),
        tint: [1, 1, 1],
      });
    }
    for (const m of bp.exterior?.models ?? []) {
      const my = heightAt(m.dx, m.dz) + (Number(m.dy) || 0) - (Number(m.sinkM) || 0);
      placements.push({
        modelId: Number(m.modelId),
        matrix: mat4Trs(m.dx, my, m.dz, (Number(m.yawDeg) || 0) * DEG2RAD),
        tint: [1, 1, 1],
      });
    }
    for (const c of bp.containers ?? []) {
      if (c.where !== 'exterior') continue;
      const cy = heightAt(c.dx, c.dz) + (Number(c.dy) || 0);
      placements.push({
        modelId: Number(c.modelId),
        matrix: mat4Trs(c.dx, cy, c.dz, (Number(c.yawDeg) || 0) * DEG2RAD),
        tint: c.role === 'main' ? [1.12, 1.04, 0.85] : [1, 1, 1],
      });
    }
    for (const fl of bp.exterior?.flats ?? []) {
      const fy = heightAt(fl.dx, fl.dz) + (Number(fl.dy) || 0);
      flatSpecs.push({
        archive: Number(fl.archive),
        record: Number(fl.record),
        x: fl.dx,
        y: fy,
        z: fl.dz,
      });
    }
  }

  if (state.showMarkers && state.viewMode !== 'overworld') {
    addBlueprintMarkers(heightAt);
  }

  // Load meshes & textures
  const uniqueIds = [...new Set(placements.map((p) => p.modelId))];
  const cpuMap = new Map();
  const texMapByModel = new Map();
  const allSwatches = new Map();
  const summaryLines = [];

  for (const id of uniqueIds) {
    const cpu = await store.getCpuModel(id);
    if (buildId !== state.lastBuildId) return;
    if (!cpu) {
      summaryLines.push(`#${id}: NOT FOUND in ARCH3D`);
      continue;
    }
    cpuMap.set(id, cpu);
    const { map, swatchEntries } = await resolveDrawTexMap(cpu, restyleSet);
    if (buildId !== state.lastBuildId) return;
    texMapByModel.set(id, map);
    for (const sw of swatchEntries) {
      const sk = `${sw.archive}_${sw.record}_${sw.remappedArch}`;
      if (!allSwatches.has(sk)) allSwatches.set(sk, sw);
    }
    const w = (cpu.box[3] - cpu.box[0]).toFixed(2);
    const h = (cpu.box[4] - cpu.box[1]).toFixed(2);
    const d = (cpu.box[5] - cpu.box[2]).toFixed(2);
    summaryLines.push(`#${id} (${w}x${h}x${d} m, ${cpu.indices.length / 3} tris)`);
  }

  for (const p of placements) {
    const cpu = cpuMap.get(p.modelId);
    if (!cpu) continue;
    const gpu = renderer.getOrUploadMesh(cpu);
    const tmap = texMapByModel.get(p.modelId);
    state.drawCmds.push({
      gpu,
      matrix: p.matrix,
      tint: p.tint,
      resolveTex: (a, r) => tmap?.get(`${a}_${r}`) ?? null,
    });
  }

  for (const fl of flatSpecs) {
    const tf = await store.getTexture(fl.archive);
    if (buildId !== state.lastBuildId) return;
    const gpuTex = await renderer.getOrUploadTexture(fl.archive, fl.record, true);
    if (buildId !== state.lastBuildId) return;
    let w = 1.0;
    let h = 1.0;
    if (tf && fl.record >= 0 && fl.record < tf.recordCount) {
      const sz = calcBillboardSize(tf, fl.record);
      w = sz.w || 1.0;
      h = sz.h || 1.0;
    }
    state.flatCmds.push({
      x: fl.x,
      y: fl.y,
      z: fl.z,
      w,
      h,
      tex: gpuTex?.tex ?? null,
      matrix: mat4Trs(fl.x, fl.y, fl.z, 0, w, h, 1),
    });
  }

  dom.modelSummary.textContent = summaryLines.join('\n') || 'No models in this view.';
  dom.bpSwatches.innerHTML = '';
  for (const sw of allSwatches.values()) {
    dom.bpSwatches.append(makeSwatchTile(sw.archive, sw.record, sw.remappedArch, sw.gpuTex?.c32, sw.gpuTex?.width ?? 0, sw.gpuTex?.height ?? 0));
  }
  dom.hudStats.textContent = `${bp.name || bp.id} | ${state.drawCmds.length} meshes | ${state.flatCmds.length} flats`;
}

async function buildCatalogScene(buildId) {
  buildGroundGeometry('flat', 0, state.climateBase, state.colorTris, state.colorLines);
  const id = Number(state.catalogModelId);
  const cpu = await store.getCpuModel(id);
  if (buildId !== state.lastBuildId) return;
  if (!cpu) {
    dom.catInfo.textContent = `Model #${id} not found in ARCH3D.BSA.`;
    dom.catSwatches.innerHTML = '';
    return;
  }
  const gpu = renderer.getOrUploadMesh(cpu);
  const { map, swatchEntries } = await resolveDrawTexMap(cpu, null);
  if (buildId !== state.lastBuildId) return;

  state.drawCmds.push({
    gpu,
    matrix: mat4Trs(0, -Math.min(0, cpu.box[1]), 0, 0, 1, 1, 1),
    tint: [1, 1, 1],
    resolveTex: (a, r) => map.get(`${a}_${r}`) ?? null,
  });

  const w = (cpu.box[3] - cpu.box[0]).toFixed(2);
  const h = (cpu.box[4] - cpu.box[1]).toFixed(2);
  const d = (cpu.box[5] - cpu.box[2]).toFixed(2);
  const doorsText = cpu.doors?.length
    ? cpu.doors.map((dr) => `type=${dr.type}`).join(', ')
    : 'none';
  dom.catInfo.textContent = `Model #${id}\nSize: ${w} x ${h} x ${d} m\nTriangles: ${cpu.indices.length / 3}\nDoors (${cpu.doors?.length ?? 0}): ${doorsText}`;
  dom.catSwatches.innerHTML = '';
  for (const sw of swatchEntries) {
    dom.catSwatches.append(makeSwatchTile(sw.archive, sw.record, sw.remappedArch, sw.gpuTex?.c32, sw.gpuTex?.width ?? 0, sw.gpuTex?.height ?? 0));
  }
  dom.hudStats.textContent = `ARCH3D #${id} | ${w}x${h}x${d}m | ${cpu.indices.length / 3} tris`;
}

// ---------------------------------------------------------------------------
// UI Wiring
// ---------------------------------------------------------------------------
function populatePresetSelect() {
  dom.presetSel.innerHTML = '';
  for (const bp of MINI_DUNGEON_SAMPLE_BLUEPRINTS) {
    const opt = document.createElement('option');
    opt.value = bp.id;
    opt.textContent = `${bp.name} (${bp.kind})`;
    dom.presetSel.append(opt);
  }
}

function loadBlueprintIntoEditor(bp, syncGround = true) {
  state.blueprint = structuredClone(bp);
  dom.jsonEditor.value = JSON.stringify(state.blueprint, null, 2);
  const v = validateMiniDungeonBlueprint(state.blueprint);
  showValidation(v);
  if (syncGround) {
    if (bp.placement?.mode === 'slope') {
      state.groundMode = 'slope';
      dom.groundSel.value = 'slope';
    } else if (bp.placement?.mode === 'sea') {
      state.groundMode = 'sea';
      dom.groundSel.value = 'sea';
    } else {
      state.groundMode = 'flat';
      dom.groundSel.value = 'flat';
    }
  }
  rebuildScene();
}

function showValidation(v) {
  if (v.ok) {
    dom.valBox.className = 'ok';
    dom.valBox.textContent = v.warnings.length
      ? `Valid Blueprint v1 (warnings: ${v.warnings.join(' | ')})`
      : 'Valid Blueprint v1.';
  } else {
    dom.valBox.className = 'err';
    dom.valBox.textContent = v.errors.join('\n');
  }
}

function renderCatalogList() {
  dom.catList.innerHTML = '';
  const items = state.catalogCategory === 'scannedEntrances'
    ? state.scannedEntrances
    : (CURATED_ARCH3D_CATALOG[state.catalogCategory] ?? []);

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'model-item' + (Number(item.id) === Number(state.catalogModelId) ? ' selected' : '');
    const left = document.createElement('span');
    left.textContent = `#${item.id} ${item.label}`;
    const right = document.createElement('span');
    right.className = item.doors ? 'badge door' : 'badge';
    right.textContent = item.doors ? `${item.doors} door` : '3D';
    row.append(left, right);
    row.addEventListener('click', () => {
      state.catalogModelId = Number(item.id);
      dom.modelIdInput.value = String(item.id);
      renderCatalogList();
      rebuildScene();
    });
    dom.catList.append(row);
  }
}

function setTab(tab) {
  state.tab = tab;
  document.getElementById('tabBlueprint').classList.toggle('active', tab === 'blueprint');
  document.getElementById('tabCatalog').classList.toggle('active', tab === 'catalog');
  document.getElementById('paneBlueprint').classList.toggle('hidden', tab !== 'blueprint');
  document.getElementById('paneCatalog').classList.toggle('hidden', tab !== 'catalog');
  rebuildScene();
}

function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('btnViewExt').classList.toggle('on', mode === 'exterior');
  document.getElementById('btnViewInt').classList.toggle('on', mode === 'interior');
  document.getElementById('btnViewOw').classList.toggle('on', mode === 'overworld');
  if (mode === 'interior') {
    state.orbitTarget = [0, 1.4, 4.8];
    state.orbitDist = 14;
    state.walkPos = [0.6, 1.6, 1.6];
    state.walkYaw = 0;
  } else if (mode === 'overworld') {
    state.orbitTarget = [0, 7, 0];
    state.orbitDist = 28;
  } else {
    state.orbitTarget = [0, 1.2, 0];
    state.orbitDist = 20;
    state.walkPos = [0, 1.6, -8];
  }
  rebuildScene();
}

function setCamMode(mode) {
  state.camMode = mode;
  document.getElementById('btnCamOrbit').classList.toggle('on', mode === 'orbit');
  document.getElementById('btnCamWalk').classList.toggle('on', mode === 'walk');
}

document.getElementById('tabBlueprint').addEventListener('click', () => setTab('blueprint'));
document.getElementById('tabCatalog').addEventListener('click', () => setTab('catalog'));
document.getElementById('btnViewExt').addEventListener('click', () => setViewMode('exterior'));
document.getElementById('btnViewInt').addEventListener('click', () => setViewMode('interior'));
document.getElementById('btnViewOw').addEventListener('click', () => setViewMode('overworld'));
document.getElementById('btnCamOrbit').addEventListener('click', () => setCamMode('orbit'));
document.getElementById('btnCamWalk').addEventListener('click', () => setCamMode('walk'));
document.getElementById('btnCamReset').addEventListener('click', () => setViewMode(state.viewMode));

dom.presetSel.addEventListener('change', () => {
  const found = MINI_DUNGEON_SAMPLE_BLUEPRINTS.find((b) => b.id === dom.presetSel.value);
  if (found) loadBlueprintIntoEditor(found, true);
});
dom.climateSel.addEventListener('change', () => {
  state.climateBase = Number(dom.climateSel.value);
  rebuildScene();
});
dom.seasonSel.addEventListener('change', () => {
  state.season = Number(dom.seasonSel.value);
  rebuildScene();
});
dom.groundSel.addEventListener('change', () => {
  state.groundMode = dom.groundSel.value;
  rebuildScene();
});
dom.slopeDeg.addEventListener('input', () => {
  state.slopeDeg = Number(dom.slopeDeg.value);
  dom.slopeVal.textContent = `${state.slopeDeg}\u00b0`;
  rebuildScene();
});
dom.chkCutaway.addEventListener('change', () => {
  state.cutaway = dom.chkCutaway.checked;
  rebuildScene();
});
dom.chkMarkers.addEventListener('change', () => {
  state.showMarkers = dom.chkMarkers.checked;
  rebuildScene();
});
dom.chkWire.addEventListener('change', () => {
  state.wireframe = dom.chkWire.checked;
});
dom.chkMinimap.addEventListener('change', () => {
  state.showMinimap = dom.chkMinimap.checked;
  dom.minimapSec.classList.toggle('hidden', !state.showMinimap);
  drawMinimap();
});

document.getElementById('btnApplyJson').addEventListener('click', () => {
  try {
    const parsed = JSON.parse(dom.jsonEditor.value);
    const v = validateMiniDungeonBlueprint(parsed);
    showValidation(v);
    if (v.ok) {
      state.blueprint = parsed;
      rebuildScene();
    }
  } catch (err) {
    showValidation({ ok: false, errors: [`JSON parse error: ${err.message}`], warnings: [] });
  }
});

document.getElementById('btnExportJson').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.blueprint, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.blueprint.id || 'mini-location'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

document.getElementById('jsonPick').addEventListener('change', async (e) => {
  const file = /** @type {any} */ (e.target).files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    loadBlueprintIntoEditor(parsed, true);
  } catch (err) {
    showValidation({ ok: false, errors: [`Failed to read JSON: ${err.message}`], warnings: [] });
  }
});

dom.catSel.addEventListener('change', () => {
  state.catalogCategory = dom.catSel.value;
  renderCatalogList();
});

document.getElementById('btnInspectId').addEventListener('click', () => {
  const id = Number(dom.modelIdInput.value);
  if (!Number.isFinite(id) || id <= 0) return;
  state.catalogModelId = id;
  renderCatalogList();
  rebuildScene();
});

document.getElementById('btnScanEntrances').addEventListener('click', () => {
  if (!store.arch3d) {
    dom.catInfo.textContent = 'Load ARENA2 first before scanning ARCH3D.BSA.';
    return;
  }
  const found = [];
  const count = store.arch3d.count;
  for (let i = 0; i < count; i++) {
    try {
      const dfMesh = store.arch3d.getMesh(i);
      if (!dfMesh || !meshHasDungeonEntrance(dfMesh)) continue;
      const id = store.arch3d.getRecordId(i);
      let doorCount = 0;
      for (const sm of dfMesh.subMeshes ?? []) {
        if (sm.textureArchive === 56 || (sm.textureArchive === 331 && sm.textureRecord > 0)) {
          doorCount += sm.planes?.length ?? 0;
        }
      }
      found.push({ id, label: `Dungeon Entrance (${Math.round(dfMesh.size.x * GLOBAL_SCALE)}x${Math.round(dfMesh.size.y * GLOBAL_SCALE)}m)`, doors: Math.max(1, doorCount) });
    } catch {
      // Skip malformed ARCH3D records
    }
  }
  state.scannedEntrances = found;
  state.catalogCategory = 'scannedEntrances';
  dom.catSel.value = 'scannedEntrances';
  renderCatalogList();
  dom.catInfo.textContent = `Scanned ${count} ARCH3D records: found ${found.length} models with DOOR_TYPE.DUNGEON_ENTRANCE.`;
});

function showError(msg) {
  if (!dom.errBanner) return;
  if (!msg) {
    dom.errBanner.classList.remove('on');
    dom.errBanner.textContent = '';
    return;
  }
  dom.errBanner.classList.add('on');
  dom.errBanner.textContent = String(msg);
}

function setProgress(pct, text) {
  if (!dom.loadProgWrap || !dom.loadProgBar || !dom.loadProgText) return;
  if (pct == null) {
    dom.loadProgWrap.classList.remove('on');
    return;
  }
  dom.loadProgWrap.classList.add('on');
  dom.loadProgBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  dom.loadProgText.textContent = text || `${pct}%`;
}

window.addEventListener('error', (e) => {
  showError(`Runtime error: ${e.message || e.error || 'Unknown error'}`);
});
window.addEventListener('unhandledrejection', (e) => {
  showError(`Async error: ${e.reason?.message || e.reason || 'Unhandled rejection'}`);
});

async function indexDirHandle(dirHandle) {
  const handles = new Map();
  let count = 0;
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      handles.set(entry.name.toUpperCase(), entry);
      count++;
    }
  }
  return { handles, count };
}

// ARENA2 Loaders (Fast File System Access API, fallback folder picker, Dev /arena2/, Drag & Drop)
document.getElementById('btnSelectArena').addEventListener('click', async () => {
  showError('');
  const showDir = /** @type {any} */ (window).showDirectoryPicker;
  if (typeof showDir === 'function') {
    try {
      const dirHandle = await showDir({ mode: 'read' });
      setProgress(5, 'Scanning ARENA2 folder...');
      dom.arenaStatus.textContent = 'Scanning ARENA2 folder...';
      const { handles, count } = await indexDirHandle(dirHandle);
      await store.loadCoreFromHandles(handles, setProgress);
      dom.arenaStatus.textContent = `ARENA2 ready (${store.arch3d.count} ARCH3D models from ${count} indexed files).`;
      setTimeout(() => setProgress(null, ''), 600);
      rebuildScene();
      return;
    } catch (err) {
      setProgress(null, '');
      if (err?.name === 'AbortError') return;
      showError(`Folder picker error: ${err.message}`);
      return;
    }
  }
  /** @type {any} */ (document.getElementById('arenaPick')).click();
});

document.getElementById('arenaPick').addEventListener('change', async (e) => {
  showError('');
  const files = /** @type {any} */ (e.target).files;
  if (!files?.length) return;
  setProgress(5, `Indexing ${files.length} files...`);
  dom.arenaStatus.textContent = `Loading ${files.length} files...`;
  try {
    await store.loadCoreFromLocal(files, setProgress);
    dom.arenaStatus.textContent = `ARENA2 ready (${store.arch3d.count} ARCH3D models, local files).`;
    setTimeout(() => setProgress(null, ''), 600);
    rebuildScene();
  } catch (err) {
    setProgress(null, '');
    showError(`Load error: ${err.message}`);
    dom.arenaStatus.textContent = `Error: ${err.message}`;
  }
});

document.getElementById('btnDevArena2').addEventListener('click', async () => {
  showError('');
  setProgress(10, 'Fetching from ./arena2/...');
  dom.arenaStatus.textContent = 'Fetching ART_PAL.COL & ARCH3D.BSA from ./arena2/...';
  try {
    await store.loadCoreFromDev(setProgress);
    dom.arenaStatus.textContent = `ARENA2 ready via /arena2/ (${store.arch3d.count} ARCH3D models).`;
    setTimeout(() => setProgress(null, ''), 600);
    rebuildScene();
  } catch (err) {
    setProgress(null, '');
    showError(`Dev /arena2/ unavailable: ${err.message}`);
    dom.arenaStatus.textContent = 'Dev /arena2/ unavailable. Use "Select ARENA2 Folder" or drop folder.';
  }
});

const dropOverlay = document.getElementById('dropOverlay');
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('on');
});
window.addEventListener('dragleave', (e) => {
  if (e.relatedTarget == null) dropOverlay.classList.remove('on');
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('on');
  showError('');
  const items = e.dataTransfer?.items;
  if (!items?.length) return;

  // Prefer FileSystemHandle for instant zero-upload folder drop in Chrome/Edge
  const firstItem = /** @type {any} */ (items[0]);
  if (typeof firstItem?.getAsFileSystemHandle === 'function') {
    try {
      const handle = await firstItem.getAsFileSystemHandle();
      if (handle?.kind === 'directory') {
        setProgress(5, 'Scanning dropped ARENA2 folder...');
        const { handles, count } = await indexDirHandle(handle);
        await store.loadCoreFromHandles(handles, setProgress);
        dom.arenaStatus.textContent = `ARENA2 ready (${store.arch3d.count} ARCH3D models from ${count} dropped files).`;
        setTimeout(() => setProgress(null, ''), 600);
        rebuildScene();
        return;
      }
    } catch {
      // Fall through to webkitGetAsEntry / FileList
    }
  }

  const collected = [];
  const walk = async (entry) => {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise((res) => entry.file((f) => { collected.push(f); res(null); }));
    } else if (entry.isDirectory) {
      const rd = entry.createReader();
      let batch = [];
      do {
        batch = await new Promise((res) => rd.readEntries(res));
        for (const child of batch) await walk(child);
      } while (batch.length > 0);
    }
  };
  for (const it of items) {
    const en = it.webkitGetAsEntry?.();
    if (en) await walk(en);
    else {
      const f = it.getAsFile?.();
      if (f) collected.push(f);
    }
  }
  if (collected.length === 1 && /\.json$/i.test(collected[0].name)) {
    try {
      const parsed = JSON.parse(await collected[0].text());
      setTab('blueprint');
      loadBlueprintIntoEditor(parsed, true);
    } catch (err) {
      showValidation({ ok: false, errors: [`Dropped JSON error: ${err.message}`], warnings: [] });
    }
    return;
  }
  if (collected.length > 0) {
    setProgress(5, `Indexing ${collected.length} dropped files...`);
    dom.arenaStatus.textContent = `Loading ${collected.length} dropped files...`;
    try {
      await store.loadCoreFromLocal(collected, setProgress);
      dom.arenaStatus.textContent = `ARENA2 ready (${store.arch3d.count} ARCH3D models, dropped folder).`;
      setTimeout(() => setProgress(null, ''), 600);
      rebuildScene();
    } catch (err) {
      setProgress(null, '');
      showError(`Drop error: ${err.message}`);
      dom.arenaStatus.textContent = `Drop error: ${err.message}`;
    }
  }
});

// ---------------------------------------------------------------------------
// Camera Input (Orbit + Walk WASD)
// ---------------------------------------------------------------------------
let dragging = false;
let dragButton = 0;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  dragging = true;
  dragButton = e.button;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.focus();
});
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;

  if (state.camMode === 'walk') {
    state.walkYaw -= dx * 0.005;
    state.walkPitch = Math.max(-1.4, Math.min(1.4, state.walkPitch - dy * 0.005));
    return;
  }

  if (dragButton === 2 || e.shiftKey) {
    const panSpeed = state.orbitDist * 0.0015;
    const rx = Math.cos(state.orbitYaw);
    const rz = -Math.sin(state.orbitYaw);
    state.orbitTarget[0] -= dx * panSpeed * rx;
    state.orbitTarget[2] -= dx * panSpeed * rz;
    state.orbitTarget[1] += dy * panSpeed;
  } else {
    state.orbitYaw -= dx * 0.007;
    state.orbitPitch = Math.max(-1.35, Math.min(1.45, state.orbitPitch + dy * 0.007));
  }
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (state.camMode === 'orbit') {
    state.orbitDist = Math.max(2, Math.min(90, state.orbitDist * (1 + e.deltaY * 0.001)));
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (document.activeElement === dom.jsonEditor || document.activeElement === dom.modelIdInput) return;
  state.keys.add(e.code);
});
window.addEventListener('keyup', (e) => state.keys.delete(e.code));

// ---------------------------------------------------------------------------
// Frame Loop
// ---------------------------------------------------------------------------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (state.camMode === 'walk') {
    const speed = (state.keys.has('ShiftLeft') ? 10 : 5) * dt;
    const fx = Math.sin(state.walkYaw);
    const fz = Math.cos(state.walkYaw);
    const rx = Math.cos(state.walkYaw);
    const rz = -Math.sin(state.walkYaw);
    if (state.keys.has('KeyW')) {
      state.walkPos[0] += fx * speed;
      state.walkPos[2] += fz * speed;
    }
    if (state.keys.has('KeyS')) {
      state.walkPos[0] -= fx * speed;
      state.walkPos[2] -= fz * speed;
    }
    if (state.keys.has('KeyA')) {
      state.walkPos[0] += rx * speed;
      state.walkPos[2] += rz * speed;
    }
    if (state.keys.has('KeyD')) {
      state.walkPos[0] -= rx * speed;
      state.walkPos[2] -= rz * speed;
    }
    if (state.keys.has('KeyE')) state.walkPos[1] += speed;
    if (state.keys.has('KeyQ')) state.walkPos[1] -= speed;
  }

  const aspect = renderer.resizeIfNeeded();
  const proj = mat4Perspective(60 * DEG2RAD, aspect, 0.15, 250);
  let eye;
  let target;
  if (state.camMode === 'walk') {
    eye = state.walkPos;
    const cp = Math.cos(state.walkPitch);
    target = [
      eye[0] + Math.sin(state.walkYaw) * cp,
      eye[1] + Math.sin(state.walkPitch),
      eye[2] + Math.cos(state.walkYaw) * cp,
    ];
  } else {
    const cp = Math.cos(state.orbitPitch);
    eye = [
      state.orbitTarget[0] + Math.sin(state.orbitYaw) * cp * state.orbitDist,
      state.orbitTarget[1] + Math.sin(state.orbitPitch) * state.orbitDist,
      state.orbitTarget[2] + Math.cos(state.orbitYaw) * cp * state.orbitDist,
    ];
    target = state.orbitTarget;
  }
  const view = mat4LookAt(eye, target, [0, 1, 0]);
  const vp = mat4Mul(proj, view);

  // Orient billboard flats toward camera yaw
  const camYaw = Math.atan2(eye[0] - target[0], eye[2] - target[2]);
  for (const fl of state.flatCmds) {
    fl.matrix = mat4Trs(fl.x, fl.y, fl.z, camYaw, fl.w, fl.h, 1);
  }

  renderer.render(vp, state.drawCmds, state.flatCmds, state.colorTris, state.colorLines, state.wireframe);
  requestAnimationFrame(frame);
}

// Init
populatePresetSelect();
renderCatalogList();
loadBlueprintIntoEditor(MINI_DUNGEON_SAMPLE_BLUEPRINTS[0], true);
dom.arenaStatus.textContent = 'Viewer ready (WebGL2). Select or drop ARENA2 folder, or click Load /arena2 (dev).';
requestAnimationFrame(frame);
