import { api } from './api'
import type { MarketSymbol } from './api/data'
import type { AIModel, Exchange, StrategyConfig } from '../types'

export interface QuickTradeResult {
  traderId: string
  traderName: string
  strategyId: string
  strategyName: string
  symbol: string
  display: string
  reusedTrader: boolean
}

function compactSymbolName(symbol: string) {
  return symbol.replace(/^xyz:/i, '').replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 16) || 'SYMBOL'
}

function pickEnabledModel(models: AIModel[]) {
  return models.find((m) => m.enabled)
}

function pickHyperliquidExchange(exchanges: Exchange[]) {
  return exchanges.find((e) => {
    const type = (e.exchange_type || e.id || '').toLowerCase()
    return type === 'hyperliquid' && e.enabled && !!e.hyperliquidWalletAddr?.trim()
  })
}

function buildSingleSymbolConfig(base: StrategyConfig, symbol: string, language: 'zh' | 'en'): StrategyConfig {
  const staticCoinSource = {
    source_type: 'static' as const,
    static_coins: [symbol],
    excluded_coins: [],
    use_ai500: false,
    use_oi_top: false,
    use_oi_low: false,
    use_hyper_all: false,
    use_hyper_main: false,
  }
  const customPrompt =
    language === 'zh'
      ? `只交易 Hyperliquid USDC 永续合约 ${symbol}。每次决策必须先检查账户余额、现有持仓、最新价格、趋势、成交量、资金费率和风险限制。没有明确优势时保持观望。单标的策略，不要切换到其他币种。`
      : `Trade only the Hyperliquid USDC perpetual market ${symbol}. Before every decision, check balance, current positions, latest price, trend, volume, funding, and risk limits. Stay flat when there is no clear edge. Single-symbol strategy; do not switch to other symbols.`

  return {
    ...base,
    strategy_type: 'ai_trading',
    language,
    coin_source: staticCoinSource,
    custom_prompt: customPrompt,
    ai_config: {
      ...(base.ai_config || {}),
      coin_source: staticCoinSource,
      indicators: base.ai_config?.indicators || base.indicators!,
      risk_control: base.ai_config?.risk_control || base.risk_control!,
      prompt_sections: base.ai_config?.prompt_sections || base.prompt_sections,
      custom_prompt: customPrompt,
    },
  }
}

export async function createHyperliquidQuickTrader(
  symbolInput: MarketSymbol | { symbol: string; display?: string },
  language: 'zh' | 'en'
): Promise<QuickTradeResult> {
  const symbol = symbolInput.symbol
  const display = symbolInput.display || symbol
  const compact = compactSymbolName(display)
  const traderName = `HL ${compact} Quick`.slice(0, 50)
  const strategyName = `HL ${compact} Strategy`.slice(0, 50)

  const [models, exchanges, traders, strategies] = await Promise.all([
    api.getModelConfigs(),
    api.getExchangeConfigs(),
    api.getTraders(true),
    api.getStrategies().catch(() => []),
  ])

  const model = pickEnabledModel(models)
  if (!model) {
    throw new Error(language === 'zh' ? '没有可用 AI 模型，请先在 Config 里启用模型。' : 'No enabled AI model. Enable a model in Config first.')
  }

  const exchange = pickHyperliquidExchange(exchanges)
  if (!exchange) {
    throw new Error(language === 'zh' ? '没有可用 Hyperliquid 钱包，请先连接并保存 Hyperliquid。' : 'No usable Hyperliquid wallet. Connect and save Hyperliquid first.')
  }

  const existingTrader = traders.find((tr: any) =>
    String(tr.name || '').toLowerCase() === traderName.toLowerCase() ||
    (String(tr.exchange_id || '') === exchange.id && String(tr.trading_symbols || '').split(',').map((s) => s.trim()).includes(symbol))
  )
  if (existingTrader) {
    const existing = existingTrader as any
    return {
      traderId: existing.trader_id || existing.id,
      traderName: existing.trader_name || existing.name || traderName,
      strategyId: existing.strategy_id || '',
      strategyName,
      symbol,
      display,
      reusedTrader: true,
    }
  }

  let strategy = strategies.find((s: any) => String(s.name || '').toLowerCase() === strategyName.toLowerCase()) as any
  if (!strategy?.id) {
    const defaultConfig = await api.getDefaultStrategyConfig()
    const config = buildSingleSymbolConfig(defaultConfig, symbol, language)
    strategy = await api.createStrategy({
      name: strategyName,
      description:
        language === 'zh'
          ? `Hyperliquid ${display} 单标的快速交易策略。`
          : `Hyperliquid ${display} single-symbol quick trading strategy.`,
      config,
    } as any)
  }

  const trader = await api.createTrader({
    name: traderName,
    ai_model_id: model.id,
    exchange_id: exchange.id,
    strategy_id: strategy.id,
    scan_interval_minutes: 5,
    trading_symbols: symbol,
    show_in_competition: false,
    custom_prompt:
      language === 'zh'
        ? `固定只交易 Hyperliquid ${symbol}，不要扩展到其他标的。启动前再次检查余额、仓位和风险。`
        : `Only trade Hyperliquid ${symbol}; do not expand to other symbols. Re-check balance, positions, and risk before starting.`,
  })

  return {
    traderId: trader.trader_id || (trader as any).id,
    traderName: trader.trader_name || (trader as any).name || traderName,
    strategyId: strategy.id,
    strategyName,
    symbol,
    display,
    reusedTrader: false,
  }
}
