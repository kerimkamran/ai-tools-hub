/**
 * Provider templates (Admin Panel Plan, capability 7). Client-safe: the
 * connection form renders from these. They say which fields to ask for, what
 * a key looks like, and whether an ADAPTER exists -- i.e. whether this
 * provider can actually power a purpose (the assistant, translation drafts).
 * Keys for every provider can be stored and tested today; only Anthropic has
 * an adapter. Each further adapter is a code change (about a day each).
 *
 * The authenticated test call for each template is in
 * src/lib/provider-test.ts (server-only).
 */

export type ProviderId = "anthropic" | "openai" | "gemini" | "azure_openai" | "mistral" | "custom";

export type ConfigField = {
  key: string;
  label: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  /** Strict pattern the value must match (checked server-side). */
  pattern?: string;
  max: number;
};

export type ProviderTemplate = {
  id: ProviderId;
  name: string;
  keyHint: string;
  /** Loose format check, to catch a key pasted into the wrong provider. */
  keyPattern?: string;
  fields: ConfigField[];
  /** A built-in adapter exists, so this provider can serve a purpose. */
  adapter: boolean;
  /** Models offered when this provider serves a purpose. */
  models?: Array<{ id: string; label: string }>;
};

export const PROVIDERS: ProviderTemplate[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    keyHint: "Starts with sk-ant-",
    keyPattern: "^sk-ant-[A-Za-z0-9_-]{20,}$",
    fields: [],
    adapter: true,
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 — most capable" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5 — balanced" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest, cheapest" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    keyHint: "Starts with sk-",
    keyPattern: "^sk-[A-Za-z0-9_-]{20,}$",
    fields: [
      { key: "organization", label: "Organization ID", placeholder: "org-…", pattern: "^org-[A-Za-z0-9]{6,64}$", max: 70 },
      { key: "project", label: "Project ID", placeholder: "proj_…", pattern: "^proj_[A-Za-z0-9]{6,64}$", max: 70 },
    ],
    adapter: false,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    keyHint: "Starts with AIza",
    keyPattern: "^AIza[0-9A-Za-z_-]{30,}$",
    fields: [],
    adapter: false,
  },
  {
    id: "azure_openai",
    name: "Azure OpenAI",
    keyHint: "The resource's key (32+ characters)",
    keyPattern: "^[A-Za-z0-9]{32,}$",
    fields: [
      {
        key: "endpoint",
        label: "Endpoint",
        required: true,
        placeholder: "https://my-resource.openai.azure.com",
        hint: "Must be an https://…openai.azure.com or …cognitiveservices.azure.com address.",
        max: 200,
      },
      { key: "apiVersion", label: "API version", required: true, placeholder: "2024-10-21", pattern: "^\\d{4}-\\d{2}-\\d{2}(-preview)?$", max: 20 },
    ],
    adapter: false,
  },
  {
    id: "mistral",
    name: "Mistral",
    keyHint: "32 characters",
    keyPattern: "^[A-Za-z0-9]{20,}$",
    fields: [],
    adapter: false,
  },
  {
    id: "custom",
    name: "Custom API",
    keyHint: "Sent only in the header you name — never in the URL",
    fields: [
      {
        key: "baseUrl",
        label: "Base URL",
        required: true,
        placeholder: "https://api.example.com/v1",
        hint: "Public https address. Localhost, private IPs and cloud metadata addresses are refused.",
        max: 300,
      },
      { key: "headerName", label: "Auth header name", required: true, placeholder: "Authorization", pattern: "^[A-Za-z0-9-]{1,40}$", max: 40 },
      { key: "headerPrefix", label: "Header value prefix", placeholder: "Bearer", hint: "Optional, e.g. Bearer. Leave empty to send the key as-is.", pattern: "^[A-Za-z]{0,20}$", max: 20 },
      { key: "testPath", label: "Test path", placeholder: "/models", hint: "Optional path requested by Test connection.", pattern: "^/[A-Za-z0-9/_.-]{0,100}$", max: 100 },
    ],
    adapter: false,
  },
];

export const PURPOSES = [
  { id: "assistant", label: "Staff assistant", hint: "Answers staff questions; also used by the knowledge base test console." },
  { id: "translation", label: "Translation drafts", hint: "“Draft with AI” on the Translations pages." },
] as const;
export type PurposeId = (typeof PURPOSES)[number]["id"];

export function providerById(id: string): ProviderTemplate | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isAzureEndpointHost(host: string): boolean {
  return /\.openai\.azure\.com$/i.test(host) || /\.cognitiveservices\.azure\.com$/i.test(host);
}
