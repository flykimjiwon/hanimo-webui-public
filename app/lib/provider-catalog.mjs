const cloud = (entry) => ({ category: 'cloud', provider: 'openai-compatible', requiresKey: true, discovery: 'live', ...entry });
const gateway = (entry) => ({ category: 'gateway', provider: 'openai-compatible', requiresKey: true, discovery: 'live', ...entry });
const local = (entry) => ({ category: 'local', provider: 'openai-compatible', requiresKey: false, discovery: 'live', ...entry });

export const PROVIDER_CATALOG = Object.freeze([
  { id: 'ollama', name: 'Ollama', url: 'http://localhost:11434', category: 'local', provider: 'ollama', requiresKey: false, discovery: 'live', aliases: ['ollama local'] },
  local({ id: 'lmstudio', name: 'LM Studio', url: 'http://localhost:1234/v1', aliases: ['lm studio'] }),
  local({ id: 'vllm', name: 'vLLM', url: 'http://localhost:8000/v1', aliases: ['v llm'] }),
  local({ id: 'llamacpp', name: 'llama.cpp', url: 'http://localhost:8080/v1', aliases: ['llama cpp', 'llama-cpp'] }),
  local({ id: 'localai', name: 'LocalAI', url: 'http://localhost:8080/v1', aliases: ['local ai'] }),
  local({ id: 'sglang', name: 'SGLang', url: 'http://localhost:30000/v1', aliases: [] }),
  local({ id: 'koboldcpp', name: 'KoboldCpp', url: 'http://localhost:5001/v1', aliases: ['kobold cpp'] }),
  local({ id: 'textgenwebui', name: 'text-generation-webui', url: 'http://localhost:5000/v1', aliases: ['oobabooga', 'text generation webui'] }),
  local({ id: 'tensorrtllm', name: 'TensorRT-LLM', url: 'http://localhost:8000/v1', aliases: ['tensorrt llm'] }),
  local({ id: 'mlx-lm', name: 'MLX-LM', url: 'http://localhost:8080/v1', aliases: ['mlx lm'] }),
  gateway({ id: 'litellm', name: 'LiteLLM Proxy', url: 'http://localhost:4000/v1', requiresKey: false, aliases: ['lite llm'] }),
  gateway({ id: 'openrouter', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', aliases: [] }),
  gateway({ id: 'requesty', name: 'Requesty', url: 'https://router.requesty.ai/v1', aliases: [] }),
  gateway({ id: 'vercel-ai-gateway', name: 'Vercel AI Gateway', url: 'https://ai-gateway.vercel.sh/v1', aliases: ['vercel gateway'] }),
  gateway({ id: 'portkey', name: 'Portkey', url: 'https://api.portkey.ai/v1', aliases: [] }),
  gateway({ id: 'martian', name: 'Martian', url: 'https://api.withmartian.com/v1', aliases: [] }),
  gateway({ id: 'edenai', name: 'Eden AI', url: 'https://api.edenai.run/v3', discovery: 'limited', aliases: ['eden ai'] }),
  cloud({ id: 'openai', name: 'OpenAI', url: 'https://api.openai.com/v1', aliases: ['chatgpt'] }),
  cloud({ id: 'groq', name: 'Groq', url: 'https://api.groq.com/openai/v1', aliases: [] }),
  cloud({ id: 'xai', name: 'xAI', url: 'https://api.x.ai/v1', aliases: ['x ai', 'grok'] }),
  cloud({ id: 'deepseek', name: 'DeepSeek', url: 'https://api.deepseek.com', aliases: ['deep seek'] }),
  cloud({ id: 'mistral', name: 'Mistral AI', url: 'https://api.mistral.ai/v1', aliases: [] }),
  cloud({ id: 'together', name: 'Together AI', url: 'https://api.together.xyz/v1', aliases: ['together'] }),
  cloud({ id: 'fireworks', name: 'Fireworks AI', url: 'https://api.fireworks.ai/inference/v1', aliases: ['fireworks'] }),
  cloud({ id: 'cerebras', name: 'Cerebras', url: 'https://api.cerebras.ai/v1', aliases: [] }),
  cloud({ id: 'sambanova', name: 'SambaNova', url: 'https://api.sambanova.ai/v1', aliases: ['samba nova'] }),
  cloud({ id: 'nebius', name: 'Nebius AI Studio', url: 'https://api.studio.nebius.ai/v1', aliases: ['nebius'] }),
  cloud({ id: 'novita', name: 'Novita AI', url: 'https://api.novita.ai/openai/v1', aliases: ['novita'] }),
  cloud({ id: 'nvidia-nim', name: 'NVIDIA NIM', url: 'https://integrate.api.nvidia.com/v1', aliases: ['nim', 'nvidia'] }),
  cloud({ id: 'moonshot', name: 'Moonshot AI', url: 'https://api.moonshot.ai/v1', aliases: ['kimi', 'moonshot global'] }),
  cloud({ id: 'minimax', name: 'MiniMax', url: 'https://api.minimax.io/v1', aliases: ['minimax global'] }),
  cloud({ id: 'zai', name: 'Z.AI / GLM', url: 'https://api.z.ai/api/paas/v4', aliases: ['glm', 'zhipu', 'z.ai'] }),
  cloud({ id: 'qwen', name: 'Qwen / DashScope', url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', aliases: ['alibaba', 'dashscope'] }),
  cloud({ id: 'stepfun', name: 'StepFun', url: 'https://api.stepfun.ai/v1', aliases: ['step fun'] }),
  cloud({ id: 'huggingface', name: 'Hugging Face Router', url: 'https://router.huggingface.co/v1', aliases: ['hf', 'huggingface'] }),
  cloud({ id: 'deepinfra', name: 'DeepInfra', url: 'https://api.deepinfra.com/v1/openai', aliases: [] }),
  cloud({ id: 'chutes', name: 'Chutes', url: 'https://llm.chutes.ai/v1', aliases: [] }),
  cloud({ id: 'featherless', name: 'Featherless AI', url: 'https://api.featherless.ai/v1', aliases: [] }),
  cloud({ id: 'gmi', name: 'GMI Cloud', url: 'https://api.gmi-serving.com/v1', aliases: ['gmi'] }),
  cloud({ id: 'arcee', name: 'Arcee AI', url: 'https://api.arcee.ai/api/v1', aliases: [] }),
  cloud({ id: 'venice', name: 'Venice AI', url: 'https://api.venice.ai/api/v1', aliases: [] }),
  cloud({ id: 'qianfan', name: 'Baidu Qianfan', url: 'https://qianfan.baidubce.com/v2', aliases: ['baidu'] }),
  cloud({ id: 'modelark-global', name: 'BytePlus ModelArk', url: 'https://ark.ap-southeast.bytepluses.com/api/v3', aliases: ['byteplus'] }),
  cloud({ id: 'modelark-cn', name: 'Volcengine ModelArk', url: 'https://ark.cn-beijing.volces.com/api/v3', aliases: ['volcengine'] }),
  cloud({ id: 'xiaomi', name: 'Xiaomi MiMo', url: 'https://api.xiaomimimo.com/v1', aliases: ['mimo'] }),
  cloud({ id: 'longcat', name: 'LongCat', url: 'https://api.longcat.chat/openai', aliases: [] }),
  { id: 'gemini', name: 'Google Gemini', url: 'https://generativelanguage.googleapis.com', category: 'cloud', provider: 'gemini', requiresKey: true, discovery: 'live', aliases: ['google ai'] },
  { id: 'custom', name: '', url: '', category: 'custom', provider: 'openai-compatible', requiresKey: false, discovery: 'manual', aliases: ['custom endpoint'] },
]);

export const PROVIDER_CATEGORIES = Object.freeze(['all', 'local', 'gateway', 'cloud', 'custom']);

export function searchProviderCatalog(query = '', category = 'all') {
  const needle = String(query).trim().toLocaleLowerCase();
  return PROVIDER_CATALOG.filter((entry) => {
    if (category !== 'all' && entry.category !== category) return false;
    if (!needle) return true;
    return [entry.id, entry.name, entry.url, ...entry.aliases].some((value) =>
      value.toLocaleLowerCase().includes(needle)
    );
  });
}
