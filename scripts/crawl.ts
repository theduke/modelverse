import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Model } from "../src/data";

interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: {
    prompt: string;
    completion: string;
    per_token: boolean;
  };
  context_length?: number;
  architecture?: Record<string, unknown>;
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

async function fetchOpenRouterModels(): Promise<Model[]> {
  const apiUrl = "https://openrouter.ai/api/v1/models";
  const response = await fetch(apiUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenRouter models: ${response.status} ${response.statusText}`,
    );
  }

  const json: OpenRouterResponse = await response.json();
  const timestamp = new Date().toISOString();

  return json.data.map((model) => {
    const lab = model.id.includes("/") ? model.id.split("/")[0] : null;
    return {
      provider: "openrouter",
      id: model.id,
      name: model.name,
      lab,
      pricing: model.pricing
        ? {
            prompt: model.pricing.prompt,
            completion: model.pricing.completion,
            perToken: model.pricing.per_token,
          }
        : undefined,
      contextLength: model.context_length,
      architecture: model.architecture ? snakeToCamel(model.architecture as Record<string, unknown>) : undefined,
      timestamp,
    };
  });
}

function readJsonLines<T>(path: string): T[] {
  try {
    const content = readFileSync(path, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeJsonLines<T>(path: string, data: T[]): void {
  const content = data.map((item) => JSON.stringify(item)).join("\n") + "\n";
  writeFileSync(path, content);
}

function modelKey(model: Model): string {
  return `${model.provider}:${model.id}`;
}

function modelDataEqual(a: Model, b: Model): boolean {
  return (
    a.name === b.name &&
    a.lab === b.lab &&
    JSON.stringify(a.pricing) === JSON.stringify(b.pricing) &&
    a.contextLength === b.contextLength &&
    JSON.stringify(a.architecture) === JSON.stringify(b.architecture)
  );
}

async function main() {
  const outputDir = join(process.cwd(), "public", "data");
  mkdirSync(outputDir, { recursive: true });

  const modelsPath = join(outputDir, "models.jsonl");
  const historyPath = join(outputDir, "models_history.jsonl");

  // Fetch current data from all providers
  const currentModels = await fetchOpenRouterModels();

  // Read existing latest data
  const existingModels = readJsonLines<Model>(modelsPath);
  const existingMap = new Map(existingModels.map((m) => [modelKey(m), m]));

  // Track updated models and new history entries
  const updatedModels: Model[] = [];
  const newHistoryEntries: Model[] = [];

  for (const model of currentModels) {
    const key = modelKey(model);
    const existing = existingMap.get(key);

    if (!existing || !modelDataEqual(model, existing)) {
      updatedModels.push(model);
      newHistoryEntries.push(model);
    } else {
      updatedModels.push(existing);
    }
  }

  // Build final models list: updated models + existing models not in current fetch
  const finalMap = new Map<string, Model>();
  for (const model of updatedModels) {
    finalMap.set(modelKey(model), model);
  }
  for (const model of existingModels) {
    finalMap.set(modelKey(model), model);
  }

  const finalModels = Array.from(finalMap.values());

  // Write updated models.json (overwrite)
  writeJsonLines(modelsPath, finalModels);

  // Append new history entries
  if (newHistoryEntries.length > 0) {
    const historyContent =
      newHistoryEntries.map((item) => JSON.stringify(item)).join("\n") + "\n";
    appendFileSync(historyPath, historyContent);
  }

  console.log(`Fetched ${currentModels.length} models from providers`);
  console.log(`Total models in models.json: ${finalModels.length}`);
  console.log(
    `Added ${newHistoryEntries.length} new entries to models_history.json`,
  );
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
