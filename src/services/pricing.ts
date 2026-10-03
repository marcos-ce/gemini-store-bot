import { settingsRepo } from "../db/database.js";
import { MasterApiClient, fetchUpstreamProductCost } from "./apiClient.js";

export interface PriceCalculationResult {
  salePriceBrl: number;
  apiCostBrl: number;
  profitBrl: number;
  marginPercent: number;
  pricingMode: "fixed" | "margin";
  profitMarginPercent: number;
  isLoss: boolean; // Preço de venda menor ou igual ao custo da API
}

/**
 * Calcula o preço de venda efetivo da loja, consultando o custo da API mestra
 * e aplicando as regras do modo de precificação (Preço Fixo ou Margem de Lucro %).
 */
export async function calculateEffectivePrice(): Promise<PriceCalculationResult> {
  const config = settingsRepo.getConfig();
  let apiCostBrl = config.cachedApiCostBrl || 15.0;

  if (config.resellerApiKey) {
    try {
      const client = new MasterApiClient(config.apiBaseUrl, config.resellerApiKey);
      const costCheck = await fetchUpstreamProductCost(client, "gemini-link-pro-18months");
      if (costCheck.ok && costCheck.costBrl > 0) {
        apiCostBrl = costCheck.costBrl;
        if (Math.abs(config.cachedApiCostBrl - apiCostBrl) > 0.01) {
          settingsRepo.updateConfig({ cachedApiCostBrl: apiCostBrl });
        }
      }
    } catch {}
  }

  let salePriceBrl = config.salePriceBrl;

  if (config.pricingMode === "margin") {
    // No modo margem %, o preço é automaticamente recalculado sobre o custo da API
    salePriceBrl = Number((apiCostBrl * (1 + config.profitMarginPercent / 100)).toFixed(2));
  }

  const profitBrl = Number((salePriceBrl - apiCostBrl).toFixed(2));
  const isLoss = salePriceBrl <= apiCostBrl;
  const calculatedMargin =
    apiCostBrl > 0 ? Number(((profitBrl / apiCostBrl) * 100).toFixed(1)) : 0;

  return {
    salePriceBrl,
    apiCostBrl,
    profitBrl,
    marginPercent: config.pricingMode === "margin" ? config.profitMarginPercent : calculatedMargin,
    pricingMode: config.pricingMode,
    profitMarginPercent: config.profitMarginPercent,
    isLoss,
  };
}
