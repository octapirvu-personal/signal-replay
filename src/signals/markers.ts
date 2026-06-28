/**
 * Whether the buy/sell signal arrows should be shown. For the Bollinger
 * strategy they follow the Bollinger Bands toggle (the signals are meaningless
 * without the bands); every other strategy (e.g. Hammer) always shows them.
 */
export function markersVisible(strategyId: string, showBands: boolean): boolean {
  return strategyId === "bb-reentry" ? showBands : true;
}
