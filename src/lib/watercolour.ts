// Live watercolour for the whole app: one canvas behind the page paints every wash,
// fleck, timeline run, wet drop and soaked-in photo that the visible screen needs.
// Pigments mix subtractively (Beer–Lambert), keep flowing slowly, and dry when a US is quiet.

export interface Drop {
  /** position and radius in units of the wash's size */
  x: number;
  y: number;
  r: number;
  color: string;
  /** pigment load, 0..1 */
  alpha?: number;
  /** stretch (>1 makes a stroke) and its angle in radians */
  aspect?: number;
  angle?: number;
}

export interface Wash {
  /** centre and half-size in CSS px, relative to the viewport */
  x: number;
  y: number;
  s: number;
  /** how fast it flows; 0 = dried */
  flow: number;
  seed: number;
  strength?: number;
  /** how far it has spread from a single drop, 0..1 (omitted = fully spread) */
  growth?: number;
  drops: Drop[];
}

export interface Ribbon {
  c1: string;
  c2: string;
  alpha?: number;
  /** [x, y, half-width, strength] in viewport CSS px */
  pts: [number, number, number, number][];
  /** viewport y where the run starts (newest end) */
  top: number;
}

export interface Bead {
  x: number;
  y: number;
  r: number;
  color: string;
}

/** A photo soaked into a wash: it shows where the paint is; the wet edge stays paint. */
export interface Soak {
  /** the photo, already cropped square to PHOTO_SIDE (a canvas, so the crop is done once) */
  image: HTMLCanvasElement;
  /** how strongly the photo shows, and how much of the wash's own pigment stays on it */
  k?: [number, number];
}

export interface Scene {
  washes: (Wash & { photo?: Soak | null })[];
  ribbon?: Ribbon | null;
  bead?: Bead | null;
}

export interface Bloom {
  x: number;
  y: number;
  start: number;
  r: number;
}

export const MAX_DROPS = 32;
/** Photos live in one atlas texture: 4 × 4 slots of 512 px, so a screen can show up to 16 at once. */
export const PHOTO_SIDE = 512;
const ATLAS_GRID = 4;
const MAX_RIBBON = 16;

// The paper's grain doesn't move: it comes from a small noise texture made once, not from
// noise computed for every pixel of every frame.
const GRAIN_SIDE = 256;
const GRAIN_GLSL = [
  'float gn(vec2 x){return texture2D(uGrain,x/256.).r*1.4-.7;}',
  'float gfbm(vec2 x){return .5*gn(x)+.25*gn(R*x+vec2(37.,11.))+.125*gn(R*R*x+vec2(5.,71.));}',
  '#define PAPER (.975+.02*gfbm(pp*.08)+.012*gn(pp*1.7))',
].join('\n');

/** Bare paper, for everywhere no paint lies: the same colour the paint shader gives an empty spot. */
const FS_PAPER = [
  'precision highp float;',
  'uniform vec2 uRes;uniform float uDpr;uniform vec2 uScroll;uniform float uDark;',
  'uniform vec3 uPaper;uniform vec3 uPaperDark;uniform sampler2D uGrain;',
  'const mat2 R=mat2(1.6,1.2,-1.2,1.6);',
  GRAIN_GLSL,
  'void main(){vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;vec2 pp=p+uScroll;',
  ' float paper=PAPER;vec3 col=uPaper*paper;',
  ' if(uDark>.5){vec3 h=col/max(uPaper,vec3(.01));float a=clamp(max(max(1.-h.r,1.-h.g),1.-h.b)*1.25,0.,1.);',
  '  col=mix(uPaperDark*(.94+.06*paper/.99),h*.9,a);}',
  ' gl_FragColor=vec4(col,1.);}',
].join('\n');

