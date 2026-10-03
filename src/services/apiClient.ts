export interface MasterApiAccount {
  id: number;
  username: string | null;
  first_name: string | null;
  balance_brl: number;
  total_spent_brl: number;
}

export interface MasterApiProduct {
  id: number;
  slug: string;
  title: string;
  description: string;
  price_brl: number;
  in_stock: boolean;
}

export interface MasterApiOrderResponse {
  ok: boolean;
  order?: {
    id: string;
    external_id: string;
    product_name: string;
    price_brl: number;
    delivered_value: string;
    supplier: string;
    status: string;
  };
  duplicate?: boolean;
  error?: string;
  balance_cents?: number;
}

export class MasterApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey.trim();
  }

  /**
   * Consulta os dados da conta do revendedor e saldo atual
   */
  async getAccount(): Promise<{ ok: boolean; user?: MasterApiAccount; error?: string }> {
    if (!this.apiKey) {
      return { ok: false, error: "Chave de API não informada." };
    }

    try {
      const res = await fetch(`${this.baseUrl}/developer/me`, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || `HTTP ${res.status}` };
      }

      return { ok: true, user: data.user };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha na conexão com a API mestra.";
      return { ok: false, error: msg };
    }
  }

  /**
   * Obtém os produtos disponíveis e custo unitário
   */
  async getProducts(): Promise<{ ok: boolean; products?: MasterApiProduct[]; error?: string }> {
    if (!this.apiKey) {
      return { ok: false, error: "Chave de API não configurada." };
    }

    try {
      const res = await fetch(`${this.baseUrl}/developer/products`, {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || `HTTP ${res.status}` };
      }

      return { ok: true, products: data.products || [] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao obter produtos da API.";
      return { ok: false, error: msg };
    }
  }

  /**
   * Emite um pedido com entrega imediata e idempotência via external_id
   */
  async createOrder(
    externalId: string,
    productSlug = "gemini-link-pro-18months"
  ): Promise<MasterApiOrderResponse> {
    if (!this.apiKey) {
      return { ok: false, error: "Chave de API não configurada." };
    }

    try {
      const res = await fetch(`${this.baseUrl}/developer/orders`, {
        method: "POST",
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          external_id: externalId,
          slug: productSlug,
        }),
        signal: AbortSignal.timeout(30000),
      });

      const data = (await res.json().catch(() => ({}))) as MasterApiOrderResponse;
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || `Erro na emissão do pedido (HTTP ${res.status})`,
        };
      }

      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao conectar com API de entrega.";
      return { ok: false, error: msg };
    }
  }
}
