import { useEffect, useRef, useState } from 'react';

/**
 * Full-viewport WebGL background driving the two scenic themes.
 * Three.js loads only when an animated theme is active.
 *
 *   sky  → fluid aurora ribbons over a midnight gradient (full-screen
 *          shader; no terrain). A modern liquid-color UI field.
 *   lava → ridged molten terrain with crack-flow, ember particles and
 *          deep atmospheric fade so the silhouette never cuts hard.
 */

const SCENIC = ['sky', 'lava'];

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

function buildLava(THREE) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    52,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  // sit low so the plane fills the lower 2/3 and the back fades into night
  camera.position.set(0, 3.6, 10);
  camera.lookAt(0, 1.4, 0);

  const segments = window.innerWidth < 700 ? 140 : 220;
  const geo = new THREE.PlaneGeometry(180, 140, segments, segments);
  const uniforms = { uTime: { value: 0 } };

  const terrain = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        ${GLSL_NOISE}
        varying float vH;
        varying float vCrack;
        varying vec3 vPos;
        varying float vDepth;
        void main() {
          vec3 p = position;
          // ridged fbm with smoother power for cinematic ridges
          float n = fbm(p.xy * 0.055);
          float ridge = 1.0 - abs(n);
          ridge = pow(ridge, 1.7);
          // wide spine across the foreground that decays toward background
          float spine = exp(-pow(p.y * 0.045, 2.0)) * 4.6 + 0.4;
          float h = ridge * spine;
          // pull distant geometry downward so it never breaks the horizon
          float distFade = smoothstep(20.0, 70.0, abs(p.y));
          h *= (1.0 - distFade);
          vH = h;
          vCrack = smoothstep(0.30, 0.02, abs(n));
          p.z += h;
          vPos = p;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        ${GLSL_NOISE}
        uniform float uTime;
        varying float vH;
        varying float vCrack;
        varying vec3 vPos;
        varying float vDepth;
        void main() {
          vec3 rock = mix(vec3(0.018, 0.012, 0.010), vec3(0.13, 0.10, 0.09),
                          smoothstep(0.0, 4.6, vH));
          // slow, painterly lava flow
          float flow = fbm(vPos.xy * 0.18 + vec2(uTime * 0.025, uTime * 0.012));
          float heat = vCrack * smoothstep(-0.3, 0.7, flow);
          vec3 lavaLo = vec3(0.48, 0.07, 0.02);
          vec3 lavaHi = vec3(1.00, 0.55, 0.18);
          vec3 lava = mix(lavaLo, lavaHi, smoothstep(0.25, 0.95, heat));
          vec3 col = rock + lava * heat * 1.9;
          // deep atmospheric fade to black — no hard silhouette
          float fogF = smoothstep(7.0, 55.0, vDepth);
          col = mix(col, vec3(0.012, 0.006, 0.005), fogF);
          // ember haze near horizon, very subtle
          col += vec3(0.32, 0.10, 0.04) * smoothstep(25.0, 50.0, vDepth)
                                       * (1.0 - smoothstep(45.0, 70.0, vDepth)) * 0.12;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  terrain.rotation.x = -Math.PI / 2;
  scene.add(terrain);

  const COUNT = window.innerWidth < 700 ? 140 : 280;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
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
          float life = fract(aSeed + uTime * (0.02 + aSeed * 0.03));
          p.y = life * 14.0;
          p.x += sin(uTime * 0.5 + aSeed * 40.0) * 0.9;
          vA = (1.0 - life) * 0.75;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (2.2 + aSeed * 2.8) * (10.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(1.0, 0.5, 0.18, vA * (1.0 - d * 2.0));
        }
      `,
    })
  );
  scene.add(embers);

  return {
    scene,
    camera,
    uniforms,
    clearColor: 0x050302,
    parallax: { x: 1.4, y: 0.6, lookY: 1.4 },
  };
}

/**
 * Aurora: a full-screen liquid-color field rendered as a fragment shader
 * on a screen-aligned plane. Modern, fluid, and nothing to do with a
 * literal ocean.
 */
function buildAurora(THREE) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: window.innerWidth / window.innerHeight },
  };

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${GLSL_NOISE}
        uniform float uTime;
        uniform vec2 uMouse;
        uniform float uAspect;
        varying vec2 vUv;

        // signed distance from a flowing ribbon centerline
        float ribbon(vec2 p, float baseY, float phase, float freq,
                     float speed, float thickness) {
          float y = baseY
                  + sin(p.x * freq + uTime * speed + phase) * 0.14
                  + sin(p.x * freq * 0.43 - uTime * speed * 0.6 + phase) * 0.09
                  + fbm(vec2(p.x * 1.6, uTime * 0.18 + phase)) * 0.08;
          float d = abs(p.y - y);
          // soft falloff with a brighter spine
          float band = smoothstep(thickness, 0.0, d);
          band += smoothstep(thickness * 0.45, 0.0, d) * 0.45;
          return band;
        }

        void main() {
          // aspect-corrected coords so ribbons don't stretch
          vec2 p = vUv;
          p.x = (p.x - 0.5) * uAspect + 0.5;

          // deep midnight base with subtle vertical gradient
          vec3 col = mix(vec3(0.04, 0.02, 0.10),
                         vec3(0.02, 0.01, 0.05), p.y);

          // four overlapping aurora bands at different heights and tempos
          float r1 = ribbon(p, 0.62, 0.0, 5.5, 0.32, 0.12);
          float r2 = ribbon(p, 0.50, 1.7, 7.0, 0.42, 0.10);
          float r3 = ribbon(p, 0.42, 3.1, 4.2, 0.27, 0.09);
          float r4 = ribbon(p, 0.72, 5.3, 9.0, 0.22, 0.07);

          vec3 cTeal    = vec3(0.20, 0.95, 0.78);
          vec3 cIndigo  = vec3(0.40, 0.55, 1.00);
          vec3 cMagenta = vec3(0.95, 0.35, 0.85);
          vec3 cLime    = vec3(0.65, 1.00, 0.55);

          col += cTeal    * r1 * 1.25;
          col += cIndigo  * r2 * 1.10;
          col += cMagenta * r3 * 0.95;
          col += cLime    * r4 * 0.55;

          // soft chromatic bloom across the field
          float glow = (r1 + r2 + r3 + r4);
          col += mix(cIndigo, cMagenta, sin(uTime * 0.4) * 0.5 + 0.5)
                 * glow * 0.08;

          // cursor halo: aurora gathers toward the pointer
          vec2 m = uMouse; m.x = (m.x - 0.5) * uAspect + 0.5;
          float md = distance(p, m);
          col += cTeal * smoothstep(0.45, 0.0, md) * 0.10;

          // film-grain dither to kill banding
          float grain = fract(sin(dot(vUv * 800.0, vec2(12.9898, 78.233)))
                              * 43758.5453);
          col += (grain - 0.5) * 0.02;

          // Reinhard tone map for clean highlights
          col = col / (1.0 + col);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  scene.add(quad);

  return {
    scene,
    camera,
    uniforms,
    clearColor: 0x070314,
    parallax: { x: 0, y: 0, lookY: 0, mouse: true },
  };
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
        alpha: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      mount.appendChild(renderer.domElement);

      const build = theme === 'lava' ? buildLava : buildAurora;
      const { scene, camera, uniforms, clearColor, parallax } = build(THREE);
      renderer.setClearColor(clearColor, 1);

      const target = { x: 0, y: 0 };
      const mouseUv = { x: 0.5, y: 0.5 };
      const onPointer = (e) => {
        target.x = (e.clientX / window.innerWidth - 0.5) * 2;
        target.y = (e.clientY / window.innerHeight - 0.5) * 2;
        mouseUv.x = e.clientX / window.innerWidth;
        mouseUv.y = 1 - e.clientY / window.innerHeight;
      };
      window.addEventListener('pointermove', onPointer, { passive: true });

      const baseX = camera.position.x;
      const baseY = camera.position.y;

      const onResize = () => {
        if (camera.isPerspectiveCamera) {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
        }
        if (uniforms.uAspect) {
          uniforms.uAspect.value = window.innerWidth / window.innerHeight;
        }
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onResize);

      let raf = 0;
      const clock = new THREE.Clock();
      const frame = () => {
        const t = clock.getElapsedTime();
        uniforms.uTime.value = t;
        if (parallax.mouse && uniforms.uMouse) {
          uniforms.uMouse.value.x +=
            (mouseUv.x - uniforms.uMouse.value.x) * 0.06;
          uniforms.uMouse.value.y +=
            (mouseUv.y - uniforms.uMouse.value.y) * 0.06;
        }
        if (camera.isPerspectiveCamera) {
          camera.position.x +=
            (baseX + target.x * parallax.x - camera.position.x) * 0.04;
          camera.position.y +=
            (baseY - target.y * parallax.y - camera.position.y) * 0.04;
          camera.lookAt(0, parallax.lookY, 0);
        }
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
