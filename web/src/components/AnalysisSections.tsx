import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import {
  selectAnalysisBreakdown,
  type AnalysisData,
  type ContractExcerpt,
  type RankedEntity,
  type RepeatCluster,
  type TranchingCandidate,
} from '../lib/analysis';
import { withBase } from '../lib/basePath';
import { formatEuro, formatInteger, formatPercent } from '../lib/format';
import { parseOrganismSelection, writeOrganismSelection } from '../lib/organismFilter';
import OrganismMultiSelect from './OrganismMultiSelect';

type Language = 'gl' | 'es';
export type AnalysisSection = 'timeline' | 'vendors' | 'amounts' | 'organisms' | 'issues';

const copy = {
  gl: {
    title: 'Análise ampliada',
    note: 'Indicadores recalculados para o ano e organismo seleccionados a partir da data de publicación.',
    loading: 'Cargando análise…',
    error: 'Non foi posible cargar a análise.',
    median: 'Mediana',
    p90: 'Percentil 90',
    vendors: 'Nomes de adxudicatario',
    top5: 'Cota do top 5',
    timeline: 'Evolución das publicacións',
    timelineNote: 'Reconto e importe por mes de publicación',
    limitedTimeline: 'A cobertura actual só contén un mes de publicación. A serie medrará co histórico validado.',
    records: 'contratos',
    awardees: 'Adxudicatarios',
    awardeesNote: 'Agrupación polo nome exacto publicado, sen empregar identificadores fiscais',
    byAmount: 'Top por importe',
    byCount: 'Top por número de contratos',
    concentration: 'Concentración por importe',
    top1: 'Top 1',
    top10: 'Top 10',
    amounts: 'Distribución de importes',
    amountsNote: 'Tramos, percentís e maiores contratos publicados',
    largest: 'Maiores importes',
    categories: 'Tipos de organismo',
    categoriesNote: 'Distribución segundo a categoría institucional do rexistro curado',
    organisms: 'Organismos contratantes',
    organismsNote: 'Importe e actividade por organismo do rexistro curado',
    openSource: 'Abrir na fonte oficial',
    year: 'Ano da análise',
    fullSeries: 'Serie completa',
    organism: 'Organismo da análise',
    allOrganisms: 'Todos os organismos',
    noOrganisms: 'Ningún organismo',
    selectedOrganisms: (count: number) => `${count} organismos seleccionados`,
    selectAllOrganisms: 'Seleccionar todos',
    selectNoOrganisms: 'Deseleccionar todos',
    repeatPatterns: 'Contratos repetidos en períodos curtos',
    repeatPatternsNote: 'Posibles repeticións: mesmo organismo, adxudicatario e obxecto normalizado, con 3 ou máis publicacións nun máximo de 30 días.',
    noRepeatPatterns: 'Non se detectaron patróns repetidos cos filtros actuais.',
    inDays: (count: number) => `en ${count} días`,
    amountRange: 'Rango de importes',
    contractEvidence: 'Contratos do período',
    evidenceSample: (shown: number, total: number) => `${shown} de ${total} contratos`,
    explorePattern: 'Ver no explorador',
    signals: 'Sinais para investigar',
    signalsNote: 'Pistas calculadas sobre importes publicados e datas de publicación; non determinan por si soas unha irregularidade.',
    signalUnavailable: 'Este ámbito histórico aínda non contén a nova análise de sinais.',
    partialSignals: (analyzed: string, total: string) => `Cobertura parcial: analizáronse ${analyzed} de ${total} contratos deste ámbito.`,
    tranching: 'Acumulación baixo referencias en 30 días',
    tranchingNote: 'Dúas ou máis publicacións ao mesmo adxudicatario e organismo en 30 días, todas baixo a referencia e cunha suma igual ou superior. A proximidade e o obxecto equivalente priorizan a orde, pero non son requisitos.',
    noTranching: 'Non se detectaron candidatos cos filtros actuais.',
    sameSubject: 'Obxecto equivalente',
    mixedSubjects: 'Obxectos diferentes',
    publishedReference: 'Referencia publicada',
    thresholdSignals: 'Importes próximos ou superiores ás referencias',
    thresholdSignalsNote: 'Referencias de 18.150 € e 48.400 €, equivalentes a 15.000 € e 40.000 € máis un IVE asumido do 21%. A fonte non identifica tipo contractual nin base de IVE.',
    nearReference: 'Ata un 5% por baixo',
    atOrAboveReference: 'Iguais ou superiores',
    shownEvidence: (shown: number, total: number) => `${shown} exemplos de ${total}`,
    candidateOrder: 'Ordenar candidatos',
    relevanceOrder: 'Maior relevancia',
    totalOrder: 'Maior importe acumulado',
    countOrder: 'Maior número de contratos',
    recentOrder: 'Publicación máis recente',
    previousPage: 'Páxina anterior',
    nextPage: 'Páxina seguinte',
    pageOf: (page: number, total: number) => `Páxina ${page} de ${total}`,
  },
  es: {
    title: 'Análisis ampliado',
    note: 'Indicadores recalculados para el año y organismo seleccionados a partir de la fecha de publicación.',
    loading: 'Cargando análisis…',
    error: 'No fue posible cargar el análisis.',
    median: 'Mediana',
    p90: 'Percentil 90',
    vendors: 'Nombres de adjudicatario',
    top5: 'Cuota del top 5',
    timeline: 'Evolución de las publicaciones',
    timelineNote: 'Recuento e importe por mes de publicación',
    limitedTimeline: 'La cobertura actual solo contiene un mes de publicación. La serie crecerá con el histórico validado.',
    records: 'contratos',
    awardees: 'Adjudicatarios',
    awardeesNote: 'Agrupación por el nombre exacto publicado, sin emplear identificadores fiscales',
    byAmount: 'Top por importe',
    byCount: 'Top por número de contratos',
    concentration: 'Concentración por importe',
    top1: 'Top 1',
    top10: 'Top 10',
    amounts: 'Distribución de importes',
    amountsNote: 'Tramos, percentiles y mayores contratos publicados',
    largest: 'Mayores importes',
    categories: 'Tipos de organismo',
    categoriesNote: 'Distribución según la categoría institucional del registro curado',
    organisms: 'Organismos contratantes',
    organismsNote: 'Importe y actividad por organismo del registro curado',
    openSource: 'Abrir en la fuente oficial',
    year: 'Año del análisis',
    fullSeries: 'Serie completa',
    organism: 'Organismo del análisis',
    allOrganisms: 'Todos los organismos',
    noOrganisms: 'Ningún organismo',
    selectedOrganisms: (count: number) => `${count} organismos seleccionados`,
    selectAllOrganisms: 'Seleccionar todos',
    selectNoOrganisms: 'Deseleccionar todos',
    repeatPatterns: 'Contratos repetidos en periodos cortos',
    repeatPatternsNote: 'Posibles repeticiones: mismo organismo, adjudicatario y objeto normalizado, con 3 o más publicaciones en un máximo de 30 días.',
    noRepeatPatterns: 'No se detectaron patrones repetidos con los filtros actuales.',
    inDays: (count: number) => `en ${count} días`,
    amountRange: 'Rango de importes',
    contractEvidence: 'Contratos del periodo',
    evidenceSample: (shown: number, total: number) => `${shown} de ${total} contratos`,
    explorePattern: 'Ver en el explorador',
    signals: 'Señales para investigar',
    signalsNote: 'Pistas calculadas sobre importes publicados y fechas de publicación; no determinan por sí solas una irregularidad.',
    signalUnavailable: 'Este ámbito histórico todavía no contiene el nuevo análisis de señales.',
    partialSignals: (analyzed: string, total: string) => `Cobertura parcial: se analizaron ${analyzed} de ${total} contratos de este ámbito.`,
    tranching: 'Acumulación bajo referencias en 30 días',
    tranchingNote: 'Dos o más publicaciones al mismo adjudicatario y organismo en 30 días, todas bajo la referencia y con una suma igual o superior. La proximidad y el objeto equivalente priorizan el orden, pero no son requisitos.',
    noTranching: 'No se detectaron candidatos con los filtros actuales.',
    sameSubject: 'Objeto equivalente',
    mixedSubjects: 'Objetos diferentes',
    publishedReference: 'Referencia publicada',
    thresholdSignals: 'Importes próximos o superiores a las referencias',
    thresholdSignalsNote: 'Referencias de 18.150 € y 48.400 €, equivalentes a 15.000 € y 40.000 € más un IVA asumido del 21%. La fuente no identifica tipo contractual ni base de IVA.',
    nearReference: 'Hasta un 5% por debajo',
    atOrAboveReference: 'Iguales o superiores',
    shownEvidence: (shown: number, total: number) => `${shown} ejemplos de ${total}`,
    candidateOrder: 'Ordenar candidatos',
    relevanceOrder: 'Mayor relevancia',
    totalOrder: 'Mayor importe acumulado',
    countOrder: 'Mayor número de contratos',
    recentOrder: 'Publicación más reciente',
    previousPage: 'Página anterior',
    nextPage: 'Página siguiente',
    pageOf: (page: number, total: number) => `Página ${page} de ${total}`,
  },
} as const;

