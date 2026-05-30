import { useState, useEffect, useMemo } from "react";
import "../styles/comparison.css";

export interface Model {
  provider: string;
  id: string;
  name: string;
  lab: string | null;
  pricing?: {
    prompt: string;
    completion: string;
    perToken: boolean;
  };
  contextLength?: number;
  timestamp: string;
}

interface ModelComparisonProps {
  initialModels?: Model[];
}

export default function ModelComparison({
  initialModels = [],
}: ModelComparisonProps) {
  const [allModels, setAllModels] = useState<Model[]>([]);
  const [selectedModels, setSelectedModels] = useState<Model[]>(initialModels);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load models from JSONL file
  useEffect(() => {
    fetch("/data/models.jsonl")
      .then((res) => res.text())
      .then((text) => {
        const models = text
          .trim()
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line) as Model);
        setAllModels(models);
        setIsLoading(false);
      })
      .catch((err) => {
        setError("Failed to load models");
        setIsLoading(false);
        console.error(err);
      });
  }, []);

  // Fuzzy search scoring function
  const getMatchScore = (text: string | null, query: string): number => {
    if (!text) return 0;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // Exact match (highest priority)
    if (lowerText === lowerQuery) return 100;

    // Prefix match
    if (lowerText.startsWith(lowerQuery)) return 80;

    // Substring match
    if (lowerText.includes(lowerQuery)) return 60;

    // Fuzzy match: check if characters appear in order
    let textIdx = 0;
    let queryIdx = 0;
    let consecutiveBonus = 0;
    let lastMatchIdx = -1;

    while (textIdx < lowerText.length && queryIdx < lowerQuery.length) {
      if (lowerText[textIdx] === lowerQuery[queryIdx]) {
        // Bonus for consecutive matches
        if (textIdx === lastMatchIdx + 1) {
          consecutiveBonus += 2;
        }
        lastMatchIdx = textIdx;
        queryIdx++;
      }
      textIdx++;
    }

    if (queryIdx === lowerQuery.length) {
      // All query characters found in order
      // Score based on how much of the text was "used"
      const compactness = 1 - textIdx / lowerText.length;
      return 30 + Math.floor(compactness * 20) + consecutiveBonus;
    }

    return 0;
  };

  // Filter models based on search with fuzzy matching
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const scored = allModels.map((model) => {
      const nameScore = getMatchScore(model.name, searchQuery);
      const idScore = getMatchScore(model.id, searchQuery);
      const labScore = getMatchScore(model.lab, searchQuery);

      const maxScore = Math.max(nameScore, idScore, labScore);
      const matchedField =
        nameScore >= idScore && nameScore >= labScore
          ? "name"
          : idScore >= labScore
            ? "id"
            : "lab";

      return { model, score: maxScore, matchedField };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        // Sort by score descending (higher score = better match)
        if (b.score !== a.score) return b.score - a.score;
        // Then by name alphabetically for same scores
        return a.model.name.localeCompare(b.model.name);
      });
  }, [allModels, searchQuery]);

  // Extract just the models for backward compatibility
  const filteredModels = filteredResults.map((r) => r.model);

  const addModel = (model: Model) => {
    if (!selectedModels.find((m) => m.id === model.id)) {
      setSelectedModels([...selectedModels, model]);
    }
    setSearchQuery("");
  };

  const removeModel = (modelId: string) => {
    setSelectedModels(selectedModels.filter((m) => m.id !== modelId));
  };

  const formatPrice = (price: string) => {
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    if (num === 0) return "Free";
    const perMillion = num * 1000000;
    return `$${perMillion.toFixed(2)}`;
  };

  const formatContextLength = (length?: number) => {
    if (!length) return "N/A";
    if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
    if (length >= 1000) return `${(length / 1000).toFixed(0)}K`;
    return length.toString();
  };

  if (isLoading) return <div className="loading">Loading models...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="model-comparison">
      <h1>Model Comparison</h1>

      {/* Search and Add Section */}
      <div className="search-container">
        <input
          type="text"
          placeholder="Search models by name, ID, or lab..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        {searchQuery && filteredResults.length > 0 && (
          <div className="search-results">
            {filteredResults
              .slice(0, 10)
              .map(({ model, score, matchedField }) => (
                <button
                  key={model.id}
                  onClick={() => addModel(model)}
                  className="search-result-item"
                >
                  <span>
                    <strong>{model.name}</strong>
                    <span
                      className="text-muted"
                      style={{ marginLeft: "0.5rem" }}
                    >
                      {model.lab}
                    </span>
                    <span
                      className="match-badge"
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.7rem",
                        padding: "0.1rem 0.4rem",
                        borderRadius: "3px",
                        backgroundColor:
                          score >= 80
                            ? "#10b981"
                            : score >= 60
                              ? "#3b82f6"
                              : "#6b7280",
                        color: "white",
                      }}
                    >
                      {score >= 100
                        ? "exact"
                        : score >= 80
                          ? "starts with"
                          : score >= 60
                            ? "contains"
                            : "fuzzy"}
                    </span>
                  </span>
                  <span className="text-muted">
                    {model.pricing ? formatPrice(model.pricing.prompt) : "N/A"}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Selected Models Display */}
      {selectedModels.length === 0 ? (
        <div className="empty-state">
          <p>No models selected</p>
          <p>Search and add models above to compare them</p>
        </div>
      ) : (
        <div className="model-grid">
          {selectedModels.map((model) => (
            <div key={model.id} className="model-card">
              <button
                onClick={() => removeModel(model.id)}
                className="remove-btn"
                title="Remove model"
              >
                ×
              </button>

              <h3>{model.name}</h3>

              <div className="model-info">
                <div className="info-row">
                  <span className="info-label">Provider:</span>
                  <span className="info-value">{model.provider}</span>
                </div>

                <div className="info-row">
                  <span className="info-label">Lab:</span>
                  <span className="info-value">{model.lab || "N/A"}</span>
                </div>

                <div className="info-row">
                  <span className="info-label">Context:</span>
                  <span className="info-value">
                    {formatContextLength(model.contextLength)}
                  </span>
                </div>

                {model.pricing && (
                  <div className="pricing-section">
                    <div className="pricing-title">Pricing (per 1M tokens)</div>
                    <div className="info-row">
                      <span className="info-label">Input:</span>
                      <span className="info-value price-prompt">
                        {formatPrice(model.pricing.prompt)}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Output:</span>
                      <span className="info-value price-completion">
                        {formatPrice(model.pricing.completion)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Comparison Table */}
      {selectedModels.length >= 2 && (
        <div>
          <h2>Detailed Comparison</h2>
          <div className="comparison-table-wrapper">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Attribute</th>
                  {selectedModels.map((m) => (
                    <th key={m.id}>{m.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="attr-label">Provider</td>
                  {selectedModels.map((m) => (
                    <td key={m.id}>{m.provider}</td>
                  ))}
                </tr>
                <tr>
                  <td className="attr-label">Lab</td>
                  {selectedModels.map((m) => (
                    <td key={m.id}>{m.lab || "N/A"}</td>
                  ))}
                </tr>
                <tr>
                  <td className="attr-label">Context Length</td>
                  {selectedModels.map((m) => (
                    <td key={m.id}>{formatContextLength(m.contextLength)}</td>
                  ))}
                </tr>
                <tr>
                  <td className="attr-label">Prompt Price</td>
                  {selectedModels.map((m) => (
                    <td key={m.id}>
                      {m.pricing ? formatPrice(m.pricing.prompt) : "N/A"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="attr-label">Completion Price</td>
                  {selectedModels.map((m) => (
                    <td key={m.id}>
                      {m.pricing ? formatPrice(m.pricing.completion) : "N/A"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="attr-label">Model ID</td>
                  {selectedModels.map((m) => (
                    <td key={m.id} className="text-muted">
                      {m.id}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