const FS = [
  'precision highp float;',
  'uniform vec2 uRes;uniform float uDpr;uniform float uTime;uniform int uN;',
  // one entry per drop: shape, pigment, and its US (group) so the loop never nests
  'uniform vec4 uD[32];uniform vec4 uDK[32];uniform vec4 uDS[32];uniform vec4 uDG[32];uniform vec4 uDG2[32];',
  'uniform vec4 uBloom[4];uniform vec3 uPaper;uniform vec3 uBead;uniform vec3 uBeadK;',
  'uniform vec4 uRib[16];uniform int uNR;uniform vec3 uRibK1;uniform vec3 uRibK2;uniform float uRibTop;',
  'uniform sampler2D uPhoto;',
  'uniform vec2 uScroll;uniform float uDark;uniform vec3 uPaperDark;uniform sampler2D uGrain;',
  'vec2 hash(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return -1.+2.*fract(sin(p)*43758.5453123);}',
  'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
  ' return mix(mix(dot(hash(i),f),dot(hash(i+vec2(1,0)),f-vec2(1,0)),u.x),mix(dot(hash(i+vec2(0,1)),f-vec2(0,1)),dot(hash(i+vec2(1,1)),f-vec2(1,1)),u.x),u.y);}',
  'const mat2 R=mat2(1.6,1.2,-1.2,1.6);',
  'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p=R*p;a*=.5;}return s;}',
  'float fbm3(vec2 p){float s=0.,a=.5;for(int i=0;i<3;i++){s+=a*noise(p);p=R*p;a*=.5;}return s;}',
  'float fbm4(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=R*p;a*=.5;}return s;}',
  GRAIN_GLSL,
  'void main(){',
  ' vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uDpr;',
  // paper grain and the timeline's currents belong to the page, so they scroll with it
  ' vec2 pp=p+uScroll;',
  // blooms: a drop of clean water pushes pigment outward and leaves a darker rim
  ' float dil=0.,brim=0.;',
  ' for(int b=0;b<4;b++){vec4 B=uBloom[b];if(B.w<=0.)continue;float age=max(uTime-B.z,0.);',
  '  float rad=B.w*(1.-exp(-age*1.1));vec2 dv=p-B.xy;float d=length(dv);',
  '  float jag=1.+.42*fbm(dv/B.w*2.6+B.z);float rr=rad*jag;',
  '  if(d<rr*1.25){p-=normalize(dv+1e-4)*rr*.32*smoothstep(rr*1.25,0.,d);}',
  '  dil=max(dil,smoothstep(rr,rr*.1,d)*.45);brim+=exp(-pow((d-rr)/(1.3+rr*.035),2.))*.75*smoothstep(0.,.6,age);}',
  ' vec3 od=vec3(0.);float pm=0.,ps=-1.,pkx=.5,pky=.45;vec3 pg=vec3(0.);',
  ' float dn[33];float mm[33];float gi[33];float rt[33];gi[32]=-1.;',
  ' float lastG=-1.,run=0.,T=0.,wet=0.,near=0.,gsc=1.;vec2 s=vec2(0.),w=vec2(0.),w2=vec2(0.);',
  // pass 1: each drop's density; the flow field is computed once per US and reused by its drops
  ' for(int i=0;i<32;i++){dn[i]=0.;mm[i]=0.;gi[i]=-1.;rt[i]=0.;',
  '  if(i>=uN)break;',
  '  vec4 D=uD[i];vec4 G=uDG[i];vec4 G2=uDG2[i];vec4 K=uDK[i];vec4 S=uDS[i];gi[i]=D.w;',
  '  if(S.z>-.5&&S.w>.99){lastG=D.w;run=1.;rt[i]=run;continue;}',
  '  if(D.w!=lastG){lastG=D.w;run=0.;',
  '   s=(p-G.xy)/G.z;near=dot(s,s)<4.?1.:0.;',
  '   if(near>.5){T=uTime*G.w*.6+G2.x*37.;gsc=G2.w>0.?max(.03,G2.w):1.;',
  '    vec2 q=vec2(fbm4(s*1.2+vec2(0.,T*.5)),fbm4(s*1.2+vec2(5.2,1.3)-vec2(T*.42,0.)));',
  '    vec2 r=vec2(fbm4(s*1.2+2.4*q+vec2(1.7,9.2)+T*.2),fbm4(s*1.2+2.4*q+vec2(8.3,2.8)-T*.17));',
  '    w=s+.62*r;',
  '    w2=w+.3*vec2(fbm3(w*3.4+vec2(T*.9,0.)),fbm3(w*3.4+vec2(4.4,T*.8)));',
  '    wet=smoothstep(-.3,.3,fbm3(w*1.3+vec2(3.1,7.7)+G2.x));}}',
  '  if(near<.5){rt[i]=run;continue;}',
  '  vec2 dv=mix(w,w2,.35+.65*wet)-D.xy;float ca=cos(S.y),sa=sin(S.y);dv=mat2(ca,sa,-sa,ca)*dv;dv.y*=S.x;',
  // far from this drop nothing of it can show (its ragged edge reaches ~1.55): skip the noise
  '  float d0=length(dv)/(D.z*gsc);if(d0>1.72){rt[i]=run;continue;}',
  '  float e=fbm3(s*3.+K.w*11.)*.16;',
  '  float d=d0+e;',
  '  float soft=1.-smoothstep(.42,1.06,d);',
  '  float hard=smoothstep(1.,.965,d)*(.55+.7*smoothstep(.55,.97,d));',
  '  float dens=mix(hard,soft,wet);',
  '  float strand=pow(max(fbm4(w2*5.5+K.w*3.),0.)*2.2,1.5);',
  '  float tail=smoothstep(1.5,.9,d)*strand*.6*wet;',
  '  float pool=fbm3(w2*vec2(2.2,4.4)+K.w)*.5+.5;',
  '  dens=dens*(.6+.62*pool)+tail*(1.-soft);',
  '  if(dens>.001)mm[i]=smoothstep(-.28,.3,fbm3(w2*2.1+vec2(K.w*5.,T*.5)));',
  '  dn[i]=dens;run+=dens;rt[i]=run;}',
  // pass 2, backwards: where two pigments of one US meet they braid instead of a flat overlap
  ' float cur=0.;',
  ' for(int k=0;k<32;k++){if(31-k>=uN)continue;',
  // at the end of each wash (walking backwards) its total density is known: the photo of the
  // densest photo-wash under this pixel is the one that shows
  '  if(gi[31-k]!=gi[32-k]){cur=rt[31-k];vec4 S=uDS[31-k];',
  '   if(S.z>-.5&&cur>pm){pm=cur;ps=S.z;pkx=S.w;pky=uDG2[31-k].z;pg=uDG[31-k].xyz;}}',
  '  if(dn[31-k]<=0.)continue;',
  '  float other=clamp((cur-dn[31-k])*1.4,0.,1.);',
  '  float dd=dn[31-k]*mix(1.,.3+.95*mm[31-k],other);',
  '  od+=uDK[31-k].rgb*dd*uDG2[31-k].y;}',
  // a run of paint down the page: two pigments side by side, wet at the top, dry further down
  ' if(uNR>1){',
  '  float age=clamp((p.y-uRibTop)/900.,0.,1.);float Tr=uTime*.05*(1.-age)+3.;',
  '  vec2 sp=pp/64.;vec2 q=vec2(fbm(sp+vec2(0.,Tr)),fbm(sp+vec2(5.2,1.3)-vec2(Tr,0.)));',
  '  vec2 pw=pp+16.*q-uScroll;',
  '  float best=1e5,side=0.,wid=1.,str=1.;',
  '  for(int j=0;j<15;j++){if(j+1>=uNR)break;vec4 A=uRib[j],B=uRib[j+1];vec2 ab=B.xy-A.xy;',
  '   float h=clamp(dot(pw-A.xy,ab)/dot(ab,ab),0.,1.);vec2 dd=pw-A.xy-ab*h;float dl=length(dd);',
  '   if(dl<best){best=dl;side=sign(ab.x*dd.y-ab.y*dd.x)*dl;wid=mix(A.z,B.z,h);str=mix(A.w,B.w,h);}}',
  '  float rd=best/wid+fbm((pw+uScroll)*.06)*.6+fbm((pw+uScroll)*.2)*.18;',
  '  if(rd<1.4){float dens=1.-smoothstep(.5,1.,rd);',
  '   dens*=(.68+.5*(fbm((pw+uScroll)*vec2(.05,.018)+q)*.5+.5))*(1.+.45*smoothstep(.6,.96,rd));',
  '   float wl=smoothstep(-.9,.9,side/wid*.7+1.7*fbm((pw+uScroll)*.035+vec2(0.,Tr*1.5)));',
  '   od+=mix(uRibK1,uRibK2,wl)*dens*str;}',
  ' }',
  ' float gran=gn(pp*.9)*.5+gn(pp*2.3)*.3;',
  ' od*=(1.-dil)*(1.+brim)*(.9+.32*gran);',
  ' float paper=PAPER;',
  ' vec3 col=uPaper*paper*exp(-od);',
  // a bead of clean water resting on the paper
  // a photo soaked into the wash: it shows where the paint is, the wet edge stays paint
  // (k.x >= 1: a photo set into paint, left exactly as it is; where the pigment lies thick the
  // paper and paint show instead, so the paint's own edge is the photo's edge)
  ' float phm=0.;vec3 pcol=vec3(0.);',
  ' if(ps>-.5){vec2 uv=(p-(pg.xy-pg.z*1.02))/(pg.z*2.04);',
  '  if(uv.x>0.&&uv.y>0.&&uv.x<1.&&uv.y<1.){',
  '   vec2 cell=vec2(mod(ps,4.),floor(ps/4.));vec3 ph=texture2D(uPhoto,(cell+clamp(uv,.003,.997))/4.).rgb;',
  '   float m=smoothstep(.22,.75,pm);',
  '   if(pkx>.99){float th=max(od.r,max(od.g,od.b));phm=m*(1.-smoothstep(.06,.42,th));pcol=ph;col=mix(col,ph,phm);}',
  '   else{vec3 odp=-log(max(ph,vec3(.04)))*pkx;col=uPaper*paper*exp(-mix(od,odp+od*pky,m));}}}',
  ' if(uBead.z>0.){vec2 bd=p-uBead.xy;float br=uBead.z;vec2 n=normalize(bd+1e-4);',
  '  float jag=1.+.22*fbm3(n*1.3+vec2(3.,1.))+.02*sin(uTime*.9+atan(bd.y,bd.x)*2.);',
  '  float d=length(bd*vec2(1.,1.18))/(br*jag);',
  '  float inside=smoothstep(1.,.94,d);',
  '  col*=1.-.07*exp(-pow((d-1.06)/.07,2.))*max(dot(n,vec2(.55,.83)),0.);',
  '  vec3 bc=col*exp(-uBeadK*(.8+.7*smoothstep(.6,.98,d)));',
  '  float cres=smoothstep(.58,.84,d)*smoothstep(.97,.84,d)*pow(max(dot(n,vec2(-.6,-.8)),0.),2.5);',
  '  float spec=exp(-pow(length(bd/br-vec2(-.24,-.32))/.065,2.));',
  '  bc+=.18*cres+.75*spec;',
  '  col=mix(col,bc,inside);}',
  // dark paper: lay the same pigment down as if on black paper, keeping each colour's hue
  ' if(uDark>.5){vec3 h=col/max(uPaper,vec3(.01));float a=clamp(max(max(1.-h.r,1.-h.g),1.-h.b)*1.25,0.,1.);',
  '  col=mix(uPaperDark*(.94+.06*paper/.99),h*.9,a);col=mix(col,pcol,phm);}',
  ' gl_FragColor=vec4(col,1.);}'
].join('\n');