const categoryTranslations: Record<string, string> = {
  'Axencias públicas autonómicas': 'Agencias públicas autonómicas',
  'Consellerías': 'Consejerías',
  'Consorcios autonómicos': 'Consorcios autonómicos',
  'Entidades públicas empresariais': 'Entidades públicas empresariales',
  'Fundacións do sector público autonómico': 'Fundaciones del sector público autonómico',
  'Organismos autónomos': 'Organismos autónomos',
  'Outros entes públicos': 'Otros entes públicos',
  'Sociedades mercantís públicas autonómicas': 'Sociedades mercantiles públicas autonómicas',
};

function currency(value: number, compact = false) {
  return formatEuro(value, compact);
}

function percent(value: number) {
  return formatPercent(value);
}

const monthNames: Record<Language, string[]> = {
  gl: ['xan.', 'feb.', 'mar.', 'abr.', 'maio', 'xuño', 'xul.', 'ago.', 'set.', 'out.', 'nov.', 'dec.'],
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'],
};

function formatDate(value: string, language: Language) {
  const [year, month, day] = value.split('-').map(Number);
  return `${day} ${monthNames[language][month - 1]} ${year}`;
}

function repeatExplorerUrl(cluster: RepeatCluster, language: Language) {
  const params = new URLSearchParams({
    year: cluster.date_start.slice(0, 4),
    month: 'all',
    organism: String(cluster.organism_id),
    repeatSubject: cluster.normalized_subject,
    repeatLabel: cluster.subject,
    repeatVendor: cluster.vendor_name,
    dateFrom: cluster.date_start,
    dateTo: cluster.date_end,
  });
  if (language === 'es') params.set('lang', 'es');
  return `${withBase('/explorador')}?${params.toString()}`;
}

