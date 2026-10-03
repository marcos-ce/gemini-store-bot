import QRCode from "qrcode";

export interface PixPaymentResponse {
  id: string;
  status: string;
  qrCode: string;
  qrCodeBase64?: string;
  qrCodeBuffer?: Buffer;
  ticketUrl?: string;
  error?: string;
}

export class MercadoPagoService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken.trim();
  }

  /**
   * Testa a validade do Access Token do Mercado Pago
   */
  async testConnection(): Promise<{ ok: boolean; nickname?: string; email?: string; error?: string }> {
    if (!this.accessToken) {
      return { ok: false, error: "Access Token não informado." };
    }

    try {
      const res = await fetch("https://api.mercadopago.com/users/me", {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        if (res.status === 401) {
          return { ok: false, error: "Token inválido ou expirado. Verifique suas credenciais." };
        }
        return { ok: false, error: `Mercado Pago retornou HTTP ${res.status}` };
      }

      const data = (await res.json()) as any;
      return {
        ok: true,
        nickname: data.nickname || data.first_name || "Usuário MP",
        email: data.email,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      return { ok: false, error: `Falha na conexão com Mercado Pago: ${msg}` };
    }
  }

  /**
   * Cria uma cobrança PIX imediata com expiração de 15 minutos
   */
  async createPix(params: {
    amountBrl: number;
    description: string;
    payerEmail?: string;
    externalReference: string;
  }): Promise<{ ok: boolean; payment?: PixPaymentResponse; error?: string }> {
    if (!this.accessToken) {
      return { ok: false, error: "Access Token do Mercado Pago não configurado." };
    }

    try {
      const expirationDate = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const idempotencyKey = `PIX-${params.externalReference}-${Date.now()}`;

      const res = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          transaction_amount: Number(params.amountBrl.toFixed(2)),
          description: params.description,
          payment_method_id: "pix",
          date_of_expiration: expirationDate,
          external_reference: params.externalReference,
          payer: {
            email: params.payerEmail || "cliente@comprador.com",
          },
        }),
        signal: AbortSignal.timeout(12000),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        const errorDetail = data.message || data.cause?.[0]?.description || `HTTP ${res.status}`;
        return { ok: false, error: errorDetail };
      }

      const txData = data.point_of_interaction?.transaction_data;
      const qrCode = txData?.qr_code || "";
      const qrCodeBase64 = txData?.qr_code_base64;
      const ticketUrl = txData?.ticket_url;

      let qrCodeBuffer: Buffer | undefined;
      if (qrCode) {
        try {
          qrCodeBuffer = await QRCode.toBuffer(qrCode, {
            margin: 2,
            width: 400,
            color: { dark: "#000000", light: "#ffffff" },
          });
        } catch {}
      }

      return {
        ok: true,
        payment: {
          id: String(data.id),
          status: data.status,
          qrCode,
          qrCodeBase64,
          qrCodeBuffer,
          ticketUrl,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      return { ok: false, error: `Falha ao gerar PIX: ${msg}` };
    }
  }

  /**
   * Consulta o status atualizado do pagamento
   */
  async getPaymentStatus(paymentId: string): Promise<{ status: string; approved: boolean; error?: string }> {
    try {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return { status: "unknown", approved: false, error: `HTTP ${res.status}` };
      }

      const data = (await res.json()) as any;
      const status = data.status || "pending";
      return {
        status,
        approved: status === "approved",
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro";
      return { status: "error", approved: false, error: msg };
    }
  }
}
