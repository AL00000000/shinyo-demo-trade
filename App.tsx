import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Decimal from 'decimal.js';
import Slider from './src/PriceSlider';
import { buildSecurityIndex, searchSecurities } from './src/security-search';
import { StressChart } from './src/StressChart';
import { readAccessKey, saveAccessKey, keyStorageNote, consumeSetupKey } from './src/access-key';
import { accountSchema, collateralSchema, positionSchema, snapshotSchema, type Account, type Snapshot } from './src/schema';
import { calculate, findQuote, todayJst, yen } from './src/engine';
import { demoPortfolio, demoSnapshot } from './src/demo';
import { createPortfolio, readPortfolio, restorePortfolio, patternSchema, updatePatternAccount, type Portfolio } from './src/patterns';

const KEY = 'shinyo-note-v1';
type Tab = '状況' | '建玉・代用' | '途中式' | '設定';
type Saved = Portfolio & { snapshot: Snapshot | null; apiUrl: string; syncedAt: string | null; syncError: string | null };
const init: Saved = { ...createPortfolio(), snapshot: null, apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '', syncedAt: null, syncError: null };
function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: .5 }]}><Text style={[s.buttonText, secondary && { color: '#83cde6' }]}>{title}</Text></Pressable>;
}
function Field({ label, value, onChange, numeric = false, placeholder }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; placeholder?: string }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={s.input} value={value} onChangeText={onChange} keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} autoCapitalize="none" placeholder={placeholder} placeholderTextColor="#627085" /></View>;
}
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={s.row}><Text style={[s.rowLabel, strong && s.bold]}>{label}</Text><Text selectable style={[s.rowValue, strong && s.bold]}>{value}</Text></View>;
}
function Card({ title, children }: React.PropsWithChildren<{ title?: string }>) { return <View style={s.card}>{title && <Text style={s.cardTitle}>{title}</Text>}{children}</View>; }
const amount = (v: string | null) => v === null ? '未算出' : yen(v);
const exact = (v: string | null) => {
  if (v === null) return '未算出';
  const value = new Decimal(v), a = value.abs();
  const unit = a.gte(100000000) ? '億円' : a.gte(10000) ? '万円' : '円';
  const divisor = unit === '億円' ? 100000000 : unit === '万円' ? 10000 : 1;
  return `${value.isNegative() ? '−' : ''}${a.div(divisor).toFixed()}${unit}`;
};
const id = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function App() { return <SafeAreaProvider><Main /></SafeAreaProvider>; }
function Main() {
  const [saved, setSaved] = useState<Saved>(init), [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('建玉・代用'), [demo, setDemo] = useState(false), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(''), [storageError, setStorageError] = useState('');
  const [editor, setEditor] = useState<{ kind: 'position' | 'collateral'; index: number | null } | null>(null);
  const [money, setMoney] = useState({ cash: '0', costs: '0', unsettled: '0' });
  const [extraPatterns, setExtraPatterns] = useState(false);
  const mainScroll = useRef<ScrollView>(null);
  const [patternName, setPatternName] = useState('パターン1');
  const [apiDraft, setApiDraft] = useState(''), [backup, setBackup] = useState('');
  const [apiAccessKey, setApiAccessKey] = useState('');
  const [rememberKey, setRememberKey] = useState(false), [keyLoaded, setKeyLoaded] = useState(false);
  const keySaveQueue = useRef(Promise.resolve());
  const [change, setChange] = useState('0'), [cashDelta, setCashDelta] = useState('0');
  const [scenario, setScenario] = useState({ changePercent: '0', cashDelta: '0' });
  const [deletePrompt, setDeletePrompt] = useState<string | null>(null);
  const syncLock = useRef(false), saveQueue = useRef(Promise.resolve()), generation = useRef(0);
  const patterns = demo ? demoPortfolio.patterns : saved.patterns;
  const active = patterns[saved.activePattern];
  const account = active.account, snapshot = demo ? demoSnapshot : saved.snapshot;
  const comparisons = patterns.map(p => ({ ...p, result: calculate(p.account, snapshot) }));
  const result = calculate(account, snapshot);
  const simulation = (() => { try { return { value: calculate(account, snapshot, scenario), error: null }; } catch { return { value: result, error: '入力が変わりました。試算条件を再設定してください' }; } })();
  const simulated = simulation.value;
  const isScenario = !simulation.error && (scenario.changePercent !== '0' || scenario.cashDelta !== '0');
  const oldCalendar = !demo && snapshot && Date.now() - Date.parse(snapshot.generatedAt) > 30 * 3600_000;

  useEffect(() => {
    const setupKey = consumeSetupKey();
    if (setupKey) { setApiAccessKey(setupKey); setNotice('本人用キーを設定しました。設定で「この端末に保存」を選ぶと次回も自動接続できます。'); }
    readAccessKey().then(value => { if (value && !setupKey) { setApiAccessKey(value); setRememberKey(true); } else if (value === setupKey && value) setRememberKey(true); }).catch(() => setNotice('接続キーを読み込めませんでした。設定で入力してください。')).finally(() => setKeyLoaded(true));
  }, []);
  useEffect(() => {
    if (!keyLoaded) return;
    if (rememberKey && !/^[A-Za-z0-9_-]{32,256}$/.test(apiAccessKey)) return;
    keySaveQueue.current = keySaveQueue.current.then(() => saveAccessKey(rememberKey ? apiAccessKey : null)).catch(() => setNotice('接続キーの保存に失敗しました。保存領域を確認してください。'));
  }, [rememberKey,apiAccessKey,keyLoaded]);
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const value = JSON.parse(raw);
          const restored: Saved = { ...init, ...readPortfolio(value), activePattern: 0, snapshot: value.snapshot ? snapshotSchema.parse(value.snapshot) : null,
            apiUrl: typeof value.apiUrl === 'string' ? value.apiUrl : '', syncedAt: typeof value.syncedAt === 'string' ? value.syncedAt : null, syncError: typeof value.syncError === 'string' ? value.syncError : null };
          setSaved(restored);
        }
      } catch { setStorageError('保存データを読み込めませんでした。上書きを防ぐため保存を停止しています。バックアップを確認してください。'); }
      finally { setLoaded(true); }
    })();
  }, []);
  useEffect(() => {
    if (!loaded || storageError) return;
    // 保存順序を保ち、古い非同期書き込みが新しい入力を上書きしない。
    saveQueue.current = saveQueue.current.then(() => AsyncStorage.setItem(KEY, JSON.stringify(saved))).catch(() => setStorageError('端末への保存に失敗しました。バックアップを保存してください。'));
  }, [saved, loaded, storageError]);
  useEffect(() => { setMoney({ cash: account.cash, costs: account.costs, unsettled: account.unsettled }); }, [account]);
  useEffect(() => { setPatternName(active.name); }, [active.name, saved.activePattern]);
  useEffect(() => { setApiDraft(saved.apiUrl); }, [saved.apiUrl]);
  useEffect(() => { mainScroll.current?.scrollTo({y:0,animated:false}); }, [tab,saved.activePattern]);
  const refresh = useCallback(async () => {
    if (syncLock.current || demo || !/^[A-Za-z0-9_-]{32,256}$/.test(apiAccessKey)) return;
    syncLock.current = true; setBusy(true); const g = generation.current;
    try {
      let endpoint = saved.apiUrl;
      if (!endpoint) {
        const discovery = await fetch('https://al00000000.github.io/shinyo-demo-trade/api-endpoint.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!discovery.ok) throw new Error('本人用サーバーの接続先を確認できません');
        const config = await discovery.json();
        if (typeof config.url !== 'string' || !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(config.url)) throw new Error('本人用サーバーの接続先が不正です');
        endpoint = config.url;
      }
      const url = new URL(endpoint);
      if (url.protocol !== 'https:' && !(Platform.OS === 'web' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('公開APIはHTTPSで設定してください');
      if (url.username || url.password || url.search) throw new Error('API URLに認証情報を含めないでください');
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/snapshot`, { headers: { Authorization: `Bearer ${apiAccessKey}` }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`終値取得待ち（HTTP ${response.status}）`);
      const data = await response.json();
      const incoming = snapshotSchema.parse(data.snapshot);
      if (generation.current !== g) return;
      setSaved(previous => {
        if (previous.snapshot && (incoming.tradingDate < previous.snapshot.tradingDate || incoming.generatedAt < previous.snapshot.generatedAt)) return { ...previous, syncError: '古いデータを受信したため前回の終値を保持しました' };
        return { ...previous, snapshot: incoming, syncedAt: new Date().toISOString(), syncError: typeof data.error === 'string' ? data.error : null };
      });
      setNotice('終値データを更新しました');
    } catch (e) {
      if (generation.current === g) setSaved(v => ({ ...v, syncError: e instanceof Error ? e.message : '通信に失敗しました' }));
    } finally { syncLock.current = false; setBusy(false); }
  }, [saved.apiUrl, demo, apiAccessKey]);
  useEffect(() => {
    if (!loaded) return;
    void refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15 * 60000);
    return () => { listener.remove(); clearInterval(timer); };
  }, [loaded, refresh]);
  function editAccount(next: Account) {
    if (demo) { setNotice('サンプル表示を終了すると、ご自身の建玉を入力できます'); return; }
    try { const parsed = accountSchema.parse(next); setSaved(v => ({ ...v, ...updatePatternAccount(v, parsed) })); setNotice(`${active.name}を端末に保存しました`); }
    catch { setNotice('入力を確認してください。金額は半角数字、株数は正の整数です'); }
  }
  function applyScenario() {
    try { calculate(account, snapshot, { changePercent: change, cashDelta }); setScenario({ changePercent: change, cashDelta }); setNotice('仮定の価格で再計算しました'); }
    catch (e) { setNotice((e as Error).message); }
  }
  function slideScenario(value: number) {
    const next = { changePercent: String(value), cashDelta: scenario.cashDelta };
    try { calculate(account, snapshot, next); setChange(next.changePercent); setScenario(next); }
    catch (e) { setNotice((e as Error).message); }
  }
  function selectPattern(index: number) {
    setSaved(v => ({ ...v, activePattern: index })); setEditor(null); setNotice('');
    setScenario({ changePercent: '0', cashDelta: '0' }); setChange('0'); setCashDelta('0');
  }
  if (!loaded) return <SafeAreaView style={s.safe}><ActivityIndicator color="#2f6fe4" /></SafeAreaView>;
  return <SafeAreaView style={s.safe}>
    <View style={s.header}><View><Text style={s.eyebrow}>MARGIN NOTE / SBI基準</Text><Text style={s.title}>信用デモ取引</Text></View><Text style={s.tag}>終値で計算</Text></View>
    <View style={s.tabs}>{(['建玉・代用', '状況', '途中式', '設定'] as Tab[]).map(t => <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: t === tab }} onPress={() => setTab(t)} style={[s.tab, t === tab && s.activeTab]}><Text style={[s.tabText, t === tab && s.activeTabText]}>{t === '建玉・代用' ? '銘柄' : t === '状況' ? '維持率' : t}</Text></Pressable>)}</View>
    <ScrollView ref={mainScroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {demo && <View style={s.warning}><Text style={s.warningText}>サンプル表示 · 全価格は架空です</Text><Button title="サンプルを終了" secondary onPress={() => { setDemo(false); setScenario({ changePercent: '0', cashDelta: '0' }); }} /></View>}
      {saved.activePattern !== 0 && <Text style={s.activePatternNote}>{active.name}</Text>}
      {storageError !== '' && <Text style={s.error}>{storageError}</Text>}
      {tab !== '建玉・代用' && notice !== '' && <Pressable onPress={() => setNotice('')}><Text style={s.notice}>{notice} ×</Text></Pressable>}
      {simulation.error && <Text style={s.error}>{simulation.error}</Text>}
      {tab !== '建玉・代用' && !demo && (saved.syncError || oldCalendar) && <View style={s.warning}><Text style={s.warningText}>現在の営業日まで更新できているか確認が必要です</Text><Text style={s.body}>{saved.syncError ?? '配信元の生成から30時間以上経過しています' }。表示値は前回取得分の参考値です。</Text></View>}
      {tab === '設定' && !demo && snapshot?.coverageNote && <View style={s.warning}><Text style={s.warningText}>本人用の取得範囲</Text><Text style={s.body}>{snapshot.coverageNote}</Text></View>}
      {tab === '状況' && <>
        <View style={s.hero}><Text style={s.heroLabel}>{demo ? 'サンプルの維持率' : '終値ベースの維持率'}</Text><Text style={s.rate}>{result.ratio ?? '—'}<Text style={s.percent}> %</Text></Text><Text style={s.heroBody}>{!result.complete ? '価格未取得 / 計算を保留' : result.ratio === null ? '建玉を登録してください' : result.below20 ? '20%未満 · 追証水準の参考判定' : result.below30 ? '20%以上30%未満' : '30%以上'}</Text><View style={s.heroDivider}/><Text style={s.heroBody}>終値日 {result.date ?? '未取得'} · 評価益は保証金に加算しません</Text></View>
        <Card title="参考指標"><View style={s.grid}><View style={s.tile}><Text style={s.label}>評価益込み維持率</Text><Text style={s.tileValue}>{result.profitInclusiveRatio === null ? "—" : `${result.profitInclusiveRatio}%`}</Text><Text style={s.note}>税率20.315%・表示用</Text></View><View style={s.tile}><Text style={s.label}>実質レバレッジ</Text><Text style={s.tileValue}>{result.effectiveLeverage === null ? "—" : `${result.effectiveLeverage}倍`}</Text><Text style={s.note}>総ポジション ÷ 税引前純資産</Text></View></View><Row label="純資産（登録分・税引前）" value={amount(result.netAssets)}/><Row label="総ポジション時価" value={amount(result.totalExposure)}/><Text style={s.note}>評価益込み維持率は通算評価益から20.315%の税金相当額を控除。実質レバレッジの純資産は税引前です。登録した現金・代用株・信用建玉から算出します。代用株は掛目前の時価、売建玉も正の時価で合算。純資産が0以下ならレバレッジは未算出です。追証判定にはSBI基準の維持率を使います。</Text></Card>
        {!result.complete && <Card title="計算を保留した理由">{result.issues.map(i => <Text key={i} style={s.error}>{i}</Text>)}</Card>}
        <View style={s.grid}><View style={s.tile}><Text style={s.label}>実質保証金</Text><Text style={s.tileValue}>{amount(result.effective)}</Text></View><View style={s.tile}><Text style={s.label}>建玉代金 · 建値基準</Text><Text style={s.tileValue}>{amount(result.notional)}</Text></View></View>
        <Card title="保証金の内訳"><Row label="現金" value={amount(result.cash)} /><Row label="代用株の評価額" value={amount(result.collateralValue)} /><Row label="建玉の評価損益（通算）" value={amount(result.pnl)} /><Row label="保証金から差し引く評価損" value={amount(result.deduction)} /><Row label="諸経費" value={amount(result.costs)} /><Row label="受渡前の決済損益" value={amount(result.unsettled)} /><Row strong label="20%までの余裕 / 不足（−）" value={amount(result.buffer)} /><Row label="20%回復に必要な現金（概算）" value={amount(result.gap)} /><Text style={s.note}>過去に発生した追証は、株価が回復しても自動で解消されません。上の金額は現在の率を20%へ戻す試算です。</Text>{result.depositBelowMinimum && <Text style={s.note}>差入保証金（現金＋代用評価額）が30万円未満です。最低保証金の条件は口座で確認してください。</Text>}</Card>
        <Card title="株価変動と追証ライン"><Text style={s.body}>全建玉と代用株の価格を同じ割合で動かします。売建玉は価格上昇で損失になります。</Text><Row label="株価変動率" value={`${scenario.changePercent}%`} strong/><Slider accessibilityLabel="株価変動率スライダー" minimumValue={-50} maximumValue={30} step={1} value={Math.max(-50, Math.min(30, Number(scenario.changePercent)))} onValueChange={slideScenario} minimumTrackTintColor="#66cee5" maximumTrackTintColor="#344258" thumbTintColor="#d6f5ff"/><StressChart account={account} snapshot={snapshot} changePercent={scenario.changePercent} cashDelta={scenario.cashDelta}/><View style={s.chips}>{['-20', '-10', '-5', '0', '5', '10'].map(v => <Pressable key={v} style={s.chip} onPress={() => setChange(v)}><Text style={s.chipText}>{v}%</Text></Pressable>)}</View><Field label="価格変化率（%）" numeric value={change} onChange={setChange} /><Field label="現金の入出金（円・出金はマイナス）" numeric value={cashDelta} onChange={setCashDelta} /><Button title="この条件で試算" onPress={applyScenario}/>{isScenario && <View style={s.scenario}><Text style={s.cardTitle}>仮定：価格 {scenario.changePercent}% / 入出金 {yen(scenario.cashDelta)}</Text><Row label="試算した維持率" value={simulated.ratio === null ? '未算出' : `${simulated.ratio}%`} strong/><Row label="評価益込み維持率（税引後・参考）" value={simulated.profitInclusiveRatio === null ? "未算出" : `${simulated.profitInclusiveRatio}%`}/><Row label="実質レバレッジ（参考）" value={simulated.effectiveLeverage === null ? "未算出" : `${simulated.effectiveLeverage}倍`}/><Row label="純資産（登録分）" value={amount(simulated.netAssets)}/><Row label="実質保証金" value={amount(simulated.effective)}/><Row label="20%回復に必要な現金" value={amount(simulated.gap)}/><Button title="仮定を解除" secondary onPress={() => { setScenario({ changePercent: '0', cashDelta: '0' }); setChange('0'); setCashDelta('0'); }}/></View>}</Card>
        <Button title={busy ? '終値を取得中…' : '終値を更新'} disabled={busy || demo || !apiAccessKey} onPress={() => void refresh()} /><Text style={s.note}>サーバーはアプリを閉じていても日次取得します。端末の表示は起動時・復帰時と、利用中の15分ごとの通信で更新します。</Text>
      </>}
      {tab === '建玉・代用' && <>
        <View style={s.holdingsHeading}><View style={{flex:1}}><Text style={s.sectionTitle}>保有している信用建玉</Text><Text style={s.note}>現値は最新の終値 · {snapshot?.tradingDate ?? '未取得'}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="信用建玉を追加" disabled={demo} style={s.addPosition} onPress={() => setEditor({kind:'position',index:null})}><Text style={s.chipText}>＋ 建玉</Text></Pressable></View>
        {account.positions.map((p,index) => {
          const quote = snapshot ? findQuote(snapshot,p.code) : undefined;
          return <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.code} ${p.name || quote?.name || ''}の建玉を編集`} disabled={demo} style={s.holding} onPress={() => setEditor({kind:'position',index})}>
            <View style={s.itemHeading}><Text numberOfLines={2} style={s.stockName}>{p.name || quote?.name || p.code}</Text><Text style={s.stockCode}>{p.code}</Text></View>
            <Text style={s.note}>{p.side === 'buy' ? '買建' : '売建'} · {p.quantity.toLocaleString()}株</Text>
            <View style={s.priceColumns}><View style={s.priceColumn}><Text style={s.label}>建値</Text><Text selectable style={s.stockPrice}>{exact(p.entry)}</Text></View><View style={[s.priceColumn,s.currentColumn]}><Text style={s.label}>現値（終値）</Text><Text selectable style={[s.stockPrice,s.currentPrice]}>{quote?.close ? exact(quote.close) : '未取得'}</Text></View></View>
          </Pressable>;
        })}
        {!account.positions.length && <Card title="建玉を登録してください"><Text style={s.body}>上の「＋ 建玉」から銘柄・株数・建値を入力します。登録後はここに建値と最新の終値が並びます。</Text></Card>}
        <Pressable accessibilityRole="button" disabled={busy || demo || !apiAccessKey} onPress={() => void refresh()} style={s.refreshCompact}><Text style={s.chipText}>{busy ? '終値を取得中…' : '終値を更新'}</Text></Pressable>
        {!demo && saved.syncError && <Text style={s.error}>{saved.syncError}。前回取得した終値を表示しています。</Text>}
        {!snapshot && !apiAccessKey && <Button title="終値への接続を設定" secondary onPress={() => setTab('設定')}/>}
        <Text style={s.note}>銘柄をタップして建玉を編集できます。維持率と計算の内訳は上のタブから確認できます。</Text>
        <Text style={s.sectionTitle}>代用有価証券 <Text style={s.count}>{account.collaterals.length}件</Text></Text>
        {result.collaterals.map((c, index) => <Card key={c.id} title={`${c.code} ${c.name}`}><Row label={`${c.quantity.toLocaleString()}株 / 掛目`} value={`${c.haircut}%`}/><Row label="評価に使用した価格" value={exact(c.price)}/><Row label="代用評価額" value={amount(c.value)}/><Button title="編集・削除 / 権利処理を確認" secondary disabled={demo} onPress={() => setEditor({ kind: 'collateral', index })}/></Card>)}
        <Button title="＋ 代用株を追加" disabled={demo} onPress={() => setEditor({ kind: 'collateral', index: null })}/><Text style={s.note}>受渡済みで信用保証金に差し入れている株だけ登録してください。掛目は銘柄ごとに変更できます。代用不適格は0%。投資信託の基準価額自動取得には対応していません。</Text>
        <Card title="保証金・費用（円）"><Field label="委託保証金現金" numeric value={money.cash} onChange={cash => setMoney(v => ({ ...v, cash }))}/><Field label="支払諸経費の合計" numeric value={money.costs} onChange={costs => setMoney(v => ({ ...v, costs }))}/><Field label="受渡未到来の決済損益（損はマイナス）" numeric value={money.unsettled} onChange={unsettled => setMoney(v => ({ ...v, unsettled }))}/><Text style={s.note}>金利・貸株料・逆日歩・手数料・配当調整金など、SBIの口座に計上される支払諸経費合計を手入力してください。受渡済み損益は現金へ反映し、この欄から除きます。</Text><Button title="金額を保存" disabled={demo} onPress={() => editAccount({ ...account, ...money })}/></Card>
      </>}
      {tab === '途中式' && <>
        <Card title="計算ルール · SBI通常信用"><Text selectable style={s.formula}>維持率 ＝ 実質保証金 ÷ 建玉代金合計 × 100</Text><Text style={s.body}>建玉代金は、建値×株数。株価が動いても分母は変わりません。売建・買建とも正の金額で合算します。</Text></Card>
        <Card title="① 建玉ごとの評価損益">{result.positions.map(p => <View key={p.id} style={s.step}><Text style={s.bold}>{p.code} · {p.side === 'buy' ? '買建' : '売建'}</Text><Text selectable style={s.formula}>{p.side === 'buy' ? `(${exact(p.price)} − ${exact(p.entryUsed)})` : `(${exact(p.entryUsed)} − ${exact(p.price)})`} × {p.quantity.toLocaleString()}株 = {exact(p.pnl)}</Text><Text selectable style={s.note}>建玉代金 {exact(p.entryUsed)} × {p.quantity.toLocaleString()}株 = {exact(p.notional)}</Text></View>)}<Row strong label="評価損益の通算" value={exact(result.pnl)}/><Text selectable style={s.formula}>差引評価損 = max(0, −通算損益) = {exact(result.deduction)}</Text><Text style={s.body}>個別の評価損だけを足しません。含み益と含み損を通算した後、合計がマイナスのときだけ差し引きます。通算がプラスでも保証金は増えません。</Text></Card>
        <Card title="② 代用株の評価額">{result.collaterals.map(c => <View key={c.id} style={s.step}><Text style={s.bold}>{c.code} {c.name}</Text><Text selectable style={s.formula}>{exact(c.price)} × {c.quantity.toLocaleString()}株 × {c.haircut}% = {exact(c.value)}</Text></View>)}<Row strong label="代用評価額の合計" value={exact(result.collateralValue)}/><Text style={s.note}>通常は終値。気配引けは最終約定値と最終気配値の低い方。市場は東証→名証→福証→札証の順を仮定しています。SBIの指定する優先市場との一致はデータ配信元接続時に検証が必要です。</Text></Card>
        <Card title="③ 実質保証金"><Text selectable style={s.formula}>{exact(result.cash)}（現金）{ '\n' }＋ {exact(result.collateralValue)}（代用）{ '\n' }− {exact(result.costs)}（諸経費）{ '\n' }− {exact(result.deduction)}（差引評価損）{ '\n' }＋ ({exact(result.unsettled)})（受渡前決済損益）{ '\n' }＝ {exact(result.effective)}</Text></Card>
        <Card title="④ 維持率"><Text selectable style={s.formula}>{exact(result.effective)} ÷ {exact(result.notional)} × 100{ '\n' }＝ {result.ratio === null ? '未算出' : `${result.ratio}%`}</Text><Text style={s.note}>建玉ゼロなら維持率は定義しません。内部計算は10進数で処理し、表示の維持率だけ小数第2位まで切り捨てます。建単価はSBIの説明に従い小数第3位以下切り捨てです。途中の銘柄別円未満丸めは仮定せず保持しています。</Text></Card>
        <Card title="⑤ 評価益込み維持率（税引後・参考）"><Text selectable style={s.formula}>税金相当額 ＝ max(0, 通算評価損益) × 20.315% ＝ {exact(result.estimatedProfitTax)}{ "\n" }税引後評価損益 ＝ {exact(result.pnl)} − {exact(result.estimatedProfitTax)} ＝ {exact(result.afterTaxPnl)}{ "\n" }評価益込み保証金 ＝ 現金 ＋ 代用評価額 − 諸経費 ＋ 受渡前決済損益 ＋ 税引後評価損益{ "\n" }{exact(result.cash)} ＋ {exact(result.collateralValue)} − {exact(result.costs)} ＋ ({exact(result.unsettled)}) ＋ ({exact(result.afterTaxPnl)}) ＝ {exact(result.profitInclusiveMargin)}{ "\n" }{exact(result.profitInclusiveMargin)} ÷ {exact(result.notional)} × 100 ＝ {result.profitInclusiveRatio === null ? "未算出" : `${result.profitInclusiveRatio}%`}</Text><Text style={s.note}>通算がプラスなら税率20.315%を控除した利益、マイナスなら損失全額を反映します。未決済の含み益に実際に課税した額ではなく、決済時を想定した概算です。年間の損益通算・繰越控除、費用の税務上の控除、税額の端数処理は再現しません。追証・新規建余力の判定には使用しません。</Text></Card><Card title="⑥ 実質レバレッジ（参考）">{result.collaterals.map(c => <Text key={c.id} selectable style={s.formula}>現物 {c.code}: {exact(c.marketPrice)} × {c.quantity.toLocaleString()}株 ＝ {exact(c.marketValue)}（掛目前）</Text>)}{result.positions.map(p => <Text key={p.id} selectable style={s.formula}>信用 {p.code} {p.side === "buy" ? "買建" : "売建"}: {exact(p.price)} × {p.quantity.toLocaleString()}株 ＝ {exact(p.marketValue)}</Text>)}<Text selectable style={s.formula}>総ポジション ＝ 現物時価 ＋ 信用建玉時価{ "\n" }{exact(result.spotMarketValue)} ＋ {exact(result.positionMarketValue)} ＝ {exact(result.totalExposure)}{ "\n" }純資産 ＝ 現金 ＋ 現物時価 − 諸経費 ＋ 受渡前決済損益 ＋ 通算評価損益{ "\n" }{exact(result.cash)} ＋ {exact(result.spotMarketValue)} − {exact(result.costs)} ＋ ({exact(result.unsettled)}) ＋ ({exact(result.pnl)}) ＝ {exact(result.netAssets)}{ "\n" }実質レバレッジ ＝ {exact(result.totalExposure)} ÷ {exact(result.netAssets)} ＝ {result.effectiveLeverage === null ? "未算出" : `${result.effectiveLeverage}倍`}</Text><Text style={s.note}>参考元と同じ、買建・売建を相殺しない総時価による定義です。買いと売りが混在するため、この倍率を一律の株価変動率に掛けても純資産の変化率とは一致しません。現物時価は代用登録分のみで、口座外の資産は含めません。純資産が0以下なら倍率は定義しません。</Text></Card><Card title="公式の説明"><Button title="SBI · 委託保証金率の計算式" secondary onPress={() => void Linking.openURL('https://search.sbisec.co.jp/v2/popwin/help/trade_stock_11_03.html')}/><Button title="SBI · 代用株と信用建余力" secondary onPress={() => void Linking.openURL('https://search.sbisec.co.jp/v2/popwin/help/manage_07_01.html')}/><Button title="SBI · 追証のルール" secondary onPress={() => void Linking.openURL('https://search.sbisec.co.jp/v2/popwin/help/trade_stock_11_04.html')}/><Text style={s.note}>確認日：2026-10-10。受渡日の資金移動・拘束資金・増担保規制・口座固有の条件は別途確認が必要です。表示は終値での試算で、SBIが確定する追証金額とは区別しています。</Text></Card>
      </>}
      {tab === '設定' && <>
        <Card title="終値データの接続"><Field label="終値APIのHTTPS URL（空欄で自動接続）" value={apiDraft} onChange={setApiDraft} placeholder="空欄で本人用サーバーへ自動接続"/><View style={s.field}><Text style={s.label}>本人用の接続キー</Text><TextInput accessibilityLabel="本人用の接続キー" secureTextEntry autoCapitalize="none" autoCorrect={false} style={s.input} value={apiAccessKey} onChangeText={setApiAccessKey}/><Pressable accessibilityRole="checkbox" accessibilityLabel="この端末に接続キーを保存" accessibilityState={{ checked: rememberKey }} onPress={() => setRememberKey(v => !v)} style={{ paddingVertical: 12 }}><Text style={s.body}>{rememberKey ? '☑' : '☐'} この端末に接続キーを保存</Text></Pressable><Text style={s.note}>{keyStorageNote} 保存しない場合は開き直したときに再入力します。</Text></View><Button title="接続先を保存" onPress={() => {
          try { if (apiDraft.trim().replace(/\/$/, '') === saved.apiUrl) { void refresh(); return; } if (!apiDraft.trim()) { generation.current++; setSaved(v => ({ ...v, apiUrl: '', snapshot: null, syncError: null, syncedAt: null })); setNotice('本人用サーバーへ自動接続します'); return; } const u = new URL(apiDraft); if (u.protocol !== 'https:' && !(Platform.OS === 'web' && ['localhost', '127.0.0.1'].includes(u.hostname))) throw new Error(); if (u.username || u.password || u.search || u.hash) throw new Error(); generation.current++; setSaved(v => ({ ...v, apiUrl: apiDraft.replace(/\/$/, ''), snapshot: null, syncError: null, syncedAt: null })); setNotice('接続先を保存しました'); }
          catch { setNotice('認証情報を含まないHTTPS URLを入力してください'); }
        }}/><Row label="データ提供元" value={snapshot?.source ?? '未接続'}/><Row label="終値日" value={snapshot?.tradingDate ?? '未取得'}/><Row label="配信元の生成時刻" value={snapshot ? new Date(snapshot.generatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—'}/><Row label="端末の最終取得" value={saved.syncedAt ? new Date(saved.syncedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '—'}/><Text style={s.note}>自分の終値サーバーから本人用キーで取得します。株価データや接続キーをGitHubへ公開しないでください。API URLが空欄なら、このPCの本人用サーバーへ自動接続します。このPCの起動とインターネット接続が必要です。無料取得は東証を対象とし、地方単独上場銘柄等は未対応です。</Text></Card>
        <Card title="操作を試す"><Button title="架空のサンプルを表示" secondary onPress={() => { setDemo(true); setTab('状況'); setScenario({ changePercent: '0', cashDelta: '0' }); }}/><Text style={s.note}>サンプルはご自身の建玉に保存されません。</Text></Card>
        <Card title="バックアップ"><Text style={s.body}>3パターンすべての建玉・保証金をバックアップします。金額が含まれます。旧形式のJSONは選択中のパターンだけに復元します。</Text><Button title="JSONバックアップを作成" secondary onPress={() => setBackup(JSON.stringify({ version: 2, patterns: saved.patterns, activePattern: saved.activePattern }, null, 2))}/><TextInput accessibilityLabel="バックアップJSON" style={[s.input, { minHeight: 140, textAlignVertical: 'top' }]} multiline value={backup} onChangeText={setBackup} placeholder="復元するJSONを貼り付け"/><Button title="バックアップを共有" secondary disabled={!backup} onPress={() => { void Share.share({ message: backup }).catch(() => setNotice('JSONを選択してコピーしてください')); }}/><Button title="JSONの内容で復元" disabled={!backup} onPress={() => setDeletePrompt('restore')}/></Card>
        <Card title="データとプライバシー"><Text style={s.body}>証券口座へログインせず、注文も発注しません。入力した建玉・保証金は端末内に保存し、株価サーバーへ送信しません。株価APIへの通信時にはサーバーにIPアドレス等の通信情報が届きます。</Text><Button title="端末の入力をすべて削除" secondary onPress={() => setDeletePrompt('all')}/></Card>
      </>}
      <View style={s.extraPatterns}><Pressable accessibilityRole="button" accessibilityLabel="パターン2・3の設定を開閉" accessibilityState={{expanded:extraPatterns}} onPress={() => setExtraPatterns(v => !v)} style={s.extraToggle}><Text style={s.extraLabel}>{extraPatterns ? '閉じる' : '別パターン（2・3）'}</Text></Pressable>
        {extraPatterns && <Card title="別パターンの設定"><View style={s.chips}>{patterns.map((p,index) => <Button key={p.id} title={p.name} secondary={saved.activePattern !== index} onPress={() => selectPattern(index)}/>)}</View><Text style={s.note}>建玉・現金・費用はそれぞれ独立しています。起動時はパターン1を表示します。</Text>{comparisons.map(p => <Row key={p.id} label={p.name} value={p.result.ratio === null ? '未算出' : `${p.result.ratio}%`}/>)}
          <Field label="選択中のパターン名" value={patternName} onChange={setPatternName}/><Button title="名前を保存" disabled={demo} onPress={() => {try {const renamed=patternSchema.parse({...active,name:patternName});setSaved(v => ({...v,patterns:v.patterns.map((p,i) => i === v.activePattern ? renamed : p)}));setNotice('パターン名を保存しました');} catch {setNotice('パターン名は1〜30文字で入力してください');}}}/>
        </Card>}
      </View>
      <Text style={s.footer}>信用デモ取引 · v1.5.0{'\n'}SBI基準の終値シミュレーション</Text>
    </ScrollView>
    {editor && <Editor kind={editor.kind} index={editor.index} account={account} snapshot={snapshot} onClose={() => setEditor(null)} onSave={next => { editAccount(next); setEditor(null); }}/ >}
    <Modal visible={deletePrompt !== null} transparent animationType="fade" onRequestClose={() => setDeletePrompt(null)}><View style={s.modalShade}><View style={s.dialog}><Text style={s.cardTitle}>{deletePrompt === 'all' ? '入力をすべて削除しますか' : '入力をJSONの内容で置き換えますか'}</Text><Text style={s.body}>3パターン形式の復元・全削除は全リストが対象です。旧形式の復元は選択中のリストだけが対象です。必要なら先にバックアップしてください。</Text><Button title="実行する" onPress={() => {
      try { if (deletePrompt === 'all') { setRememberKey(false); setApiAccessKey(''); } const next = deletePrompt === 'all' ? createPortfolio() : restorePortfolio(JSON.parse(backup), saved); setSaved(v => ({ ...v, ...next })); setScenario({ changePercent: '0', cashDelta: '0' }); setDemo(false); setStorageError(''); setNotice('入力データを更新しました'); } catch { setNotice('バックアップJSONの形式が不正です'); } setDeletePrompt(null);
    }}/><Button title="キャンセル" secondary onPress={() => setDeletePrompt(null)}/></View></View></Modal>
  </SafeAreaView>;
}

function Editor({ kind, index, account, snapshot, onClose, onSave }: { kind: 'position' | 'collateral'; index: number | null; account: Account; snapshot: Snapshot | null; onClose: () => void; onSave: (a: Account) => void }) {
  const item = index === null ? null : kind === 'position' ? account.positions[index] : account.collaterals[index];
  const [code, setCode] = useState(item?.code ?? ''), [name, setName] = useState(item?.name ?? '');
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : '100');
  const [entry, setEntry] = useState(item && 'entry' in item ? item.entry : '');
  const [side, setSide] = useState<'buy' | 'sell'>(item && 'side' in item ? item.side : 'buy');
  const [haircut, setHaircut] = useState(item && 'haircut' in item ? item.haircut : '80');
  const [openedOn, setOpenedOn] = useState(item && 'openedOn' in item ? item.openedOn : todayJst());
  const [error, setError] = useState(''), [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const securities = useMemo(() => buildSecurityIndex(snapshot?.quotes ?? []), [snapshot]);
  const suggestions = useMemo(() => searchSecurities(securities, search), [securities, search]);
  function save() {
    try {
      if (!/^\d+$/.test(quantity)) throw new Error('株数は正の整数です');
      const base = { id: item?.id ?? id(), code: code.toUpperCase(), name, quantity: Number(quantity), confirmedThrough: todayJst() };
      if (kind === 'position') {
        if (openedOn > todayJst()) throw new Error('建日は今日以前を入力してください');
        const next = positionSchema.parse({ ...base, entry, side, openedOn });
        onSave({ ...account, positions: index === null ? [...account.positions, next] : account.positions.map((p, i) => i === index ? next : p) });
      } else {
        const next = collateralSchema.parse({ ...base, haircut });
        onSave({ ...account, collaterals: index === null ? [...account.collaterals, next] : account.collaterals.map((c, i) => i === index ? next : c) });
      }
    } catch (e) { setError(e instanceof Error && !e.message.startsWith('[') ? e.message : 'コード4桁、株数、建値/掛目、日付を確認してください'); }
  }
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={s.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={s.header}><Text style={s.title}>{kind === 'position' ? '信用建玉' : '代用株'}{index === null ? 'を追加' : 'を編集'}</Text><Pressable accessibilityRole="button" accessibilityLabel="建玉編集を閉じる" style={{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"}} onPress={onClose}><Text style={s.chipText}>閉じる</Text></Pressable></View><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Field label="銘柄名で検索" value={search} onChange={setSearch} placeholder="例：トヨタ、ソニー（コードも可）"/>
    {suggestions.map(q => <Pressable key={q.code} accessibilityRole="button" accessibilityLabel={`${q.name}（${q.code}）を選択`} style={s.searchRow} onPress={() => { setCode(q.code); setName(q.name); setSearch(''); }}><View style={s.itemHeading}><Text style={s.stockName}>{q.name}</Text><Text style={s.stockCode}>{q.code}</Text></View></Pressable>)}
    {search.trim() !== '' && <Text style={s.note}>{suggestions.length ? '候補をタップするとコード・銘柄名が入ります。最大8件表示。' : '該当する銘柄がありません。名称の一部で検索するか、コードを直接入力してください。'}</Text>}
    <Text style={s.note}>終値の接続前でも東証銘柄名で検索できます。地方単独上場・新規上場など、一覧にない銘柄は直接入力できます。</Text>
    <Field label="銘柄コード" value={code} onChange={v => setCode(v.normalize('NFKC').toUpperCase())} placeholder="7203 / 285A"/><Field label="銘柄名（任意）" value={name} onChange={setName}/><Field label="株数" numeric value={quantity} onChange={setQuantity}/>

    {kind === 'position' ? <><View style={s.chips}><Button title="買建" secondary={side !== 'buy'} onPress={() => setSide('buy')}/><Button title="売建" secondary={side !== 'sell'} onPress={() => setSide('sell')}/></View><Field label="建値（円）" numeric value={entry} onChange={setEntry}/><Field label="建日（YYYY-MM-DD）" value={openedOn} onChange={setOpenedOn}/></> : <Field label="代用掛目（%）" numeric value={haircut} onChange={setHaircut}/>}
    <Text style={s.note}>分割・併合があった場合は処理後の株数・建値を入力してください。「確認して保存」で今日までの権利処理を確認したこととして記録します。</Text>{error !== '' && <Text style={s.error}>{error}</Text>}<Button title="確認して保存" onPress={save}/>{index !== null && <><Button title="この登録を削除" secondary onPress={() => setDeleting(true)}/>{deleting && <View style={s.warning}><Text style={s.body}>この登録を削除しますか？</Text><Button title="削除を実行" onPress={() => onSave(kind === 'position' ? { ...account, positions: account.positions.filter((_, i) => i !== index) } : { ...account, collaterals: account.collaterals.filter((_, i) => i !== index) })}/><Button title="キャンセル" secondary onPress={() => setDeleting(false)}/></View>}</>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>;
}
const s = StyleSheet.create({
  holdingsHeading: {flexDirection:'row',alignItems:'center',gap:8}, addPosition: {minHeight:44,paddingHorizontal:14,borderRadius:10,justifyContent:'center',backgroundColor:'#1b2a3b'},
  holding: {backgroundColor:'#121a26',borderWidth:1,borderColor:'#263246',borderRadius:14,padding:16,gap:6}, stockName: {flex:1,color:'#e6edf7',fontSize:17,fontWeight:'600',lineHeight:24}, stockCode: {color:'#8191a8',fontSize:13,lineHeight:24},
  priceColumns: {flexDirection:'row',gap:12,marginTop:8}, priceColumn: {flex:1,gap:5}, currentColumn: {borderLeftWidth:1,borderLeftColor:'#2b3749',paddingLeft:14}, stockPrice: {fontSize:21,lineHeight:30,color:'#e6edf7',fontWeight:'600',fontVariant:['tabular-nums'],flexShrink:1}, currentPrice: {color:'#83cde6'},
  refreshCompact: {minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:'#101824'}, extraPatterns: {marginTop:20,gap:8}, extraToggle: {alignSelf:'flex-end',minHeight:44,justifyContent:'center',paddingHorizontal:10}, extraLabel: {fontSize:11,color:'#7f8da3'},

  activePatternNote: { fontSize: 10, color: '#7d899c', textAlign: 'right' },
  patternDock: { alignItems: 'flex-end', paddingRight: 14, paddingVertical: 3 }, patternSwitch: { flexDirection: 'row', alignItems: 'center' }, patternMiniButton: { minWidth: 26, minHeight: 26, alignItems: 'center', justifyContent: 'center' }, patternMiniText: { fontSize: 10, color: '#46556b' }, patternMiniActive: { color: '#8492a7', fontWeight: '600' }, patternSeparator: { fontSize: 9, color: '#39495e' },
  safe: { flex: 1, backgroundColor: '#0b1018' }, header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 10, letterSpacing: 1.8, color: '#8297b5', marginBottom: 7 }, title: { fontSize: 22, color: '#e6edf7', fontWeight: '700' }, tag: { fontSize: 11, color: '#91bdd2', backgroundColor: '#1b2a3b', padding: 8, borderRadius: 8 },
  tabs: { flexDirection: 'row', marginHorizontal: 12, backgroundColor: '#101824', padding: 4, borderRadius: 12 }, tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 9 }, activeTab: { backgroundColor: '#20334b' }, tabText: { fontSize: 14, color: '#8796ae' }, activeTabText: { color: '#83cde6', fontWeight: '700' },
  content: { padding: 12, gap: 12, maxWidth: 720, width: '100%', alignSelf: 'center', paddingBottom: 36 }, hero: { borderRadius: 22, padding: 26, backgroundColor: '#13263b', borderWidth: 1, borderColor: '#2c4359' }, heroLabel: { color: '#91bdd2', fontSize: 13 }, rate: { fontSize: 62, color: '#fff', fontWeight: '600', marginVertical: 8, fontVariant: ['tabular-nums'] }, percent: { fontSize: 27, color: '#6fcfe5' }, heroBody: { fontSize: 12, color: '#a7bccf', lineHeight: 20 }, heroDivider: { height: 1, backgroundColor: '#2c4359', marginVertical: 16 },
  card: { backgroundColor: '#121a26', borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: '#263246' }, cardTitle: { fontSize: 16, fontWeight: '700', color: '#e0e7f1', lineHeight: 24, flexShrink: 1 }, body: { fontSize: 13, lineHeight: 22, color: '#b0bdce' }, note: { fontSize: 11, lineHeight: 19, color: '#7f8da3' }, bold: { fontWeight: '700', color: '#d8effb' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, tile: { flex: 1, minWidth: 135, borderRadius: 14, padding: 18, backgroundColor: '#182435', gap: 7 }, tileValue: { fontSize: 22, color: '#d8effb', fontWeight: '600' }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#263246' }, rowLabel: { flex: 1, color: '#8796ae', fontSize: 12, lineHeight: 19 }, rowValue: { flexShrink: 1, color: '#e0e7f1', fontSize: 13, fontVariant: ['tabular-nums'], textAlign: 'right', lineHeight: 19 },
  button: { backgroundColor: '#2f6fe4', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 10, alignItems: 'center' }, secondary: { backgroundColor: '#1b2a3b' }, buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' }, field: { gap: 7 }, label: { fontSize: 11, color: '#8796ae' }, input: { borderColor: '#344155', borderWidth: 1, borderRadius: 9, backgroundColor: '#192332', padding: 13, fontSize: 16, color: '#e0e7f1' },
  warning: { backgroundColor: '#332719', padding: 16, borderRadius: 12, gap: 10 }, warningText: { color: '#e8b56b', fontSize: 13, lineHeight: 20, fontWeight: '700' }, error: { color: '#f3868e', fontSize: 12, lineHeight: 21 }, notice: { backgroundColor: '#182c39', borderRadius: 9, padding: 13, color: '#a7d9e7', fontSize: 12, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { backgroundColor: '#1b2a3b', borderRadius: 8, padding: 11 }, chipText: { color: '#83cde6', fontSize: 12, fontWeight: '600' }, sectionTitle: { fontSize: 18, fontWeight: '700', color: '#e0e7f1', marginTop: 4 }, count: { color: '#8796ae', fontSize: 12 }, itemHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, buy: { color: '#6cdbc0', backgroundColor: '#153b34', padding: 7, borderRadius: 6, overflow: 'hidden', fontSize: 11 }, sell: { color: '#f1a0ae', backgroundColor: '#402733', padding: 7, borderRadius: 6, overflow: 'hidden', fontSize: 11 },
  step: { borderBottomWidth: 1, borderBottomColor: '#263246', paddingBottom: 12, gap: 8 }, formula: { fontSize: 13, color: '#bbd6e8', lineHeight: 26, fontVariant: ['tabular-nums'] }, scenario: { gap: 10, padding: 14, borderRadius: 10, backgroundColor: '#17273a' }, footer: { fontSize: 10, color: '#586880', textAlign: 'center', lineHeight: 19, marginTop: 8 }, modalShade: { flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: 24 }, dialog: { backgroundColor: '#121a26', borderRadius: 16, padding: 24, gap: 16 }, searchRow: { backgroundColor: '#192332', padding: 13, borderRadius: 8 }
});
