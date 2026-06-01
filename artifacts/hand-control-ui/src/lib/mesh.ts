export type Vertex = { x: number; y: number; z: number };
export type Face   = { indices: number[]; color: [number, number, number] };
export type Mesh   = { verts: Vertex[]; faces: Face[] };

const PALETTE: [number, number, number][] = [
  [255, 229,   0], [255, 160,   0], [255, 200,  30],
  [255, 240, 100], [255, 255, 160], [180, 140, 255],
  [100, 200, 255], [255, 120, 150],
];

function col(i: number): [number, number, number] {
  return PALETTE[i % PALETTE.length];
}

export function cloneMesh(m: Mesh): Mesh {
  return {
    verts: m.verts.map(v => ({ ...v })),
    faces: m.faces.map(f => ({ ...f, indices: [...f.indices], color: [...f.color] as [number,number,number] })),
  };
}

// ── Primitives ────────────────────────────────────────────────────────────────

export function makeCube(): Mesh {
  return {
    verts: [
      { x: -1, y: -1, z: -1 }, { x:  1, y: -1, z: -1 },
      { x:  1, y:  1, z: -1 }, { x: -1, y:  1, z: -1 },
      { x: -1, y: -1, z:  1 }, { x:  1, y: -1, z:  1 },
      { x:  1, y:  1, z:  1 }, { x: -1, y:  1, z:  1 },
    ],
    faces: [
      { indices: [4,5,6,7], color: [255,229,  0] },
      { indices: [1,0,3,2], color: [255,160,  0] },
      { indices: [0,4,7,3], color: [255,200, 30] },
      { indices: [5,1,2,6], color: [255,240,100] },
      { indices: [7,6,2,3], color: [255,255,160] },
      { indices: [0,1,5,4], color: [180,140,255] },
    ],
  };
}

function normalizeVec(v: Vertex): Vertex {
  const l = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z) || 1;
  return { x: v.x/l, y: v.y/l, z: v.z/l };
}

export function makeIcosphere(subdivisions = 1): Mesh {
  const φ = (1 + Math.sqrt(5)) / 2;
  const verts: Vertex[] = [
    { x: -1, y:  φ, z:  0 }, { x:  1, y:  φ, z:  0 },
    { x: -1, y: -φ, z:  0 }, { x:  1, y: -φ, z:  0 },
    { x:  0, y: -1, z:  φ }, { x:  0, y:  1, z:  φ },
    { x:  0, y: -1, z: -φ }, { x:  0, y:  1, z: -φ },
    { x:  φ, y:  0, z: -1 }, { x:  φ, y:  0, z:  1 },
    { x: -φ, y:  0, z: -1 }, { x: -φ, y:  0, z:  1 },
  ].map(normalizeVec);

  let triIdx: [number,number,number][] = [
    [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
    [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
    [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
  ];

  for (let s = 0; s < subdivisions; s++) {
    const cache = new Map<string, number>();
    const next: [number,number,number][] = [];

    const mid = (a: number, b: number): number => {
      const key = `${Math.min(a,b)}_${Math.max(a,b)}`;
      if (cache.has(key)) return cache.get(key)!;
      const va = verts[a], vb = verts[b];
      const m = normalizeVec({ x: (va.x+vb.x)/2, y: (va.y+vb.y)/2, z: (va.z+vb.z)/2 });
      const idx = verts.push(m) - 1;
      cache.set(key, idx);
      return idx;
    };

    for (const [a,b,c] of triIdx) {
      const ab = mid(a,b), bc = mid(b,c), ca = mid(c,a);
      next.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
    }
    triIdx = next;
  }

  return {
    verts,
    faces: triIdx.map((idx, i) => ({ indices: [...idx], color: col(i) })),
  };
}

export function makeNgon(n = 6, height = 1.2): Mesh {
  const verts: Vertex[] = [];
  const faces: Face[]   = [];

  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    verts.push({ x: Math.cos(a), y:  height / 2, z: Math.sin(a) });
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    verts.push({ x: Math.cos(a), y: -height / 2, z: Math.sin(a) });
  }

  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    faces.push({ indices: [i, next, n+next, n+i], color: col(i) });
  }

  verts.push({ x: 0, y:  height/2, z: 0 });
  const top = verts.length - 1;
  for (let i = 0; i < n; i++)
    faces.push({ indices: [top, i, (i+1)%n], color: col(n) });

  verts.push({ x: 0, y: -height/2, z: 0 });
  const bot = verts.length - 1;
  for (let i = 0; i < n; i++)
    faces.push({ indices: [bot, n+(i+1)%n, n+i], color: col(n+1) });

  return { verts, faces };
}

// ── OBJ parser ────────────────────────────────────────────────────────────────

export function parseOBJ(text: string): Mesh | null {
  const rawVerts: Vertex[] = [];
  const faces:    Face[]   = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('v ')) {
      const p = line.split(/\s+/);
      const x = parseFloat(p[1]), y = parseFloat(p[2]), z = parseFloat(p[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) rawVerts.push({ x, y, z });
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1);
      const indices = parts.map(p => {
        const i = parseInt(p.split('/')[0]);
        return i > 0 ? i - 1 : rawVerts.length + i;
      });
      if (indices.length >= 3 && indices.every(i => !isNaN(i) && i >= 0 && i < rawVerts.length))
        faces.push({ indices, color: col(faces.length) });
    }
  }

  if (rawVerts.length === 0 || faces.length === 0) return null;

  const cx = rawVerts.reduce((s,v) => s+v.x, 0) / rawVerts.length;
  const cy = rawVerts.reduce((s,v) => s+v.y, 0) / rawVerts.length;
  const cz = rawVerts.reduce((s,v) => s+v.z, 0) / rawVerts.length;
  const maxR = Math.max(...rawVerts.map(v =>
    Math.sqrt((v.x-cx)**2 + (v.y-cy)**2 + (v.z-cz)**2))) || 1;

  return {
    verts: rawVerts.map(v => ({ x: (v.x-cx)/maxR, y: (v.y-cy)/maxR, z: (v.z-cz)/maxR })),
    faces,
  };
}
