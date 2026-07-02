addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event));
});

const HF_API_BASE = 'https://api-inference.huggingface.co/models';
const HF_MODELS = {
  'flux-schnell': 'black-forest-labs/FLUX.1-schnell',
  'sd-xl': 'stabilityai/stable-diffusion-xl-base-1.0',
  'sd-3.5': 'stabilityai/stable-diffusion-3.5-large',
  'sd-2': 'stabilityai/stable-diffusion-2-1',
};

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + chunk));
  }
  return btoa(binary);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generatePlaceholder(prompt) {
  const colors = ['#7c5cfc', '#5b8def', '#34d399', '#f59e0b', '#ef4444', '#ec4899'];
  return Array.from({ length: 2 }, (_, i) => {
    const color = colors[(i + Math.floor(Math.random() * 6)) % colors.length];
    const text = prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" fill="${color}22"/>
      <rect x="64" y="64" width="384" height="384" rx="24" fill="${color}11" stroke="${color}" stroke-width="2"/>
      <text x="256" y="220" text-anchor="middle" fill="${color}" font-size="28" font-weight="600" font-family="sans-serif">✨ AI 图片</text>
      <text x="256" y="270" text-anchor="middle" fill="${color}aa" font-size="14" font-family="sans-serif">${escapeHtml(text)}</text>
      <text x="256" y="310" text-anchor="middle" fill="${color}66" font-size="12" font-family="sans-serif">#${i + 1}</text>
      <text x="256" y="380" text-anchor="middle" fill="${color}44" font-size="11" font-family="sans-serif">配置 HF_API_TOKEN 获取真实图片</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  });
}

async function handleApiGenerate(request, env) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let body = null;
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const text = await request.text();
      try { body = JSON.parse(text); } catch (e) { body = null; }
    }

    const prompt = body && body.prompt ? String(body.prompt).trim() : null;
    if (!prompt) {
      return new Response(JSON.stringify({ error: '请输入图片描述' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const provider = (env.PROVIDER || 'huggingface').toLowerCase();
    if (provider === 'demo' || !env.HF_API_TOKEN) {
      return new Response(JSON.stringify({ images: generatePlaceholder(prompt) }), { headers: { 'Content-Type': 'application/json' } });
    }

    const modelKey = (env.HF_MODEL || 'flux-schnell').toLowerCase();
    const modelId = HF_MODELS[modelKey] || modelKey;
    const hfUrl = `${env.HF_BASE_URL || HF_API_BASE}/${modelId}`;

    const hfRes = await fetch(hfUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.HF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    });

    const hfCt = (hfRes.headers.get('content-type') || '').toLowerCase();
    if (!hfRes.ok) {
      const txt = await hfRes.text();
      return new Response(JSON.stringify({ error: 'Hugging Face 错误', detail: txt }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    if (hfCt.includes('application/json')) {
      const j = await hfRes.json();
      if (Array.isArray(j) && j[0] && j[0].generated_image) {
        const imgs = j.map(it => `data:image/png;base64,${it.generated_image}`);
        return new Response(JSON.stringify({ images: imgs }), { headers: { 'Content-Type': 'application/json' } });
      }
      // unexpected json
      return new Response(JSON.stringify({ error: '意外响应', detail: JSON.stringify(j).slice(0, 200) }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    // binary image
    const ab = await hfRes.arrayBuffer();
    const b64 = arrayBufferToBase64(ab);
    return new Response(JSON.stringify({ images: [`data:image/png;base64,${b64}`] }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: '服务器错误', detail: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

async function proxyStatic(request) {
  // Map request path to GitHub raw content under /public
  const url = new URL(request.url);
  let path = url.pathname;
  if (path.endsWith('/')) path += 'index.html';
  if (path === '/') path = '/index.html';
  const rawBase = 'https://raw.githubusercontent.com/xingwendeng-stack/ai-image-generator/main/public';
  const rawUrl = rawBase + path;

  const resp = await fetch(rawUrl, { method: 'GET' });
  if (!resp.ok) {
    return new Response('Not Found', { status: 404 });
  }

  // forward content-type and body
  const headers = new Headers(resp.headers);
  headers.set('Cache-Control', 'max-age=60');
  return new Response(await resp.arrayBuffer(), { status: resp.status, headers });
}

async function handleRequest(request, event) {
  const url = new URL(request.url);
  if (url.pathname === '/api/generate' && request.method.toUpperCase() === 'POST') {
    return handleApiGenerate(request, event?.env || {});
  }

  // fallback: serve static from GitHub raw
  return proxyStatic(request);
}
