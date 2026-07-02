const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========== Hugging Face (免费) 图像生成 ==========
// 注册免费获取 token: https://huggingface.co/settings/tokens
// 免费额度: 每天数万次调用

const HF_API_BASE = 'https://api-inference.huggingface.co/models';

// 可用的免费模型列表
const HF_MODELS = {
  'flux-schnell': 'black-forest-labs/FLUX.1-schnell',
  'sd-xl': 'stabilityai/stable-diffusion-xl-base-1.0',
  'sd-3.5': 'stabilityai/stable-diffusion-3.5-large',
  'sd-2': 'stabilityai/stable-diffusion-2-1',
};

async function generateWithHuggingFace(prompt) {
  const token = process.env.HF_API_TOKEN || process.env.HF_TOKEN;
  if (!token) {
    throw new Error('请先配置 HF_API_TOKEN（免费获取: https://huggingface.co/settings/tokens）');
  }

  const modelKey = (process.env.HF_MODEL || 'flux-schnell').toLowerCase();
  const modelId = HF_MODELS[modelKey];
  if (!modelId) {
    throw new Error(`未知模型: ${modelKey}，可选: ${Object.keys(HF_MODELS).join(', ')}`);
  }

  const url = `${process.env.HF_BASE_URL || HF_API_BASE}/${modelId}`;

  // 并行请求生成 2 张图片
  const requests = Array.from({ length: 2 }, async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    });

    if (!response.ok) {
      const text = await response.text();
      // 模型冷启动（首次加载需要等待）
      if (response.status === 503 && text.includes('loading')) {
        throw new Error('模型正在加载中，请等待 10-20 秒后重试');
      }
      throw new Error(`Hugging Face API 错误 (${response.status}): ${text.slice(0, 200)}`);
    }

    // 判断返回的是图片还是 JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      if (Array.isArray(json) && json[0]?.generated_image) {
        return `data:image/png;base64,${json[0].generated_image}`;
      }
      throw new Error(`意外响应: ${JSON.stringify(json).slice(0, 200)}`);
    }

    // 返回原始图片二进制 → 转 base64
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:image/png;base64,${buffer.toString('base64')}`;
  });

  return Promise.all(requests);
}

// ========== 演示模式（无 API Key 时可用） ==========
function generatePlaceholder(prompt) {
  const colors = ['#7c5cfc', '#5b8def', '#34d399', '#f59e0b', '#ef4444', '#ec4899'];
  return Array.from({ length: 2 }, (_, i) => {
    const color = colors[(i + crypto.randomInt(0, 6)) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" fill="${color}22"/>
      <rect x="64" y="64" width="384" height="384" rx="24" fill="${color}11" stroke="${color}" stroke-width="2"/>
      <text x="256" y="220" text-anchor="middle" fill="${color}" font-size="28" font-weight="600" font-family="sans-serif">✨ AI 图片</text>
      <text x="256" y="270" text-anchor="middle" fill="${color}aa" font-size="14" font-family="sans-serif">${prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt}</text>
      <text x="256" y="310" text-anchor="middle" fill="${color}66" font-size="12" font-family="sans-serif">#${i + 1}</text>
      <text x="256" y="380" text-anchor="middle" fill="${color}44" font-size="11" font-family="sans-serif">配置 HF_API_TOKEN 获取真实图片</text>
    </svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  });
}

// ========== API 路由 ==========
app.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || prompt.trim().length === 0) {
    return res.status(400).json({ error: '请输入图片描述' });
  }

  const provider = (process.env.PROVIDER || 'huggingface').toLowerCase();

  try {
    let imageUrls;

    if (provider === 'demo') {
      // 演示模式 - 无需任何 API Key
      imageUrls = generatePlaceholder(prompt);
    } else if (provider === 'openai') {
      // OpenAI (需要付费 API Key)
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.images.generate({
        model: process.env.OPENAI_MODEL || 'dall-e-3',
        prompt, n: 2, size: process.env.IMAGE_SIZE || '1024x1024',
      });
      imageUrls = response.data.map(item => item.url);
    } else {
      // 默认: Hugging Face (免费)
      imageUrls = await generateWithHuggingFace(prompt);
    }

    res.json({ images: imageUrls });
  } catch (error) {
    console.error('生成失败:', error);
    res.status(500).json({
      error: '图片生成失败',
      detail: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log('🎨 AI 图片生成器已启动: http://localhost:' + PORT);
  console.log('');
  console.log('   当前提供商: ' + (process.env.PROVIDER || 'huggingface'));

  if (!process.env.HF_API_TOKEN && !process.env.HF_TOKEN && !process.env.OPENAI_API_KEY) {
    console.log('   📌 免费方案: 设置 PROVIDER=demo 可无需 API Key 测试界面');
    console.log('   📌 推荐: 免费注册 https://huggingface.co 获取 HF_API_TOKEN');
  }

  const modelKey = (process.env.HF_MODEL || 'flux-schnell').toLowerCase();
  console.log('   🤖 模型: ' + (HF_MODELS[modelKey] || modelKey));
  console.log('');
});