const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

type Box = [number, number, number, number];

/**
 * Where paint can show, in CSS px: around each wash (as far as its flow reaches), the run,
 * the wet bead and any blooms. Overlapping boxes are merged so no pixel is painted twice.
 */
function paintBoxes(scene: Scene, blooms: Bloom[], width: number, height: number): Box[] {
  const raw: Box[] = [];
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const b: Box = [Math.max(0, x0), Math.max(0, y0), Math.min(width, x1), Math.min(height, y1)];
    if (b[2] > b[0] && b[3] > b[1]) raw.push(b);
  };
  for (const g of scene.washes) {
    // the flow carries paint out to ~1.6 of the wash's size
    const r = g.s * 1.75 + 6;
    add(g.x - r, g.y - r, g.x + r, g.y + r);
  }
  const rib = scene.ribbon;
  if (rib && rib.pts.length > 1) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, wd = 0;
    for (const [x, y, w] of rib.pts.slice(0, MAX_RIBBON)) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); wd = Math.max(wd, w);
    }
    const m = wd * 1.6 + 40;
    add(x0 - m, y0 - m, x1 + m, y1 + m);
  }
  const b = scene.bead;
  if (b) add(b.x - b.r * 1.4, b.y - b.r * 1.4, b.x + b.r * 1.4, b.y + b.r * 1.4);
  for (const bl of blooms.slice(-4)) {
    const r = bl.r * 1.9 + 8;
    add(bl.x - r, bl.y - r, bl.x + r, bl.y + r);
  }
  // merge until nothing overlaps
  const boxes = raw;
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (a[0] <= c[2] && c[0] <= a[2] && a[1] <= c[3] && c[1] <= a[3]) {
          boxes[i] = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])];
          boxes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return boxes;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function absorb(hex: string, a: number): [number, number, number] {
  const c = rgb(hex);
  return [-Math.log(Math.max(c[0], 0.02)) * a, -Math.log(Math.max(c[1], 0.02)) * a, -Math.log(Math.max(c[2], 0.02)) * a];
}

