import { useEffect, useRef, useState } from 'react';

/**
 * Full-viewport WebGL background for the Sky and Lava themes.
 * Three.js is dynamically imported only when one of those themes is
 * active, so the other three themes pay zero bundle cost.
 */

const SCENIC = ['sky', 'lava'];

// Compact 2D simplex noise (Ashima Arts, MIT) shared by both shaders
const GLSL_NOISE = /* glsl */ `
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * snoise(p);
    p *= 2.05;
    a *= 0.5;
  }
  return v;
}
`;

function buildLava(THREE, mount, motionOk) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x070403, 8, 42);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(0, 5.2, 13);
  camera.lookAt(0, 1.2, 0);

  const segments = window.innerWidth < 700 ? 110 : 180;
  const geo = new THREE.PlaneGeometry(70, 50, segments, segments);

  const uniforms = { uTime: { value: 0 } };
  const terrain = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      fog: false,
      vertexShader: /* glsl */ `
        ${GLSL_NOISE}
        varying float vH;
        varying float vCrack;
        varying vec3 vPos;
        void main() {
          vec3 p = position;
          // ridged fbm: sharp dark peaks with valleys between
          float n = fbm(p.xy * 0.085);
          float ridge = 1.0 - abs(n);
          ridge = pow(ridge, 2.2);
          // taller ridge band across the middle, like a mountain spine
          float spine = exp(-pow(p.y * 0.05, 2.0)) * 5.5 + 0.6;
          float h = ridge * spine;
          vH = h;
          // crack mask: deepest creases between ridges carry the lava
          vCrack = smoothstep(0.32, 0.02, abs(n));
          p.z += h;
          vPos = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${GLSL_NOISE}
        uniform float uTime;
        varying float vH;
        varying float vCrack;
        varying vec3 vPos;
        void main() {
          // charcoal rock, slightly lighter on high ridges
          vec3 rock = mix(vec3(0.025, 0.02, 0.018), vec3(0.16, 0.14, 0.13),
                          smoothstep(0.0, 5.5, vH));
          // molten flow pulsing through the cracks
          float flow = fbm(vPos.xy * 0.22 + vec2(uTime * 0.05, uTime * 0.018));
          float heat = vCrack * smoothstep(-0.25, 0.75, flow);
          vec3 lava = mix(vec3(0.55, 0.06, 0.01), vec3(1.0, 0.55, 0.12),
                          smoothstep(0.2, 0.95, heat));
          vec3 col = rock + lava * heat * 2.4;
          // fade into black with distance, like the reference shot
          float fogF = smoothstep(8.0, 40.0, length(vPos - vec3(0.0, 0.0, 13.0)));
          col = mix(col, vec3(0.027, 0.016, 0.012), fogF);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);

  // rising embers
  const COUNT = window.innerWidth < 700 ? 160 : 320;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 50;
    pos[i * 3 + 1] = Math.random() * 14;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 36;
    seed[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const embers = new THREE.Points(
    pGeo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aSeed;
        varying float vA;
        void main() {
          vec3 p = position;
          float life = fract(aSeed + uTime * (0.025 + aSeed * 0.04));
          p.y = life * 14.0;
          p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.8;
          vA = (1.0 - life) * 0.85;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (2.5 + aSeed * 3.0) * (12.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(1.0, 0.5, 0.15, vA * (1.0 - d * 2.0));
        }
      `,
    })
  );
  scene.add(embers);

  return { scene, camera, uniforms, clearColor: 0x070403 };
}

