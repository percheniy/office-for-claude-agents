import assert from "node:assert/strict";
import { getContextLimit, getModelInfo } from "../webview-ui/src/modelInfo.js";

const examples = [
  ["claude-opus-4-6", "Anthropic"],
  ["openai/gpt-5.4-mini", "OpenAI"],
  ["codex-mini-latest", "OpenAI"],
  ["google/gemini-2.5-pro", "Google"],
  ["moonshot/kimi-k2", "Moonshot AI"],
  ["deepseek/deepseek-r1", "DeepSeek"],
  ["qwen/qwen3-coder", "Alibaba"],
  ["xai/grok-4", "xAI"],
  ["mistral/codestral-latest", "Mistral AI"],
  ["meta/llama-4-maverick", "Meta"],
  ["cohere/command-r-plus", "Cohere"],
  ["amazon/nova-pro", "Amazon"],
  ["microsoft/phi-4", "Microsoft"],
  ["zhipu/glm-4.5", "Zhipu AI"],
] as const;

for (const [model, provider] of examples) {
  const info = getModelInfo(model);
  assert.ok(info, `Expected model info for ${model}`);
  assert.equal(info.provider, provider);
  assert.ok(info.shortName.length <= 24);
  assert.equal(info.rawName, model);
}

const futureModel = getModelInfo("future-lab/super-model-version-123456789");
assert.equal(futureModel?.provider, "Other");
assert.match(futureModel?.shortName ?? "", /…$/);
assert.equal(getModelInfo("  "), null);
assert.equal(getContextLimit("unknown-model"), 200000);

console.log(`Model recognition passed for ${examples.length + 2} cases.`);
