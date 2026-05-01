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
  architecture?: Record<string, unknown>;
  timestamp: string;
}