function buildSky(THREE, mount, motionOk) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfeaff, 10, 60);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    120
  );
  camera.position.set(0, 4.5, 14);
  camera.lookAt(0, 0.5, 0);

  const segments = window.innerWidth < 700 ? 96 : 150;
  const geo = new THREE.PlaneGeometry(90, 70, segments, segments);
  const uniforms = { uTime: { value: 0 } };

  const water = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        ${GLSL_NOISE}
        uniform float uTime;
        varying float vH;
        varying vec3 vPos;
        void main() {
          vec3 p = position;
          float t = uTime;
          // layered travelling waves plus noise chop
          float h = sin(p.x * 0.32 + t * 0.9) * 0.45
                  + sin((p.x + p.y) * 0.18 - t * 0.6) * 0.6
                  + sin(p.y * 0.42 + t * 1.3) * 0.25
                  + snoise(p.xy * 0.12 + vec2(t * 0.08)) * 0.5;
          p.z += h;
          vH = h;
          vPos = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${GLSL_NOISE}
        uniform float uTime;
        varying float vH;
        varying vec3 vPos;
        void main() {
          // deep teal troughs to bright aqua crests
          vec3 deep = vec3(0.05, 0.35, 0.55);
          vec3 crest = vec3(0.62, 0.88, 0.97);
          vec3 col = mix(deep, crest, smoothstep(-1.4, 1.6, vH));
          // moving sun glints on the crests
          float glint = snoise(vPos.xy * 1.4 + vec2(uTime * 0.35, 0.0));
          col += vec3(1.0) * smoothstep(0.82, 0.99, glint) * smoothstep(0.4, 1.4, vH) * 0.7;
          // haze toward the horizon
          float fogF = smoothstep(6.0, 55.0, length(vPos - vec3(0.0, 0.0, 14.0)));
          col = mix(col, vec3(0.81, 0.92, 1.0), fogF);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.5;
  scene.add(water);

  // drifting cloud puffs: soft white sprites high above the water
  const COUNT = window.innerWidth < 700 ? 40 : 80;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 80;
    pos[i * 3 + 1] = 6 + Math.random() * 10;
    pos[i * 3 + 2] = -10 - Math.random() * 40;
    seed[i] = Math.random();
  }
  const cGeo = new THREE.BufferGeometry();
  cGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  cGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const clouds = new THREE.Points(
    cGeo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aSeed;
        varying float vA;
        void main() {
          vec3 p = position;
          p.x = mod(p.x + uTime * (0.3 + aSeed * 0.5) + 40.0, 80.0) - 40.0;
          vA = 0.16 + aSeed * 0.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (26.0 + aSeed * 40.0) * (14.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(1.0, 1.0, 1.0, vA * pow(1.0 - d * 2.0, 2.0));
        }
      `,
    })
  );
  scene.add(clouds);

  return { scene, camera, uniforms, clearColor: 0xb9e0fa };
}

export default function ThemeScene() {
  const mountRef = useRef(null);
  const [theme, setTheme] = useState('editorial');

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') || 'editorial');
    const onTheme = (e) => setTheme(e.detail);
    window.addEventListener('jamal:theme', onTheme);
    return () => window.removeEventListener('jamal:theme', onTheme);
  }, []);

  useEffect(() => {
    if (!SCENIC.includes(theme) || !mountRef.current) return;

    let disposed = false;
    let cleanup = () => {};

    import('three').then((THREE) => {
      if (disposed) return;
      const mount = mountRef.current;
      const motionOk = !window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      mount.appendChild(renderer.domElement);

      const build = theme === 'lava' ? buildLava : buildSky;
      const { scene, camera, uniforms, clearColor } = build(
        THREE,
        mount,
        motionOk
      );
      renderer.setClearColor(clearColor, 1);

      // pointer parallax: camera drifts gently toward the cursor
      const target = { x: 0, y: 0 };
      const base = { x: camera.position.x, y: camera.position.y };
      const onPointer = (e) => {
        target.x = (e.clientX / window.innerWidth - 0.5) * 2;
        target.y = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener('pointermove', onPointer, { passive: true });

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      let raf = 0;
      const clock = new THREE.Clock();
      const lookY = theme === 'lava' ? 1.2 : 0.5;
      const frame = () => {
        uniforms.uTime.value = clock.getElapsedTime();
        camera.position.x += (base.x + target.x * 1.6 - camera.position.x) * 0.04;
        camera.position.y += (base.y - target.y * 0.8 - camera.position.y) * 0.04;
        camera.lookAt(0, lookY, 0);
        renderer.render(scene, camera);
        if (motionOk) raf = requestAnimationFrame(frame);
      };
      frame();

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('resize', onResize);
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [theme]);

  if (!SCENIC.includes(theme)) return null;
  return <div id="scene-root" ref={mountRef} aria-hidden="true" />;
}
