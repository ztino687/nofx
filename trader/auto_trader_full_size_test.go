package trader

import (
	"nofx/kernel"
	"nofx/store"
	"testing"
)

func TestApplyAutopilotFullSizeOpenForClaw402(t *testing.T) {
	cfg := store.GetDefaultStrategyConfig("en")
	cfg.CoinSource.SourceType = "vergex_signal"
	cfg.RiskControl.BTCETHMaxLeverage = 10
	cfg.RiskControl.AltcoinMaxLeverage = 10
	cfg.RiskControl.BTCETHMaxPositionValueRatio = 10
	cfg.RiskControl.AltcoinMaxPositionValueRatio = 10

	at := &AutoTrader{config: AutoTraderConfig{StrategyConfig: &cfg}}
	decision := &kernel.Decision{
		Symbol:          "xyz:INTC",
		Action:          "open_long",
		Leverage:        3,
		PositionSizeUSD: 12,
	}

	at.applyAutopilotFullSizeOpen(decision, 29.8)

	if decision.Leverage != 10 {
		t.Fatalf("expected leverage to be forced to 10x, got %dx", decision.Leverage)
	}
	if decision.PositionSizeUSD != 298 {
		t.Fatalf("expected position size to use full 10x notional 298, got %.2f", decision.PositionSizeUSD)
	}
}

func TestDefaultAutopilotFullSizeOpenUsesFourPositionAllocation(t *testing.T) {
	cfg := store.GetDefaultStrategyConfig("en")
	cfg.CoinSource.SourceType = "vergex_signal"

	at := &AutoTrader{config: AutoTraderConfig{StrategyConfig: &cfg}}
	decision := &kernel.Decision{
		Symbol:          "xyz:INTC",
		Action:          "open_long",
		Leverage:        3,
		PositionSizeUSD: 12,
	}

	at.applyAutopilotFullSizeOpen(decision, 100)

	if cfg.RiskControl.MaxPositions != 4 {
		t.Fatalf("expected four default positions, got %d", cfg.RiskControl.MaxPositions)
	}
	if decision.Leverage != 10 {
		t.Fatalf("expected default leverage to remain 10x, got %dx", decision.Leverage)
	}
	if decision.PositionSizeUSD != 240 {
		t.Fatalf("expected each default position to use 2.4x equity notional, got %.2f", decision.PositionSizeUSD)
	}
}

func TestApplyAutopilotFullSizeOpenSkipsNonClaw402Strategies(t *testing.T) {
	cfg := store.GetDefaultStrategyConfig("en")
	cfg.CoinSource.SourceType = "static"
	cfg.RiskControl.BTCETHMaxLeverage = 10
	cfg.RiskControl.AltcoinMaxLeverage = 10

	at := &AutoTrader{config: AutoTraderConfig{StrategyConfig: &cfg}}
	decision := &kernel.Decision{
		Symbol:          "BTCUSDT",
		Action:          "open_long",
		Leverage:        3,
		PositionSizeUSD: 12,
	}

	at.applyAutopilotFullSizeOpen(decision, 29.8)

	if decision.Leverage != 3 || decision.PositionSizeUSD != 12 {
		t.Fatalf("non-Claw402 strategies should not be rewritten, got leverage=%d size=%.2f", decision.Leverage, decision.PositionSizeUSD)
	}
}