function candidateExplorerUrl(candidate: TranchingCandidate, language: Language) {
  const params = new URLSearchParams({
    year: candidate.date_start.slice(0, 4),
    month: 'all',
    organism: String(candidate.organism_id),
    q: candidate.vendor_name,
  });
  if (language === 'es') params.set('lang', 'es');
  return `${withBase('/explorador')}?${params.toString()}`;
}

function EvidenceRows({
  contracts,
  language,
  openSource,
}: {
  contracts: ContractExcerpt[];
  language: Language;
  openSource: string;
}) {
  return <div className="repeat-evidence signal-evidence">
    {contracts.map((contract) => <article key={contract.record_id}>
      <time dateTime={contract.publication_date}>{formatDate(contract.publication_date, language)}</time>
      <span><strong>{contract.subject || '—'}</strong><small>{contract.vendor_name} · {contract.organism_name}</small></span>
      <b>{currency(contract.amount_eur)}</b>
      <a href={contract.source_url} target="_blank" rel="noreferrer" aria-label={openSource} title={openSource}><ExternalLink size={16} /></a>
    </article>)}
  </div>;
}

function RankingBars({ items, language, year, organisms }: { items: RankedEntity[]; language: Language; year: number | null; organisms: string[] }) {
  const largest = items[0]?.total_amount_eur ?? 1;
  const explorerPath = withBase('/explorador');
  return <ol className="analysis-ranking">
    {items.slice(0, 10).map((item, index) => {
      const params = new URLSearchParams({ q: item.name });
      if (year !== null) params.set('year', String(year));
      if (organisms.length === 1) params.set('organism', organisms[0]);
      if (language === 'es') params.set('lang', 'es');
      return <li key={item.id}>
        <span className="analysis-rank">{String(index + 1).padStart(2, '0')}</span>
        <div className="analysis-rank-body">
          <a href={`${explorerPath}?${params.toString()}`} title={item.name}>{item.name}</a>
          <span className="analysis-bar"><i style={{ width: `${Math.max(2, item.total_amount_eur / largest * 100)}%` }} /></span>
        </div>
        <strong>{currency(item.total_amount_eur, true)}</strong>
      </li>;
    })}
  </ol>;
}

