import { useDeferredValue, useEffect, useState } from 'react';
import {
  Building2,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  ExternalLink,
  FileText,
  Landmark,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { withBase } from '../lib/basePath';
import { buildContractsCsv } from '../lib/contractsCsv';
import { formatEuro, formatInteger } from '../lib/format';

type Language = 'gl' | 'es';

type ContractRecord = {
  record_id: string;
  source_id: number;
  organism_id: number;
  publication_date: string;
  subject: string;
  amount_eur: number;
  vendor_name: string;
  duration: string;
  source_url: string;
  organism_name: string;
  category: string;
};

type OrganismSummary = {
  organism_id: number;
  name: string;
  category: string;
  profile_url: string;
  record_count: number;
  total_amount_eur: number;
};

type DashboardData = {
  record_count: number;
  total_amount_eur: number;
  organism_count: number;
  active_organism_count: number;
  window_count: number;
  earliest_publication_date: string | null;
  latest_publication_date: string | null;
  organisms: OrganismSummary[];
};

type ExplorerShard = {
  path: string;
  record_count: number;
  byte_size: number;
  sha256: string;
  date_start: string;
  date_end: string;
};

type ExplorerYear = {
  year: number;
  record_count: number;
  total_amount_eur: number;
  shards: ExplorerShard[];
  months: Array<{
    month: string;
    record_count: number;
    total_amount_eur: number;
    shards: ExplorerShard[];
  }>;
};

type ExplorerManifest = {
  total_available: number;
  historical_total: number;
  detail_months: number;
  max_shard_bytes: number;
  years: ExplorerYear[];
};

const copy = {
  gl: {
    kicker: 'Transparencia contractual',
    title: 'Contratos Xunta',
    subtitle: 'Contratos menores do sector público autonómico, ordenados para consultar e comparar.',
    updated: 'Datos publicados',
    contracts: 'Contratos',
    amount: 'Importe adxudicado',
    organisms: 'Organismos',
    active: 'Con actividade',
    distribution: 'Distribución por organismo',
    distributionNote: 'Maiores importes na selección publicada',
    explorer: 'Explorar contratos',
    search: 'Buscar por obxecto, adxudicatario ou organismo',
    allCategories: 'Todas as categorías',
    allOrganisms: 'Todos os organismos',
    results: 'resultados',
    detailCoverage: (months: number) => `detalle dos últimos ${months} meses`,
    subject: 'Obxecto',
    vendor: 'Adxudicatario',
    organism: 'Organismo',
    date: 'Data',
    value: 'Importe',
    source: 'Abrir na fonte oficial',
    previous: 'Páxina anterior',
    next: 'Páxina seguinte',
    page: 'Páxina',
    of: 'de',
    empty: 'Non hai contratos que coincidan cos filtros.',
    coverage: 'Cobertura desta edición',
    loading: 'Cargando contratos…',
    loadError: 'Non foi posible cargar os contratos.',
    allYears: 'Ano',
    allMonths: 'Todo o ano',
    month: 'Mes',
    loadingProgress: 'Cargando lote',
    methodology: 'Metodoloxía e calidade',
    methodologyNote: 'Que inclúe esta edición e como interpretar os datos',
    curatedScope: 'Ámbito institucional curado',
    curatedScopeDetail: 'organismos enlazados desde o portal de Transparencia da Xunta.',
    dateCoverage: 'Cobertura por data de publicación',
    dateCoverageDetail: 'xanelas de datos validadas mediante reconto coa fonte.',
    privacy: 'Privacidade por deseño',
    privacyDetail: 'Os identificadores fiscais non se publican nin se conservan nos artefactos canónicos.',
    limitations: 'Límites da fonte',
    limitationsDetail: 'Non se infiren licitadores, competencia nin procedemento cando a fonte non ofrece eses campos.',
    publicationNote: 'As datas corresponden á publicación do contrato, non necesariamente á súa execución. O explorador conserva o detalle recente; os anos pechados incorpóranse como resumos analíticos e arquivos anuais descargables.',
    downloadCsv: 'Descargar CSV',
    questions: 'Comeza por unha pregunta',
    questionsNote: 'Escolle unha lectura ou abre directamente os contratos publicados.',
    whoReceives: 'Quen recibe máis?',
    howEvolves: 'Como evoluciona?',
    amountShape: 'Como se distribúen os importes?',
    searchContracts: 'Buscar contratos',
  },
  es: {
    kicker: 'Transparencia contractual',
    title: 'Contratos Xunta',
    subtitle: 'Contratos menores del sector público autonómico, ordenados para consultar y comparar.',
    updated: 'Datos publicados',
    contracts: 'Contratos',
    amount: 'Importe adjudicado',
    organisms: 'Organismos',
    active: 'Con actividad',
    distribution: 'Distribución por organismo',
    distributionNote: 'Mayores importes en la selección publicada',
    explorer: 'Explorar contratos',
    search: 'Buscar por objeto, adjudicatario u organismo',
    allCategories: 'Todas las categorías',
    allOrganisms: 'Todos los organismos',
    results: 'resultados',
    detailCoverage: (months: number) => `detalle de los últimos ${months} meses`,
    subject: 'Objeto',
    vendor: 'Adjudicatario',
    organism: 'Organismo',
    date: 'Fecha',
    value: 'Importe',
    source: 'Abrir en la fuente oficial',
    previous: 'Página anterior',
    next: 'Página siguiente',
    page: 'Página',
    of: 'de',
    empty: 'No hay contratos que coincidan con los filtros.',
    coverage: 'Cobertura de esta edición',
    loading: 'Cargando contratos…',
    loadError: 'No fue posible cargar los contratos.',
    allYears: 'Año',
    allMonths: 'Todo el año',
    month: 'Mes',
    loadingProgress: 'Cargando lote',
    methodology: 'Metodología y calidad',
    methodologyNote: 'Qué incluye esta edición y cómo interpretar los datos',
    curatedScope: 'Ámbito institucional curado',
    curatedScopeDetail: 'organismos enlazados desde el portal de Transparencia de la Xunta.',
    dateCoverage: 'Cobertura por fecha de publicación',
    dateCoverageDetail: 'ventanas de datos validadas mediante recuento con la fuente.',
    privacy: 'Privacidad desde el diseño',
    privacyDetail: 'Los identificadores fiscales no se publican ni se conservan en los artefactos canónicos.',
    limitations: 'Límites de la fuente',
    limitationsDetail: 'No se infieren licitadores, competencia ni procedimiento cuando la fuente no ofrece esos campos.',
    publicationNote: 'Las fechas corresponden a la publicación del contrato, no necesariamente a su ejecución. El explorador conserva el detalle reciente; los años cerrados se incorporan como resúmenes analíticos y archivos anuales descargables.',
    downloadCsv: 'Descargar CSV',
    questions: 'Empieza por una pregunta',
    questionsNote: 'Elige una lectura o abre directamente los contratos publicados.',
    whoReceives: '¿Quién recibe más?',
    howEvolves: '¿Cómo evoluciona?',
    amountShape: '¿Cómo se distribuyen los importes?',
    searchContracts: 'Buscar contratos',
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

const pageSize = 20;
const monthNames: Record<Language, string[]> = {
  gl: ['xan.', 'feb.', 'mar.', 'abr.', 'maio', 'xuño', 'xul.', 'ago.', 'set.', 'out.', 'nov.', 'dec.'],
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'],
};

function formatCurrency(value: number, compact = false) {
  return formatEuro(value, compact);
}

export function formatDate(value: string | null, language: Language) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return `${day} ${monthNames[language][month - 1]} ${year}`;
}

export default function ContractsExplorer({
  dashboard,
  view = 'home',
}: {
  dashboard: DashboardData;
  view?: 'home' | 'explorer' | 'methodology';
}) {
  const [language, setLanguage] = useState<Language>('gl');
  const [manifest, setManifest] = useState<ExplorerManifest | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadedShards, setLoadedShards] = useState(0);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState('');
  const [organism, setOrganism] = useState('');
  const [page, setPage] = useState(1);
  const [urlReady, setUrlReady] = useState(false);
  const t = copy[language];
  const organisms = dashboard.organisms;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setLanguage(document.documentElement.lang === 'es' ? 'es' : 'gl');
    if (view !== 'explorer') {
      setLoadState('ready');
      return;
    }
    const controller = new AbortController();
    fetch(withBase('/data/explorer/manifest.json'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((payload: ExplorerManifest) => {
        setManifest(payload);
        const latestYear = payload.years[0]?.year ?? null;
        const latestYearMetadata = payload.years[0];
        const requestedYear = Number(params.get('year'));
        const requestedMonth = params.get('month') ?? '';
        const requestedPage = Number(params.get('page'));
        const requestedCategory = params.get('category') ?? '';
        const requestedOrganism = params.get('organism') ?? '';
        setSearch(params.get('q') ?? '');
        setCategory(
          organisms.some((item) => item.category === requestedCategory) ? requestedCategory : '',
        );
        setOrganism(
          organisms.some((item) => String(item.organism_id) === requestedOrganism)
            ? requestedOrganism
            : '',
        );
        setPage(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
        const resolvedYear = payload.years.find((item) => item.year === requestedYear)
          ?? latestYearMetadata;
        setSelectedYear(resolvedYear?.year ?? latestYear);
        setSelectedMonth(
          requestedMonth === 'all' || resolvedYear?.months.some((item) => item.month === requestedMonth)
            ? requestedMonth
            : resolvedYear?.months[0]?.month ?? '',
        );
        setUrlReady(true);
        if (latestYear === null) setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadState('error');
      });
    return () => controller.abort();
  }, [organisms, view]);

  useEffect(() => {
    if (!manifest || selectedYear === null || !selectedMonth) return;
    const year = manifest.years.find((item) => item.year === selectedYear);
    if (!year) return;
    const shards = selectedMonth === 'all'
      ? year.shards
      : year.months.find((item) => item.month === selectedMonth)?.shards ?? [];
    const controller = new AbortController();
    setContracts([]);
    setLoadedShards(0);
    setLoadState('loading');

    const loadYear = async () => {
      const loadedRecords: ContractRecord[] = [];
      for (const [index, shard] of shards.entries()) {
        const response = await fetch(withBase(`/data/${shard.path}`), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as { records: ContractRecord[] };
        loadedRecords.push(...payload.records);
        setContracts([...loadedRecords]);
        setLoadedShards(index + 1);
      }
      setLoadState('ready');
    };

    loadYear().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setLoadState('error');
    });
    return () => controller.abort();
  }, [manifest, selectedMonth, selectedYear]);

  const categories = [...new Set(organisms.map((item) => item.category))].sort((a, b) =>
    a.localeCompare(b, language),
  );
  const normalizedSearch = deferredSearch.trim().toLocaleLowerCase(language);
  const filtered = contracts.filter((contract) => {
    const matchesSearch =
      !normalizedSearch ||
      `${contract.subject} ${contract.vendor_name} ${contract.organism_name}`
        .toLocaleLowerCase(language)
        .includes(normalizedSearch);
    return (
      matchesSearch &&
      (!category || contract.category === category) &&
      (!organism || String(contract.organism_id) === organism)
    );
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleContracts = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const topOrganisms = [...organisms]
    .filter((item) => item.total_amount_eur > 0)
    .sort((a, b) => b.total_amount_eur - a.total_amount_eur)
    .slice(0, 6);
  const largestAmount = topOrganisms[0]?.total_amount_eur ?? 1;

  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const yearMetadata = manifest?.years.find((item) => item.year === selectedYear);
  const selectedShards = selectedMonth === 'all'
    ? yearMetadata?.shards ?? []
    : yearMetadata?.months.find((item) => item.month === selectedMonth)?.shards ?? [];
  useEffect(() => {
    if (!urlReady || selectedYear === null) return;
    const params = new URLSearchParams(window.location.search);
    const setParam = (key: string, value: string, include: boolean) => {
      if (include) params.set(key, value);
      else params.delete(key);
    };
    setParam('lang', language, language !== 'gl');
    setParam('year', String(selectedYear), true);
    setParam('month', selectedMonth, selectedMonth.length > 0);
    setParam('q', search, search.length > 0);
    setParam('category', category, category.length > 0);
    setParam('organism', organism, organism.length > 0);
    setParam('page', String(currentPage), currentPage > 1);
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, [category, currentPage, language, organism, search, selectedMonth, selectedYear, urlReady]);

  const downloadCsv = () => {
    if (loadState !== 'ready' || selectedYear === null || filtered.length === 0) return;
    const blob = new Blob([buildContractsCsv(filtered, language)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contratos-xunta-${selectedMonth === 'all' ? selectedYear : selectedMonth}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`page-view page-view-${view}`}>
      {view === 'home' && <>
        <section className="intro-band" aria-labelledby="page-title">
          <div className="intro-copy">
            <p className="kicker">{t.kicker}</p>
            <h1 id="page-title">{t.title}</h1>
            <p className="intro-text">{t.subtitle}</p>
          </div>
          <div className="coverage-stamp">
            <span>{t.coverage}</span>
            <strong>{formatDate(dashboard.latest_publication_date, language)}</strong>
            <small>{dashboard.window_count} {language === 'gl' ? 'xanelas validadas' : 'ventanas validadas'}</small>
          </div>
        </section>

        <section className="metrics" aria-label={language === 'gl' ? 'Resumo' : 'Resumen'}>
          <article>
            <span className="metric-icon blue"><FileText size={20} /></span>
            <div><strong>{formatInteger(dashboard.record_count)}</strong><span>{t.contracts}</span></div>
          </article>
          <article>
            <span className="metric-icon coral"><WalletCards size={20} /></span>
            <div><strong>{formatCurrency(dashboard.total_amount_eur, true)}</strong><span>{t.amount}</span></div>
          </article>
          <article>
            <span className="metric-icon gold"><Landmark size={20} /></span>
            <div><strong>{dashboard.organism_count}</strong><span>{t.organisms}</span></div>
          </article>
          <article>
            <span className="metric-icon green"><Building2 size={20} /></span>
            <div><strong>{dashboard.active_organism_count}</strong><span>{t.active}</span></div>
          </article>
        </section>

        <section className="question-links" aria-labelledby="questions-title">
          <div className="section-heading">
            <div><h2 id="questions-title">{t.questions}</h2><p>{t.questionsNote}</p></div>
          </div>
          <div className="question-grid">
            <a href={withBase('/adjudicatarios')}><Users size={20} /><strong>{t.whoReceives}</strong></a>
            <a href={withBase('/evolucion')}><TrendingUp size={20} /><strong>{t.howEvolves}</strong></a>
            <a href={withBase('/importes')}><WalletCards size={20} /><strong>{t.amountShape}</strong></a>
            <a href={withBase('/explorador')}><Search size={20} /><strong>{t.searchContracts}</strong></a>
          </div>
        </section>

        <section className="distribution" aria-labelledby="distribution-title">
          <div className="section-heading">
            <div><h2 id="distribution-title">{t.distribution}</h2><p>{t.distributionNote}</p></div>
            <span>{t.updated}: {formatDate(dashboard.latest_publication_date, language)}</span>
          </div>
          <div className="bar-list">
            {topOrganisms.map((item, index) => (
              <div className="bar-row" key={item.organism_id}>
                <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="bar-name" title={item.name}>{item.name}</span>
                <div className="bar-track"><span style={{ width: `${Math.max(3, item.total_amount_eur / largestAmount * 100)}%` }} /></div>
                <strong>{formatCurrency(item.total_amount_eur, true)}</strong>
              </div>
            ))}
          </div>
        </section>
      </>}

        {view === 'explorer' && <section className="explorer" aria-labelledby="explorer-title">
          <div className="section-heading explorer-heading">
            <div><h2 id="explorer-title">{t.explorer}</h2><p>{formatInteger(filtered.length)} {t.results} · {t.detailCoverage(manifest?.detail_months ?? 24)}</p></div>
            <button
              type="button"
              className="download-button"
              disabled={loadState !== 'ready' || filtered.length === 0}
              onClick={downloadCsv}
            >
              <Download size={17} aria-hidden="true" />
              {t.downloadCsv}
            </button>
          </div>
          <div className="filters">
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">{t.search}</span>
              <input
                type="search"
                value={search}
                placeholder={t.search}
                onChange={(event) => changeFilter(setSearch, event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">{t.allYears}</span>
              <select
                value={selectedYear ?? ''}
                disabled={!manifest}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);
                  setSelectedYear(nextYear);
                  const year = manifest?.years.find((item) => item.year === nextYear);
                  setSelectedMonth(year?.months[0]?.month ?? '');
                  setPage(1);
                }}
              >
                {!manifest && <option value="">{t.allYears}</option>}
                {manifest?.years.map((item) => (
                  <option value={item.year} key={item.year}>
                    {item.year} · {formatInteger(item.record_count)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t.month}</span>
              <select
                value={selectedMonth}
                disabled={!yearMetadata}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">{t.allMonths}</option>
                {yearMetadata?.months.map((item) => (
                  <option value={item.month} key={item.month}>
                    {item.month} · {formatInteger(item.record_count)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t.allCategories}</span>
              <select value={category} onChange={(event) => changeFilter(setCategory, event.target.value)}>
                <option value="">{t.allCategories}</option>
                {categories.map((item) => <option value={item} key={item}>{language === 'es' ? categoryTranslations[item] ?? item : item}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">{t.allOrganisms}</span>
              <select value={organism} onChange={(event) => changeFilter(setOrganism, event.target.value)}>
                <option value="">{t.allOrganisms}</option>
                {organisms.map((item) => <option value={item.organism_id} key={item.organism_id}>{item.name}</option>)}
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>{t.subject}</th><th>{t.vendor}</th><th>{t.organism}</th><th>{t.date}</th><th className="numeric">{t.value}</th><th><span className="sr-only">{t.source}</span></th></tr></thead>
              <tbody>
                {visibleContracts.map((contract) => (
                  <tr key={contract.record_id}>
                    <td data-label={t.subject}><strong>{contract.subject || '—'}</strong><small>#{contract.source_id}</small></td>
                    <td data-label={t.vendor}>{contract.vendor_name || '—'}</td>
                    <td data-label={t.organism}><span className="organism-cell">{contract.organism_name}</span></td>
                    <td data-label={t.date}>{formatDate(contract.publication_date, language)}</td>
                    <td data-label={t.value} className="numeric amount-cell">{formatCurrency(contract.amount_eur)}</td>
                    <td className="source-cell"><a href={contract.source_url} target="_blank" rel="noreferrer" title={t.source} aria-label={t.source}><ExternalLink size={17} /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loadState === 'loading' && (
              <p className="empty-state">
                {selectedShards.length > 1
                  ? `${t.loadingProgress} ${Math.min(loadedShards + 1, selectedShards.length)} ${t.of} ${selectedShards.length}`
                  : t.loading}
              </p>
            )}
            {loadState === 'error' && <p className="empty-state error-state">{t.loadError}</p>}
            {loadState === 'ready' && visibleContracts.length === 0 && <p className="empty-state">{t.empty}</p>}
          </div>

          <nav className="pagination" aria-label={language === 'gl' ? 'Paxinación' : 'Paginación'}>
            <button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} title={t.previous} aria-label={t.previous}><ChevronLeft size={19} /></button>
            <span>{t.page} <strong>{currentPage}</strong> {t.of} {pageCount}</span>
            <button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} title={t.next} aria-label={t.next}><ChevronRight size={19} /></button>
          </nav>
        </section>}

        {view === 'methodology' && <section className="methodology" aria-labelledby="methodology-title">
          <div className="section-heading">
            <div><h2 id="methodology-title">{t.methodology}</h2><p>{t.methodologyNote}</p></div>
          </div>
          <div className="quality-list">
            <article>
              <Database size={20} aria-hidden="true" />
              <div><h3>{t.curatedScope}</h3><p><strong>{dashboard.organism_count}</strong> {t.curatedScopeDetail}</p></div>
            </article>
            <article>
              <CalendarRange size={20} aria-hidden="true" />
              <div><h3>{t.dateCoverage}</h3><p>{formatDate(dashboard.earliest_publication_date, language)} – {formatDate(dashboard.latest_publication_date, language)} · <strong>{dashboard.window_count}</strong> {t.dateCoverageDetail}</p></div>
            </article>
            <article>
              <ShieldCheck size={20} aria-hidden="true" />
              <div><h3>{t.privacy}</h3><p>{t.privacyDetail}</p></div>
            </article>
            <article>
              <CircleAlert size={20} aria-hidden="true" />
              <div><h3>{t.limitations}</h3><p>{t.limitationsDetail} {t.publicationNote}</p></div>
            </article>
          </div>
        </section>}
    </div>
  );
}