export class Painter {
  private gl: WebGLRenderingContext;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private up: Record<string, WebGLUniformLocation | null> = {};
  private paintProgram!: WebGLProgram;
  private paperProgram!: WebGLProgram;
  private parallel: { COMPLETION_STATUS_KHR: number } | null = null;
  private shaders: WebGLShader[] = [];
  private isSetUp = false;
  private aD = new Float32Array(MAX_DROPS * 4);
  private aK = new Float32Array(MAX_DROPS * 4);
  private aS = new Float32Array(MAX_DROPS * 4);
  private aG = new Float32Array(MAX_DROPS * 4);
  private aG2 = new Float32Array(MAX_DROPS * 4);
  private aR = new Float32Array(MAX_RIBBON * 4);
  private aB = new Float32Array(16);
  private atlas: WebGLTexture | null = null;
  /** which photo sits in each atlas slot, and when it was last on screen */
  private slots: { image: HTMLCanvasElement | null; used: number }[] = Array.from(
    { length: ATLAS_GRID * ATLAS_GRID },
    () => ({ image: null, used: -1 }),
  );
  private frame = 0;
  private failed = new WeakSet<HTMLCanvasElement>();

  /** wait for the GPU to finish this frame (only for measuring) */
  finish() {
    // reading one pixel back forces the frame to actually be drawn before we stop the clock
    this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.probe);
  }
  private probe = new Uint8Array(4);
  /** CSS px² the paint shader covered last frame (for measuring) */
  paintedArea = 0;

  static create(canvas: HTMLCanvasElement): Painter | null {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: false });
    if (!gl) return null;
    try {
      return new Painter(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    // Compiling the paint takes a moment on a phone. Where the browser can do it in the
    // background, it does, and the paper waits (ready()); otherwise it happens right here,
    // before anything moves, rather than when the first drop lands.
    this.parallel = gl.getExtension('KHR_parallel_shader_compile');
    const shader = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      this.shaders.push(sh);
      return sh;
    };
    const link = (fs: string) => {
      const pr = gl.createProgram()!;
      gl.attachShader(pr, shader(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(pr);
      return pr;
    };
    this.paintProgram = link(FS);
    this.paperProgram = link(FS_PAPER);
    if (!this.parallel) this.setUp();
  }

  /** True once the paint is compiled and set up; false while the browser is still compiling. */
  ready(): boolean {
    if (this.isSetUp) return true;
    const done = this.parallel?.COMPLETION_STATUS_KHR ?? 0x91b1;
    const { gl } = this;
    if (!gl.getProgramParameter(this.paintProgram, done) || !gl.getProgramParameter(this.paperProgram, done)) return false;
    this.setUp();
    return true;
  }

  private setUp() {
    const { gl } = this;
    for (const sh of this.shaders) {
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
    }
    for (const pr of [this.paintProgram, this.paperProgram]) {
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
    }
    const pr = this.paintProgram;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    for (const prog of [pr, this.paperProgram]) {
      const loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    for (const n of ['uRes', 'uDpr', 'uScroll', 'uDark', 'uPaper', 'uPaperDark', 'uGrain']) {
      this.up[n] = gl.getUniformLocation(this.paperProgram, n);
    }

    // the grain: random values a linear filter turns into soft noise; wraps, so it tiles the page
    const grain = new Uint8Array(GRAIN_SIDE * GRAIN_SIDE);
    for (let i = 0; i < grain.length; i++) grain[i] = (Math.random() * 256) | 0;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, GRAIN_SIDE, GRAIN_SIDE, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, grain);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(this.paperProgram);
    gl.uniform1i(this.up.uGrain, 1);
    gl.useProgram(pr);
    for (const n of ['uRes', 'uDpr', 'uTime', 'uN', 'uD', 'uDK', 'uDS', 'uDG', 'uDG2', 'uBloom', 'uPaper', 'uBead',
      'uBeadK', 'uRib', 'uNR', 'uRibK1', 'uRibK2', 'uRibTop', 'uPhoto', 'uScroll', 'uDark',
      'uPaperDark', 'uGrain']) {
      this.u[n] = gl.getUniformLocation(pr, n);
    }
    gl.uniform1i(this.u.uPhoto, 0);
    gl.uniform1i(this.u.uGrain, 1);

    // draw one pixel with each, so the driver finishes its work now and not on the first drop
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    gl.uniform1i(this.u.uN, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(this.paperProgram);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.probe);
    this.isSetUp = true;
  }

  render(o: {
    scene: Scene;
    time: number;
    width: number;
    height: number;
    dpr: number;
    scrollY: number;
    blooms: Bloom[];
    paper: string;
    paperDark: string;
    dark: boolean;
  }) {
    const { gl, u } = this;
    const canvas = gl.canvas as HTMLCanvasElement;
    const w = Math.round(o.width * o.dpr);
    const h = Math.round(o.height * o.dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    const dpr = w / o.width;

    // bare paper everywhere (cheap)
    const { up } = this;
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.paperProgram);
    gl.uniform2f(up.uRes, w, h);
    gl.uniform1f(up.uDpr, dpr);
    gl.uniform2f(up.uScroll, 0, o.scrollY);
    gl.uniform3fv(up.uPaper, rgb(o.paper));
    gl.uniform3fv(up.uPaperDark, rgb(o.paperDark));
    gl.uniform1f(up.uDark, o.dark ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // then the paint, only inside the boxes where something lies
    const boxes = paintBoxes(o.scene, o.blooms, o.width, o.height);
    this.paintedArea = boxes.reduce((a, b) => a + (b[2] - b[0]) * (b[3] - b[1]), 0);
    if (!boxes.length) return;
    gl.useProgram(this.paintProgram);
    gl.uniform2f(u.uRes, w, h);
    gl.uniform1f(u.uDpr, w / o.width);
    gl.uniform1f(u.uTime, o.time);
    gl.uniform2f(u.uScroll, 0, o.scrollY);
    gl.uniform3fv(u.uPaper, rgb(o.paper));
    gl.uniform3fv(u.uPaperDark, rgb(o.paperDark));
    gl.uniform1f(u.uDark, o.dark ? 1 : 0);

    // drops, flattened; each carries its wash (and its wash's photo slot) so the shader never nests loops
    this.frame++;
    let n = 0;
    o.scene.washes.forEach((g, gi) => {
      const slot = g.photo ? this.slotFor(g.photo.image) : -1;
      const [kx, ky] = g.photo?.k ?? [0.5, 0.45];
      for (const d of g.drops) {
        if (n >= MAX_DROPS) return;
        const a = d.alpha ?? 0.8;
        this.aD.set([d.x, d.y, d.r, gi], n * 4);
        this.aK.set([...absorb(d.color, a), n * 1.37 + gi], n * 4);
        this.aS.set([d.aspect ?? 1, d.angle ?? 0, slot, kx], n * 4);
        this.aG.set([g.x, g.y, g.s, g.flow], n * 4);
        this.aG2.set([g.seed, g.strength ?? 1, ky, g.growth ?? 0], n * 4);
        n++;
      }
    });
    gl.uniform1i(u.uN, n);
    gl.uniform4fv(u.uD, this.aD);
    gl.uniform4fv(u.uDK, this.aK);
    gl.uniform4fv(u.uDS, this.aS);
    gl.uniform4fv(u.uDG, this.aG);
    gl.uniform4fv(u.uDG2, this.aG2);

    const r = o.scene.ribbon;
    if (r && r.pts.length > 1) {
      this.aR.fill(0);
      r.pts.slice(0, MAX_RIBBON).forEach((p, j) => this.aR.set(p, j * 4));
      gl.uniform4fv(u.uRib, this.aR);
      gl.uniform1i(u.uNR, Math.min(r.pts.length, MAX_RIBBON));
      gl.uniform3fv(u.uRibK1, absorb(r.c1, r.alpha ?? 0.85));
      gl.uniform3fv(u.uRibK2, absorb(r.c2, r.alpha ?? 0.85));
      gl.uniform1f(u.uRibTop, r.top);
    } else gl.uniform1i(u.uNR, 0);

    const b = o.scene.bead;
    gl.uniform3fv(u.uBead, b ? [b.x, b.y, b.r] : [0, 0, 0]);
    gl.uniform3fv(u.uBeadK, absorb(b ? b.color : '#ffffff', 1));

    this.aB.fill(0);
    o.blooms.slice(-4).forEach((bl, i) => this.aB.set([bl.x, bl.y, bl.start, bl.r], i * 4));
    gl.uniform4fv(u.uBloom, this.aB);

    gl.enable(gl.SCISSOR_TEST);
    for (const [x0, y0, x1, y1] of boxes) {
      gl.scissor(Math.floor(x0 * dpr), Math.floor(h - y1 * dpr), Math.ceil((x1 - x0) * dpr), Math.ceil((y1 - y0) * dpr));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  /**
   * The atlas slot holding this photo, uploading it into the least recently used slot if needed.
   * -1 when it cannot be painted (no CORS headers) or every slot is already in use this frame.
   */
  private slotFor(img: HTMLCanvasElement): number {
    if (img.width !== PHOTO_SIDE || this.failed.has(img)) return -1;
    const have = this.slots.findIndex((s) => s.image === img);
    if (have >= 0) {
      this.slots[have].used = this.frame;
      return have;
    }
    let free = -1;
    this.slots.forEach((s, i) => {
      if (s.used < this.frame && (free < 0 || s.used < this.slots[free].used)) free = i;
    });
    if (free < 0) return -1;
    const { gl } = this;
    try {
      gl.activeTexture(gl.TEXTURE0);
      if (!this.atlas) {
        this.atlas = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.atlas);
        const side = PHOTO_SIDE * ATLAS_GRID;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, side, side, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } else gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      const x = (free % ATLAS_GRID) * PHOTO_SIDE;
      const y = Math.floor(free / ATLAS_GRID) * PHOTO_SIDE;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGB, gl.UNSIGNED_BYTE, img);
      this.slots[free] = { image: img, used: this.frame };
      return free;
    } catch {
      // a photo served without CORS headers cannot be painted; its element shows it plainly instead
      this.failed.add(img);
      img.dispatchEvent(new Event('soakfailed'));
      return -1;
    }
  }

  /** Stop using the context. It is not force-lost: React may mount the same canvas again. */
  dispose() {
    this.gl.useProgram(null);
  }
}