export default function AnalysisSections({
  language,
  year,
  years,
  onYearChange,
  section,
}: {
  language: Language;
  year: number | null;
  years: number[];
  onYearChange: (year: number) => void;
  section: AnalysisSection;
}) {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [failed, setFailed] = useState(false);
  const [scopeKey, setScopeKey] = useState('all');
  const [organismKeys, setOrganismKeys] = useState<string[]>([]);
  const [issuePage, setIssuePage] = useState(1);
  const [issueSort, setIssueSort] = useState<'relevance' | 'total' | 'count' | 'recent'>('relevance');
  const [urlReady, setUrlReady] = useState(false);
  const t = copy[language];

  useEffect(() => {
    if (year !== null) setScopeKey(String(year));
  }, [year]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(withBase('/data/analysis.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload: AnalysisData) => {
        const params = new URLSearchParams(window.location.search);
        const requestedOrganisms = parseOrganismSelection(
          params,
          Object.keys(payload.organism_scopes),
        );
        const breakdown = selectAnalysisBreakdown(payload, requestedOrganisms);
        const requestedYear = params.get('year') ?? 'all';
        setOrganismKeys(requestedOrganisms);
        setScopeKey(breakdown.years[requestedYear] ? requestedYear : 'all');
        setAnalysis(payload);
        setUrlReady(true);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!urlReady || !analysis) return;
    const url = new URL(window.location.href);
    const allIds = Object.keys(analysis.organism_scopes);
    writeOrganismSelection(url.searchParams, organismKeys, allIds);
    if (scopeKey === 'all') url.searchParams.delete('year');
    else url.searchParams.set('year', scopeKey);
    window.history.replaceState({}, '', url);
    document.querySelectorAll<HTMLAnchorElement>('[data-analysis-route]').forEach((link) => {
      const destination = new URL(link.href);
      writeOrganismSelection(destination.searchParams, organismKeys, allIds);
      if (scopeKey === 'all') destination.searchParams.delete('year');
      else destination.searchParams.set('year', scopeKey);
      link.href = destination.toString();
    });
  }, [analysis, organismKeys, scopeKey, urlReady]);

  const breakdown = useMemo(
    () => analysis ? selectAnalysisBreakdown(analysis, organismKeys) : null,
    [analysis, organismKeys],
  );

  useEffect(() => {
    if (breakdown && scopeKey !== 'all' && !breakdown.years[scopeKey]) setScopeKey('all');
  }, [breakdown, scopeKey]);

  useEffect(() => {
    setIssuePage(1);
  }, [organismKeys, scopeKey]);

  if (failed) return <section className="analytics"><p className="empty-state error-state">{t.error}</p></section>;
  if (!analysis || !breakdown) return <section className="analytics"><p className="empty-state">{t.loading}</p></section>;

  const scope = scopeKey === 'all' ? breakdown.all : breakdown.years[scopeKey] ?? breakdown.all;
  const largestMonth = Math.max(...scope.timeseries.monthly.map((item) => item.total_amount_eur), 1);
  const largestBand = Math.max(...scope.amounts.bands.map((item) => item.record_count), 1);
  const largestCategory = scope.categories[0]?.total_amount_eur ?? 1;
  const largestOrganism = scope.organisms[0]?.total_amount_eur ?? 1;
  const availableYears = years.length > 0
    ? years.filter((item) => breakdown.years[String(item)])
    : Object.keys(breakdown.years).map(Number).sort((left, right) => right - left);
  const organismOptions = Object.values(analysis.organism_scopes)
    .sort((left, right) => left.name.localeCompare(right.name, language));
  const repeatClusters = scope.patterns?.repeat_clusters ?? [];
  const contractSignals = scope.patterns?.contract_signals;
  const orderedCandidates = [...(contractSignals?.tranching_candidates ?? [])].sort((left, right) => {
    if (issueSort === 'total') return right.total_amount_eur - left.total_amount_eur || left.id.localeCompare(right.id);
    if (issueSort === 'count') return right.record_count - left.record_count
      || right.total_amount_eur - left.total_amount_eur || left.id.localeCompare(right.id);
    if (issueSort === 'recent') return right.date_end.localeCompare(left.date_end) || left.id.localeCompare(right.id);
    return Number(right.same_normalized_subject) - Number(left.same_normalized_subject)
      || Number(right.has_near_reference ?? false) - Number(left.has_near_reference ?? false)
      || right.maximum_amount_eur / right.reference_eur - left.maximum_amount_eur / left.reference_eur
      || right.total_amount_eur - left.total_amount_eur
      || left.id.localeCompare(right.id);
  });
  const issuePageCount = Math.max(1, Math.ceil(orderedCandidates.length / 20));
  const currentIssuePage = Math.min(issuePage, issuePageCount);
  const visibleCandidates = orderedCandidates.slice((currentIssuePage - 1) * 20, currentIssuePage * 20);

  return <section className="analytics" id="analysis" aria-labelledby="analysis-title">
    <div className="section-heading">
      <div><h2 id="analysis-title">{t.title}</h2><p>{t.note}</p></div>
      <div className="analysis-filters">
        <div className="analysis-year analysis-organism-filter">
          <span>{t.organism}</span>
          <OrganismMultiSelect
            options={organismOptions.map((item) => ({ id: String(item.organism_id), name: item.name }))}
            selectedIds={organismKeys}
            onChange={setOrganismKeys}
            label={t.organism}
            allLabel={t.allOrganisms}
            noneLabel={t.noOrganisms}
            selectedLabel={t.selectedOrganisms}
            selectAllLabel={t.selectAllOrganisms}
            selectNoneLabel={t.selectNoOrganisms}
          />
        </div>
        <label className="analysis-year">
          <span>{t.year}</span>
          <select value={scopeKey} onChange={(event) => {
            const value = event.target.value;
            setScopeKey(value);
            if (value !== 'all') onYearChange(Number(value));
          }}>
            <option value="all">{t.fullSeries}</option>
            {availableYears.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="analysis-kpis">
      <article><span>{t.median}</span><strong>{currency(scope.summary.median_amount_eur)}</strong></article>
      <article><span>{t.p90}</span><strong>{currency(scope.amounts.percentiles.p90)}</strong></article>
      <article><span>{t.vendors}</span><strong>{formatInteger(scope.summary.unique_vendor_names)}</strong></article>
      <article><span>{t.top5}</span><strong>{percent(scope.vendors.concentration.top5_share)}</strong></article>
    </div>

    {section === 'timeline' && <div className="analysis-block timeline-analysis">
      <div className="analysis-block-heading"><h3>{t.timeline}</h3><p>{t.timelineNote}</p></div>
      {scope.timeseries.monthly.length < 2 && <p className="coverage-warning">{t.limitedTimeline}</p>}
      <div className="month-chart" aria-label={t.timelineNote}>
        {scope.timeseries.monthly.map((item) => <div className="month-column" key={item.key}>
          <div className="month-value">{currency(item.total_amount_eur, true)}</div>
          <div className="month-bar"><span style={{ height: `${Math.max(5, item.total_amount_eur / largestMonth * 100)}%` }} /></div>
          <strong>{item.key}</strong>
          <small>{formatInteger(item.record_count)} {t.records}</small>
        </div>)}
      </div>
    </div>}

    {section === 'vendors' && <>
      <div className="analysis-block">
        <div className="analysis-block-heading"><h3>{t.awardees}</h3><p>{t.awardeesNote}</p></div>
        <div className="analysis-two-column">
          <div><h4>{t.byAmount}</h4><RankingBars items={scope.vendors.ranking_by_amount} language={language} year={scopeKey === 'all' ? null : Number(scopeKey)} organisms={organismKeys} /></div>
          <div>
            <h4>{t.byCount}</h4>
            <ol className="count-ranking">{scope.vendors.ranking_by_count.slice(0, 10).map((item, index) => <li key={item.id}><span>{index + 1}</span><strong>{item.name}</strong><b>{formatInteger(item.record_count)}</b></li>)}</ol>
            <div className="concentration-strip" aria-label={t.concentration}>
              <span><small>{t.top1}</small><strong>{percent(scope.vendors.concentration.top1_share)}</strong></span>
              <span><small>{t.top5}</small><strong>{percent(scope.vendors.concentration.top5_share)}</strong></span>
              <span><small>{t.top10}</small><strong>{percent(scope.vendors.concentration.top10_share)}</strong></span>
            </div>
          </div>
        </div>
      </div>
    </>}

    {section === 'issues' && <>
      <div className="analysis-block signal-intro">
        <div className="analysis-block-heading"><h3>{t.signals}</h3><p>{t.signalsNote}</p></div>
        {!contractSignals && <p className="coverage-warning">{t.signalUnavailable}</p>}
        {contractSignals && contractSignals.analyzed_record_count < contractSignals.scope_record_count
          && <p className="coverage-warning">{t.partialSignals(formatInteger(contractSignals.analyzed_record_count), formatInteger(contractSignals.scope_record_count))}</p>}
      </div>
      {contractSignals && <div className="analysis-block tranching-analysis">
        <div className="analysis-block-heading"><h3>{t.tranching}</h3><p>{t.tranchingNote}</p></div>
        <div className="signal-list-controls">
          <label><span>{t.candidateOrder}</span><select value={issueSort} onChange={(event) => {
            setIssueSort(event.target.value as typeof issueSort);
            setIssuePage(1);
          }}>
            <option value="relevance">{t.relevanceOrder}</option>
            <option value="total">{t.totalOrder}</option>
            <option value="count">{t.countOrder}</option>
            <option value="recent">{t.recentOrder}</option>
          </select></label>
        </div>
        {contractSignals.tranching_candidates.length === 0
          ? <p className="empty-state repeat-empty">{t.noTranching}</p>
          : <div className="repeat-clusters">{visibleCandidates.map((candidate) => <details className="repeat-cluster signal-cluster" key={candidate.id}>
            <summary>
              <span className="repeat-count"><strong>{formatInteger(candidate.record_count)}</strong><small>{t.records}</small></span>
              <span className="repeat-identity"><strong>{candidate.vendor_name}</strong><small>{candidate.organism_name}</small></span>
              <span className="repeat-window"><strong>{candidate.same_normalized_subject ? t.sameSubject : t.mixedSubjects}</strong><small>{formatDate(candidate.date_start, language)} – {formatDate(candidate.date_end, language)}</small></span>
              <span className="repeat-total"><strong>{currency(candidate.total_amount_eur, true)}</strong><small>{t.publishedReference}: {currency(candidate.reference_eur)}</small></span>
              <a className="repeat-explorer-link" href={candidateExplorerUrl(candidate, language)} onClick={(event) => event.stopPropagation()} aria-label={t.explorePattern} title={t.explorePattern}><Search size={15} aria-hidden="true" /><span>{t.explorePattern}</span></a>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <EvidenceRows contracts={candidate.contracts} language={language} openSource={t.openSource} />
          </details>)}</div>}
        {orderedCandidates.length > 20 && <nav className="pagination signal-pagination" aria-label={t.candidateOrder}>
          <button disabled={currentIssuePage === 1} onClick={() => setIssuePage((value) => Math.max(1, value - 1))} title={t.previousPage} aria-label={t.previousPage}><ChevronLeft size={19} /></button>
          <span>{t.pageOf(currentIssuePage, issuePageCount)}</span>
          <button disabled={currentIssuePage === issuePageCount} onClick={() => setIssuePage((value) => Math.min(issuePageCount, value + 1))} title={t.nextPage} aria-label={t.nextPage}><ChevronRight size={19} /></button>
        </nav>}
      </div>}
      <div className="analysis-block repeat-analysis">
        <div className="analysis-block-heading"><h3>{t.repeatPatterns}</h3><p>{t.repeatPatternsNote}</p></div>
        {repeatClusters.length === 0
          ? <p className="empty-state repeat-empty">{t.noRepeatPatterns}</p>
          : <div className="repeat-clusters">{repeatClusters.slice(0, 20).map((cluster) => <details className="repeat-cluster" key={cluster.id}>
            <summary>
              <span className="repeat-count"><strong>{formatInteger(cluster.record_count)}</strong><small>{t.records}</small></span>
              <span className="repeat-identity"><strong>{cluster.subject}</strong><small>{cluster.vendor_name} · {cluster.organism_name}</small></span>
              <span className="repeat-window"><strong>{t.inDays(cluster.window_days)}</strong><small>{formatDate(cluster.date_start, language)} – {formatDate(cluster.date_end, language)}</small></span>
              <span className="repeat-total"><strong>{currency(cluster.total_amount_eur, true)}</strong><small>{t.amountRange}: {currency(cluster.minimum_amount_eur, true)} – {currency(cluster.maximum_amount_eur, true)}</small></span>
              <a className="repeat-explorer-link" href={repeatExplorerUrl(cluster, language)} onClick={(event) => event.stopPropagation()} aria-label={t.explorePattern} title={t.explorePattern}><Search size={15} aria-hidden="true" /><span>{t.explorePattern}</span></a>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className="repeat-evidence" aria-label={t.contractEvidence}>
              <p>{t.evidenceSample(cluster.contracts.length, cluster.record_count)}</p>
              {cluster.contracts.map((contract) => <article key={contract.record_id}>
                <time dateTime={contract.publication_date}>{formatDate(contract.publication_date, language)}</time>
                <span><strong>{contract.subject}</strong><small>{contract.vendor_name}</small></span>
                <b>{currency(contract.amount_eur)}</b>
                <a href={contract.source_url} target="_blank" rel="noreferrer" aria-label={t.openSource} title={t.openSource}><ExternalLink size={16} /></a>
              </article>)}
            </div>
          </details>)}</div>}
      </div>
      {contractSignals && <div className="analysis-block threshold-analysis">
        <div className="analysis-block-heading"><h3>{t.thresholdSignals}</h3><p>{t.thresholdSignalsNote}</p></div>
        <div className="reference-signals">{contractSignals.references.map((reference) => <article className="reference-signal" key={reference.id}>
          <header><strong>{currency(reference.published_reference_eur)}</strong><span>{t.publishedReference}</span></header>
          <details>
            <summary><strong>{formatInteger(reference.near_record_count)}</strong><span>{t.nearReference}</span></summary>
            <p>{t.shownEvidence(reference.near_contracts.length, reference.near_record_count)}</p>
            <EvidenceRows contracts={reference.near_contracts} language={language} openSource={t.openSource} />
          </details>
          <details>
            <summary><strong>{formatInteger(reference.at_or_above_record_count)}</strong><span>{t.atOrAboveReference}</span></summary>
            <p>{t.shownEvidence(reference.at_or_above_contracts.length, reference.at_or_above_record_count)}</p>
            <EvidenceRows contracts={reference.at_or_above_contracts} language={language} openSource={t.openSource} />
          </details>
        </article>)}</div>
      </div>}
    </>}

    {section === 'amounts' && <div className="analysis-block">
      <div className="analysis-block-heading"><h3>{t.amounts}</h3><p>{t.amountsNote}</p></div>
      <div className="analysis-two-column amount-layout">
        <div className="amount-bands">{scope.amounts.bands.map((item) => <div key={item.band}>
          <span><strong>{item.band} €</strong><small>{formatInteger(item.record_count)}</small></span>
          <i><b style={{ width: `${item.record_count / largestBand * 100}%` }} /></i>
        </div>)}</div>
        <div className="largest-contracts"><h4>{t.largest}</h4>{scope.amounts.largest_contracts.slice(0, 6).map((item) => <article key={item.record_id}>
          <div><strong>{item.subject || '—'}</strong><span>{item.vendor_name} · {item.organism_name}</span></div>
          <b>{currency(item.amount_eur)}</b>
          <a href={item.source_url} target="_blank" rel="noreferrer" aria-label={t.openSource} title={t.openSource}><ExternalLink size={16} /></a>
        </article>)}</div>
      </div>
    </div>}

    {section === 'organisms' && <>
      <div className="analysis-block category-analysis">
        <div className="analysis-block-heading"><h3>{t.organisms}</h3><p>{t.organismsNote}</p></div>
        <div className="category-bars">{scope.organisms.map((item) => <div key={item.id}>
          <span><strong>{item.name}</strong><small>{formatInteger(item.record_count)} {t.records}</small></span>
          <i><b style={{ width: `${Math.max(2, item.total_amount_eur / largestOrganism * 100)}%` }} /></i>
          <strong>{currency(item.total_amount_eur, true)}</strong>
        </div>)}</div>
      </div>
      <div className="analysis-block category-analysis">
        <div className="analysis-block-heading"><h3>{t.categories}</h3><p>{t.categoriesNote}</p></div>
        <div className="category-bars">{scope.categories.map((item) => <div key={item.id}>
          <span><strong>{language === 'es' ? categoryTranslations[item.name] ?? item.name : item.name}</strong><small>{formatInteger(item.record_count)} {t.records}</small></span>
          <i><b style={{ width: `${Math.max(2, item.total_amount_eur / largestCategory * 100)}%` }} /></i>
          <strong>{currency(item.total_amount_eur, true)}</strong>
        </div>)}</div>
      </div>
    </>}
  </section>;
}
