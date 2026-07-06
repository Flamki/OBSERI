import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle, Color } from "ogl";

export interface DitherProps {
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  waveColor?: [number, number, number];
  colorNum?: number;
  pixelSize?: number;
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
}

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;
uniform float time;
uniform vec2 resolution;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;
uniform float colorNum;
uniform float pixelSize;
varying vec2 vUv;
vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }
float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}
const int OCTAVES = 4;
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < OCTAVES; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}
float pattern(vec2 p) {
  vec2 p2 = p - time * waveSpeed;
  return fbm(p - fbm(p + fbm(p2)));
}
float getBayerValue(int x, int y) {
  if (y == 0) {
    if (x == 0) return 0.0/64.0; if (x == 1) return 48.0/64.0; if (x == 2) return 12.0/64.0; if (x == 3) return 60.0/64.0;
    if (x == 4) return 3.0/64.0; if (x == 5) return 51.0/64.0; if (x == 6) return 15.0/64.0; if (x == 7) return 63.0/64.0;
  } else if (y == 1) {
    if (x == 0) return 32.0/64.0; if (x == 1) return 16.0/64.0; if (x == 2) return 44.0/64.0; if (x == 3) return 28.0/64.0;
    if (x == 4) return 35.0/64.0; if (x == 5) return 19.0/64.0; if (x == 6) return 47.0/64.0; if (x == 7) return 31.0/64.0;
  } else if (y == 2) {
    if (x == 0) return 8.0/64.0; if (x == 1) return 56.0/64.0; if (x == 2) return 4.0/64.0; if (x == 3) return 52.0/64.0;
    if (x == 4) return 11.0/64.0; if (x == 5) return 59.0/64.0; if (x == 6) return 7.0/64.0; if (x == 7) return 55.0/64.0;
  } else if (y == 3) {
    if (x == 0) return 40.0/64.0; if (x == 1) return 24.0/64.0; if (x == 2) return 36.0/64.0; if (x == 3) return 20.0/64.0;
    if (x == 4) return 43.0/64.0; if (x == 5) return 27.0/64.0; if (x == 6) return 39.0/64.0; if (x == 7) return 23.0/64.0;
  } else if (y == 4) {
    if (x == 0) return 2.0/64.0; if (x == 1) return 50.0/64.0; if (x == 2) return 14.0/64.0; if (x == 3) return 62.0/64.0;
    if (x == 4) return 1.0/64.0; if (x == 5) return 49.0/64.0; if (x == 6) return 13.0/64.0; if (x == 7) return 61.0/64.0;
  } else if (y == 5) {
    if (x == 0) return 34.0/64.0; if (x == 1) return 18.0/64.0; if (x == 2) return 46.0/64.0; if (x == 3) return 30.0/64.0;
    if (x == 4) return 33.0/64.0; if (x == 5) return 17.0/64.0; if (x == 6) return 45.0/64.0; if (x == 7) return 29.0/64.0;
  } else if (y == 6) {
    if (x == 0) return 10.0/64.0; if (x == 1) return 58.0/64.0; if (x == 2) return 6.0/64.0; if (x == 3) return 54.0/64.0;
    if (x == 4) return 9.0/64.0; if (x == 5) return 57.0/64.0; if (x == 6) return 5.0/64.0; if (x == 7) return 53.0/64.0;
  } else if (y == 7) {
    if (x == 0) return 42.0/64.0; if (x == 1) return 26.0/64.0; if (x == 2) return 38.0/64.0; if (x == 3) return 22.0/64.0;
    if (x == 4) return 41.0/64.0; if (x == 5) return 25.0/64.0; if (x == 6) return 37.0/64.0; if (x == 7) return 21.0/64.0;
  }
  return 0.0;
}
vec3 dither(vec2 uv, vec3 color) {
  vec2 scaledCoord = floor(uv * resolution / pixelSize);
  int x = int(mod(scaledCoord.x, 8.0));
  int y = int(mod(scaledCoord.y, 8.0));
  float threshold = getBayerValue(x, y) - 0.25;
  float step = 1.0 / (colorNum - 1.0);
  color += threshold * step;
  float bias = 0.2;
  color = clamp(color - bias, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}
void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 centeredUv = uv - 0.5;
  centeredUv.x *= resolution.x / resolution.y;
  float f = pattern(centeredUv);
  if (enableMouseInteraction == 1) {
    vec2 mouseNDC = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNDC.x *= resolution.x / resolution.y;
    float dist = length(centeredUv - mouseNDC);
    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);
    f -= 0.5 * effect;
  }
  vec3 col = mix(vec3(0.0), waveColor, f);
  col = dither(uv, col);
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function Dither({
  waveSpeed = 0.05,
  waveFrequency = 3,
  waveAmplitude = 0.3,
  waveColor = [0.5, 0.5, 0.5],
  colorNum = 4,
  pixelSize = 2,
  disableAnimation = false,
  enableMouseInteraction = true,
  mouseRadius = 1,
}: DitherProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({
    waveSpeed,
    waveFrequency,
    waveAmplitude,
    waveColor,
    colorNum,
    pixelSize,
    disableAnimation,
    enableMouseInteraction,
    mouseRadius,
  });

  propsRef.current = {
    waveSpeed,
    waveFrequency,
    waveAmplitude,
    waveColor,
    colorNum,
    pixelSize,
    disableAnimation,
    enableMouseInteraction,
    mouseRadius,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isVisible = true;
    const observerIntersection = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0.01 }
    );
    observerIntersection.observe(container);

    const renderer = new Renderer({ alpha: true });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        time: { value: 0 },
        resolution: { value: new Float32Array([gl.canvas.width, gl.canvas.height]) },
        waveSpeed: { value: waveSpeed },
        waveFrequency: { value: waveFrequency },
        waveAmplitude: { value: waveAmplitude },
        waveColor: { value: new Color(...waveColor) },
        mousePos: { value: new Float32Array([gl.canvas.width / 2, gl.canvas.height / 2]) },
        enableMouseInteraction: { value: enableMouseInteraction ? 1 : 0 },
        mouseRadius: { value: mouseRadius },
        colorNum: { value: colorNum },
        pixelSize: { value: pixelSize },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    container.appendChild(canvas);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight);
      program.uniforms.resolution.value[0] = clientWidth;
      program.uniforms.resolution.value[1] = clientHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    const currentMouse = [gl.canvas.width / 2, gl.canvas.height / 2];
    const targetMouse = [gl.canvas.width / 2, gl.canvas.height / 2];

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      targetMouse[0] = nx * gl.canvas.width;
      targetMouse[1] = ny * gl.canvas.height;
    };
    const handleMouseLeave = () => {
      targetMouse[0] = gl.canvas.width / 2;
      targetMouse[1] = gl.canvas.height / 2;
    };
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    let animationId = 0;
    const update = (t: number) => {
      animationId = requestAnimationFrame(update);
      if (!isVisible) return;
      const p = propsRef.current;
      if (p.enableMouseInteraction) {
        const s = 0.05;
        currentMouse[0] += s * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += s * (targetMouse[1] - currentMouse[1]);
        program.uniforms.mousePos.value[0] = currentMouse[0];
        program.uniforms.mousePos.value[1] = currentMouse[1];
      } else {
        program.uniforms.mousePos.value[0] = gl.canvas.width / 2;
        program.uniforms.mousePos.value[1] = gl.canvas.height / 2;
      }
      if (!p.disableAnimation) {
        program.uniforms.time.value = t * 0.001;
      }
      program.uniforms.waveSpeed.value = p.waveSpeed;
      program.uniforms.waveFrequency.value = p.waveFrequency;
      program.uniforms.waveAmplitude.value = p.waveAmplitude;
      program.uniforms.waveColor.value.r = p.waveColor[0];
      program.uniforms.waveColor.value.g = p.waveColor[1];
      program.uniforms.waveColor.value.b = p.waveColor[2];
      program.uniforms.enableMouseInteraction.value = p.enableMouseInteraction ? 1 : 0;
      program.uniforms.mouseRadius.value = p.mouseRadius;
      program.uniforms.colorNum.value = p.colorNum;
      program.uniforms.pixelSize.value = p.pixelSize;
      renderer.render({ scene: mesh });
    };
    animationId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      observerIntersection.disconnect();
      if (canvas.parentNode === container) container.removeChild(canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="w-full h-full absolute top-0 left-0" />;
}
