import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { calculate } from './engine';
import type { Account, Snapshot } from './schema';
export function StressChart({ account, snapshot, changePercent, cashDelta }: { account: Account; snapshot: Snapshot | null; changePercent: string; cashDelta: string }) {
  const samples = useMemo(() => Array.from({ length: 17 }, (_, i) => {
    const change = -50 + i * 5;
    try { const r = calculate(account, snapshot, { changePercent: String(change), cashDelta }); return { change, rate: r.ratio === null ? null : Number(r.ratio) }; }
    catch { return { change, rate: null }; }
  }), [account, snapshot, cashDelta]);
  if (samples.some(p => p.rate === null)) return <Text style={{ color: '#8794a8', fontSize: 12, lineHeight: 20 }}>建玉と終値が揃うと、価格変動に対する維持率のグラフを表示します。</Text>;
  const values = samples.map(p => p.rate!);
  const low = Math.floor(Math.min(0, ...values) / 10) * 10, high = Math.ceil(Math.max(40, ...values) / 10) * 10;
  const x = (change: number) => 44 + (change + 50) / 80 * 278;
  const y = (rate: number) => 172 - (rate - low) / (high - low) * 142;
  let marker: number | null = null;
  try { const r = calculate(account, snapshot, { changePercent, cashDelta }); marker = r.ratio === null ? null : Number(r.ratio); } catch { /* 入力検証は呼び出し元で表示 */ }
  const change = Number(changePercent);
  return <View style={{ gap: 8 }}>
    <Svg width="100%" height={225} viewBox="0 0 340 225" accessibilityLabel="株価変動率と信用維持率のグラフ。赤い破線は20パーセント">
      {[0, 1, 2, 3, 4].map(i => { const rate = low + (high - low) * i / 4; return <React.Fragment key={i}><Line x1={44} x2={322} y1={y(rate)} y2={y(rate)} stroke="#293446"/><SvgText x={37} y={y(rate) + 4} textAnchor="end" fill="#8794a8" fontSize={10}>{rate.toFixed(0)}%</SvgText></React.Fragment>; })}
      {[-50, -30, -10, 10, 30].map(v => <React.Fragment key={v}><Line x1={x(v)} x2={x(v)} y1={30} y2={172} stroke="#222d3d"/><SvgText x={x(v)} y={193} textAnchor="middle" fill="#8794a8" fontSize={10}>{v}%</SvgText></React.Fragment>)}
      <Line x1={44} x2={322} y1={y(20)} y2={y(20)} stroke="#f36b79" strokeDasharray="5 4" strokeWidth={1.5}/>
      <SvgText x={318} y={y(20) - 6} textAnchor="end" fill="#f36b79" fontSize={10}>20%ライン</SvgText>
      <Polyline points={samples.map(p => `${x(p.change)},${y(p.rate!)}`).join(' ')} fill="none" stroke="#66cee5" strokeWidth={2.5}/>
      {marker !== null && change >= -50 && change <= 30 && <><Line x1={x(change)} x2={x(change)} y1={30} y2={172} stroke="#647b98" strokeDasharray="3 4"/><Circle cx={x(change)} cy={y(marker)} r={4} fill="#e6f6ff" stroke="#66cee5" strokeWidth={2}/></>}
      <SvgText x={180} y={216} textAnchor="middle" fill="#8794a8" fontSize={10}>全銘柄の価格変化率（仮定）</SvgText>
    </Svg>
    <Text style={{ fontSize: 11, color: '#8794a8', lineHeight: 18 }}>買建・売建・代用株を同じ割合で動かした試算です。グラフは5%刻み、選択点はその変化率で計算しています。</Text>
  </View>;
}
