import { useEffect, useRef, type CSSProperties } from "react";
import { Mesh, Program, Renderer, Texture, Triangle } from "ogl";

type AnimationType = "rotate" | "rotate3d" | "hover";
type Offset = { x?: number | string; y?: number | string };

const MAX_PIXEL_RATIO = 1.35;
const PIXEL_BUDGET = 1_500_000;
const IDLE_FRAME_RATE = 60;
const SCROLL_FRAME_RATE = 30;

export type PrismaticBurstProps = {
  intensity?: number;
  speed?: number;
  animationType?: AnimationType;
  colors?: string[];
  distort?: number;
  paused?: boolean;
  offset?: Offset;
  hoverDampness?: number;
  rayCount?: number;
  mixBlendMode?: CSSProperties["mixBlendMode"] | "none";
  className?: string;
};

const vertexShader = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentShader = `#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;
uniform int uAnimType;
uniform vec2 uMouse;
uniform int uColorCount;
uniform float uDistort;
uniform vec2 uOffset;
uniform sampler2D uGradient;
uniform float uNoiseAmount;
uniform int uRayCount;

float hash21(vec2 p){
  p = floor(p);
  float f = 52.9829189 * fract(dot(p, vec2(0.065, 0.005)));
  return fract(f);
}

mat2 rot30(){ return mat2(0.8, -0.5, 0.5, 0.8); }

float layeredNoise(vec2 fragPx){
  vec2 p = mod(fragPx + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
  vec2 q = rot30() * p;
  float n = 0.0;
  n += 0.40 * hash21(q);
  n += 0.25 * hash21(q * 2.0 + 17.0);
  n += 0.20 * hash21(q * 4.0 + 47.0);
  n += 0.10 * hash21(q * 8.0 + 113.0);
  n += 0.05 * hash21(q * 16.0 + 191.0);
  return n;
}

vec3 rayDir(vec2 frag, vec2 res, vec2 offset, float dist){
  float focal = res.y * max(dist, 1e-3);
  return normalize(vec3(2.0 * (frag - offset) - res, focal));
}

float edgeFade(vec2 frag, vec2 res, vec2 offset){
  vec2 toC = frag - 0.5 * res - offset;
  float r = length(toC) / (0.5 * min(res.x, res.y));
  float x = clamp(r, 0.0, 1.0);
  float q = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
  float s = pow(q * 0.5, 1.5);
  float tail = 1.0 - pow(1.0 - s, 2.0);
  s = mix(s, tail, 0.2);
  float dn = (layeredNoise(frag * 0.15) - 0.5) * 0.0015 * s;
  return clamp(s + dn, 0.0, 1.0);
}

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0); }

vec3 sampleGradient(float t){
  return texture(uGradient, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
}

vec2 rot2(vec2 v, float a){
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c) * v;
}

float bendAngle(vec3 q, float t){
  return 0.8 * sin(q.x * 0.55 + t * 0.6)
       + 0.7 * sin(q.y * 0.50 - t * 0.5)
       + 0.6 * sin(q.z * 0.60 + t * 0.7);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  float t = uTime * uSpeed;
  float jitterAmp = 0.1 * clamp(uNoiseAmount, 0.0, 1.0);
  vec3 dir = rayDir(frag, uResolution, uOffset, 1.0);
  float marchT = 0.0;
  vec3 col = vec3(0.0);
  float n = layeredNoise(frag);
  vec4 c = cos(t * 0.2 + vec4(0.0, 33.0, 11.0, 0.0));
  mat2 M2 = mat2(c.x, c.y, c.z, c.w);
  float amp = clamp(uDistort, 0.0, 50.0) * 0.15;

  mat3 rot3dMat = mat3(1.0);
  if(uAnimType == 1){
    vec3 ang = vec3(t * 0.31, t * 0.21, t * 0.17);
    rot3dMat = rotZ(ang.z) * rotY(ang.y) * rotX(ang.x);
  }
  mat3 hoverMat = mat3(1.0);
  if(uAnimType == 2){
    vec2 m = uMouse * 2.0 - 1.0;
    vec3 ang = vec3(m.y * 0.6, m.x * 0.6, 0.0);
    hoverMat = rotY(ang.y) * rotX(ang.x);
  }

  for (int i = 0; i < 44; ++i) {
    vec3 P = marchT * dir;
    P.z -= 2.0;
    float rad = length(P);
    vec3 Pl = P * (10.0 / max(rad, 1e-6));
    if(uAnimType == 0) Pl.xz *= M2;
    else if(uAnimType == 1) Pl = rot3dMat * Pl;
    else Pl = hoverMat * Pl;

    float stepLen = min(rad - 0.3, n * jitterAmp) + 0.1;
    float grow = smoothstep(0.35, 3.0, marchT);
    float a1 = amp * grow * bendAngle(Pl * 0.6, t);
    float a2 = 0.5 * amp * grow * bendAngle(Pl.zyx * 0.5 + 3.1, t * 0.9);
    vec3 Pb = Pl;
    Pb.xz = rot2(Pb.xz, a1);
    Pb.xy = rot2(Pb.xy, a2);

    float rayPattern = smoothstep(
      0.5, 0.7,
      sin(Pb.x + cos(Pb.y) * cos(Pb.z)) * sin(Pb.z + sin(Pb.y) * cos(Pb.x + t))
    );
    if (uRayCount > 0) {
      float ang = atan(Pb.y, Pb.x);
      float comb = pow(0.5 + 0.5 * cos(float(uRayCount) * ang), 3.0);
      rayPattern *= smoothstep(0.15, 0.95, comb);
    }

    vec3 spectralDefault = 1.0 + vec3(
      cos(marchT * 3.0),
      cos(marchT * 3.0 + 1.0),
      cos(marchT * 3.0 + 2.0)
    );
    float saw = fract(marchT * 0.25);
    float tRay = saw * saw * (3.0 - 2.0 * saw);
    vec3 userGradient = 2.0 * sampleGradient(tRay);
    vec3 spectral = (uColorCount > 0) ? userGradient : spectralDefault;
    vec3 base = (0.05 / (0.4 + stepLen)) * smoothstep(5.0, 0.0, rad) * spectral;
    col += base * rayPattern;
    marchT += stepLen;
  }

  col *= edgeFade(frag, uResolution, uOffset);
  col *= uIntensity;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function colorBytes(colors: string[]): Uint8Array {
  const input = colors.length ? colors.slice(0, 64) : ["#ffffff"];
  const data = new Uint8Array(input.length * 4);
  input.forEach((color, index) => {
    let value = color.trim().replace(/^#/, "");
    if (value.length === 3)
      value = value
        .split("")
        .map((part) => part + part)
        .join("");
    const parsed = Number.parseInt(value.slice(0, 6), 16);
    data[index * 4] = Number.isFinite(parsed) ? (parsed >> 16) & 255 : 255;
    data[index * 4 + 1] = Number.isFinite(parsed) ? (parsed >> 8) & 255 : 255;
    data[index * 4 + 2] = Number.isFinite(parsed) ? parsed & 255 : 255;
    data[index * 4 + 3] = 255;
  });
  return data;
}

function toPixels(value: number | string | undefined): number {
  if (typeof value === "number") return value;
  return Number.parseFloat(String(value ?? 0).replace("px", "")) || 0;
}

export default function PrismaticBurst({
  intensity = 2,
  speed = 0.5,
  animationType = "rotate3d",
  colors = [],
  distort = 0,
  paused = false,
  offset = { x: 0, y: 0 },
  hoverDampness = 0,
  rayCount = 0,
  mixBlendMode = "lighten",
  className = "",
}: PrismaticBurstProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({
    intensity,
    speed,
    animationType,
    colors,
    distort,
    paused,
    offset,
    hoverDampness,
    rayCount,
    mixBlendMode,
  });
  propsRef.current = {
    intensity,
    speed,
    animationType,
    colors,
    distort,
    paused,
    offset,
    hoverDampness,
    rayCount,
    mixBlendMode,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const renderer = new Renderer({
      dpr: 1,
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      webgl: 2,
    });
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.transform = "translateZ(0)";
    canvas.style.willChange = "transform";
    container.appendChild(canvas);

    const initialColors = colorBytes(propsRef.current.colors);
    const gradient = new Texture(gl, {
      image: initialColors,
      width: Math.max(propsRef.current.colors.length, 1),
      height: 1,
      generateMipmaps: false,
      flipY: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uResolution: { value: [1, 1] },
        uTime: { value: 0 },
        uIntensity: { value: intensity },
        uSpeed: { value: speed },
        uAnimType: { value: 1 },
        uMouse: { value: [0.5, 0.5] },
        uColorCount: { value: colors.length },
        uDistort: { value: distort },
        uOffset: { value: [toPixels(offset.x), toPixels(offset.y)] },
        uGradient: { value: gradient },
        uNoiseAmount: { value: 0.72 },
        uRayCount: { value: Math.max(0, Math.floor(rayCount)) },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    let visible = true;
    let scrolling = false;
    let resizeFrame = 0;
    let renderWidth = 0;
    let renderHeight = 0;
    let renderRatio = 0;
    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      const deviceRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const budgetRatio = Math.sqrt(PIXEL_BUDGET / Math.max(width * height, 1));
      const nextRatio = Math.max(0.65, Math.min(deviceRatio, budgetRatio));
      if (
        width === renderWidth &&
        height === renderHeight &&
        Math.abs(nextRatio - renderRatio) < 0.01
      )
        return;
      renderWidth = width;
      renderHeight = height;
      renderRatio = nextRatio;
      renderer.dpr = nextRatio;
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
    };
    const scheduleResize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let mouseTarget: [number, number] = [0.5, 0.5];
    const mouseSmooth: [number, number] = [0.5, 0.5];
    const onPointerMove = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      mouseTarget = [
        Math.min(Math.max((event.clientX - bounds.left) / Math.max(bounds.width, 1), 0), 1),
        Math.min(Math.max((event.clientY - bounds.top) / Math.max(bounds.height, 1), 0), 1),
      ];
    };
    container.addEventListener("pointermove", onPointerMove, { passive: true });

    let previousColors = propsRef.current.colors.join(",");
    let previousBlendMode = "";
    let last = performance.now();
    let lastPaint = 0;
    let elapsed = 0;
    let animationFrame = 0;
    let running = false;
    const render = (now: number) => {
      if (!running || !visible || document.hidden) {
        running = false;
        return;
      }
      animationFrame = requestAnimationFrame(render);
      const delta = Math.max(0, now - last) * 0.001;
      last = now;
      const current = propsRef.current;
      if (!current.paused) elapsed += delta;
      const frameInterval = 1000 / (scrolling ? SCROLL_FRAME_RATE : IDLE_FRAME_RATE);
      if (now - lastPaint < frameInterval) return;
      lastPaint = now;

      const smoothing = 0.02 + Math.min(Math.max(current.hoverDampness, 0), 1) * 0.5;
      const alpha = 1 - Math.exp(-delta / smoothing);
      mouseSmooth[0] += (mouseTarget[0] - mouseSmooth[0]) * alpha;
      mouseSmooth[1] += (mouseTarget[1] - mouseSmooth[1]) * alpha;
      program.uniforms.uTime.value = elapsed;
      program.uniforms.uIntensity.value = current.intensity;
      program.uniforms.uSpeed.value = current.speed;
      program.uniforms.uAnimType.value = { rotate: 0, rotate3d: 1, hover: 2 }[
        current.animationType
      ];
      program.uniforms.uMouse.value = mouseSmooth;
      program.uniforms.uDistort.value = current.distort;
      program.uniforms.uOffset.value = [toPixels(current.offset.x), toPixels(current.offset.y)];
      program.uniforms.uRayCount.value = Math.max(0, Math.floor(current.rayCount));
      const nextBlendMode =
        current.mixBlendMode && current.mixBlendMode !== "none" ? current.mixBlendMode : "normal";
      if (nextBlendMode !== previousBlendMode) {
        canvas.style.mixBlendMode = nextBlendMode;
        previousBlendMode = nextBlendMode;
      }

      const nextColors = current.colors.join(",");
      if (nextColors !== previousColors) {
        const data = colorBytes(current.colors);
        gradient.image = data;
        gradient.width = Math.max(current.colors.length, 1);
        gradient.height = 1;
        gradient.needsUpdate = true;
        program.uniforms.uColorCount.value = current.colors.length;
        previousColors = nextColors;
      }
      renderer.render({ scene: mesh });
    };

    const startRendering = () => {
      if (running || !visible || document.hidden) return;
      running = true;
      last = performance.now();
      lastPaint = 0;
      animationFrame = requestAnimationFrame(render);
    };
    const stopRendering = () => {
      running = false;
      cancelAnimationFrame(animationFrame);
    };
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          scheduleResize();
          startRendering();
        } else {
          stopRendering();
        }
      },
      { rootMargin: "80px 0px" },
    );
    intersectionObserver.observe(container);

    let scrollTimer = 0;
    const onScroll = () => {
      if (!visible) return;
      scrolling = true;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
      }, 160);
    };
    const onVisibilityChange = () => {
      if (document.hidden) stopRendering();
      else startRendering();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    startRendering();

    return () => {
      stopRendering();
      cancelAnimationFrame(resizeFrame);
      window.clearTimeout(scrollTimer);
      container.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      if (canvas.parentNode === container) container.removeChild(canvas);
      gl.deleteTexture(gradient.texture);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // WebGL is created once; live prop changes are read through propsRef in the render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden [contain:layout_paint_style] [isolation:isolate] ${className}`}
    />
  );
}
