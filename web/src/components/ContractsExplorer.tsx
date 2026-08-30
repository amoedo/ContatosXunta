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
  X,
} from 'lucide-react';
import { matchesRepeatPattern, type RepeatPatternFilter } from '../lib/analysis';
import { withBase } from '../lib/basePath';
import { buildContractsCsv } from '../lib/contractsCsv';
import { formatEuro, formatInteger } from '../lib/format';
import { parseOrganismSelection, writeOrganismSelection } from '../lib/organismFilter';
import OrganismMultiSelect from './OrganismMultiSelect';

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

type SortOrder = '' | 'amount-desc' | 'amount-asc';

export function sortContracts<T extends Pick<ContractRecord, 'amount_eur' | 'publication_date' | 'source_id'>>(
  contracts: T[],
  sortOrder: SortOrder,
) {
  if (!sortOrder) return contracts;
  const direction = sortOrder === 'amount-desc' ? -1 : 1;
  return [...contracts].sort((left, right) =>
    direction * (left.amount_eur - right.amount_eur)
    || right.publication_date.localeCompare(left.publication_date)
    || right.source_id - left.source_id);
}

const copy = {
  gl: {
    kicker: 'Transparencia contractual',
    title: 'Contratos Xunta',
    subtitle: 'Adxudicacións publicadas pola Xunta baixo a clasificación de contratos menores, ordenadas para consultar e comparar.',
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
    noOrganisms: 'Ningún organismo',
    selectedOrganisms: (count: number) => `${count} organismos seleccionados`,
    selectAllOrganisms: 'Seleccionar todos',
    selectNoOrganisms: 'Deseleccionar todos',
    organismFilter: 'Organismos do explorador',
    sort: 'Ordenación',
    sourceOrder: 'Publicación máis recente',
    amountDescending: 'Importe: maior a menor',
    amountAscending: 'Importe: menor a maior',
    results: 'resultados',
    resultsIn: (period: string) => `en ${period}`,
    organismSeriesTotal: (count: string) => `${count} contratos na serie completa`,
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
    cumulativeSignals: 'Sinais de acumulación',
    cumulativeSignalsDetail: 'Agrúpanse dúas ou máis publicacións do mesmo organismo e adxudicatario nun máximo de 30 días cando cada importe está baixo 18.150 € ou 48.400 € e a suma alcanza esa referencia. A proximidade e o obxecto equivalente só priorizan a orde; son pistas de investigación, non conclusións xurídicas.',
    classificationTitle: 'Clasificación como «contrato menor»',
    classificationIntro: 'Os datos desta web reproducen a clasificación publicada polas fontes oficiais da Xunta. Esa clasificación non permite concluír por si soa cal foi o procedemento xurídico empregado en cada expediente.',
    classificationLaw: 'A Lei 9/2017 de Contratos do Sector Público establece con carácter xeral no seu artigo 118 que son contratos menores os de valor estimado inferior a 40.000 € en obras e a 15.000 € en subministracións ou servizos.',
    classificationSergas: 'Porén, a plataforma oficial de contratación da Xunta inclúe baixo a categoría de «contratos menores» operacións que superan estes importes. O caso é especialmente visible nos datos do SERGAS, onde aparecen rexistros superiores a 100.000 €.',
    classificationExplanation: 'Segundo explicou o SERGAS a Público, polo menos parte destes rexistros non serían contratos menores do artigo 118, senón facturacións asociadas a outras figuras, como autorizacións de uso de medios sanitarios alleos. O SERGAS atribúe a súa aparición nesta categoría á codificación como «gasto menor» no sistema contable e á posterior transmisión automatizada desa clasificación aos portais públicos.',
    classificationDispute: 'Público cuestiona aspectos desta explicación xurídica. Esta web non resolve esa controversia: analiza o que publica a Xunta e non determina de forma independente a cualificación legal de cada gasto.',
    classificationPrinciple: 'Contratos Xunta non interpreta automaticamente a etiqueta «contrato menor» como a cualificación xurídica definitiva da operación.',
    classificationDetermination: 'Para determinala sería necesario consultar o expediente, a súa base legal e a documentación contractual correspondente.',
    sources: 'Fontes',
    lawSource: 'Lei 9/2017 de Contratos do Sector Público — art. 118',
    sergasSource: 'Contratos Públicos de Galicia — Consellería de Sanidade / SERGAS — Contratos menores',
    publicoSource: 'Público — “La Xunta multiplica por cuatro desde 2022 los contratos ‘a dedo’ con los grandes grupos de la sanidad privada”',
    downloadCsv: 'Descargar CSV',
    questions: 'Comeza por unha pregunta',
    questionsNote: 'Escolle unha lectura ou abre directamente os contratos publicados.',
    whoReceives: 'Quen recibe máis?',
    howEvolves: 'Como evoluciona?',
    amountShape: 'Como se distribúen os importes?',
    searchContracts: 'Buscar contratos',
    repeatFilter: 'Filtro dunha alerta de repetición',
    repeatFilterNote: (vendor: string, dateStart: string, dateEnd: string) => `${vendor} · do ${dateStart} ao ${dateEnd}`,
    clearRepeatFilter: 'Quitar filtro da alerta',
  },
  es: {
    kicker: 'Transparencia contractual',
    title: 'Contratos Xunta',
    subtitle: 'Adjudicaciones publicadas por la Xunta bajo la clasificación de contratos menores, ordenadas para consultar y comparar.',
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
    noOrganisms: 'Ningún organismo',
    selectedOrganisms: (count: number) => `${count} organismos seleccionados`,
    selectAllOrganisms: 'Seleccionar todos',
    selectNoOrganisms: 'Deseleccionar todos',
    organismFilter: 'Organismos del explorador',
    sort: 'Ordenación',
    sourceOrder: 'Publicación más reciente',
    amountDescending: 'Importe: mayor a menor',
    amountAscending: 'Importe: menor a mayor',
    results: 'resultados',
    resultsIn: (period: string) => `en ${period}`,
    organismSeriesTotal: (count: string) => `${count} contratos en la serie completa`,
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
    cumulativeSignals: 'Señales de acumulación',
    cumulativeSignalsDetail: 'Se agrupan dos o más publicaciones del mismo organismo y adjudicatario en un máximo de 30 días cuando cada importe está bajo 18.150 € o 48.400 € y la suma alcanza esa referencia. La proximidad y el objeto equivalente solo priorizan el orden; son pistas de investigación, no conclusiones jurídicas.',
    classificationTitle: 'Clasificación como «contrato menor»',
    classificationIntro: 'Los datos de esta web reproducen la clasificación publicada por las fuentes oficiales de la Xunta. Esa clasificación no permite concluir por sí sola cuál fue el procedimiento jurídico utilizado en cada expediente.',
    classificationLaw: 'La Ley 9/2017 de Contratos del Sector Público establece con carácter general en su artículo 118 que son contratos menores los de valor estimado inferior a 40.000 € en obras y a 15.000 € en suministros o servicios.',
    classificationSergas: 'Sin embargo, la plataforma oficial de contratación de la Xunta incluye bajo la categoría de «contratos menores» operaciones que superan estos importes. El caso es especialmente visible en los datos del SERGAS, donde aparecen registros superiores a 100.000 €.',
    classificationExplanation: 'Según explicó el SERGAS a Público, al menos parte de estos registros no serían contratos menores del artículo 118, sino facturaciones asociadas a otras figuras, como autorizaciones de uso de medios sanitarios ajenos. El SERGAS atribuye su aparición en esta categoría a su codificación como «gasto menor» en el sistema contable y a la posterior transmisión automatizada de esa clasificación a los portales públicos.',
    classificationDispute: 'Público cuestiona aspectos de esta explicación jurídica. Esta web no resuelve esa controversia: analiza lo que publica la Xunta y no determina de forma independiente la calificación legal de cada gasto.',
    classificationPrinciple: 'Contratos Xunta no interpreta automáticamente la etiqueta «contrato menor» como la calificación jurídica definitiva de la operación.',
    classificationDetermination: 'Para determinarla sería necesario consultar el expediente, su base legal y la documentación contractual correspondiente.',
    sources: 'Fuentes',
    lawSource: 'Ley 9/2017 de Contratos del Sector Público — art. 118',
    sergasSource: 'Contratos Públicos de Galicia — Consellería de Sanidade / SERGAS — Contratos menores',
    publicoSource: 'Público — “La Xunta multiplica por cuatro desde 2022 los contratos ‘a dedo’ con los grandes grupos de la sanidad privada”',
    downloadCsv: 'Descargar CSV',
    questions: 'Empieza por una pregunta',
    questionsNote: 'Elige una lectura o abre directamente los contratos publicados.',
    whoReceives: '¿Quién recibe más?',
    howEvolves: '¿Cómo evoluciona?',
    amountShape: '¿Cómo se distribuyen los importes?',
    searchContracts: 'Buscar contratos',
    repeatFilter: 'Filtro de una alerta de repetición',
    repeatFilterNote: (vendor: string, dateStart: string, dateEnd: string) => `${vendor} · del ${dateStart} al ${dateEnd}`,
    clearRepeatFilter: 'Quitar filtro de la alerta',
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
  const [organismKeys, setOrganismKeys] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>('');
  const [repeatFilter, setRepeatFilter] = useState<RepeatPatternFilter | null>(null);
  const [page, setPage] = useState(1);
  const [urlReady, setUrlReady] = useState(false);
  const t = copy[language];
  const organisms = dashboard.organisms;
  const allOrganismIds = organisms.map((item) => String(item.organism_id));

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
        const repeatSubject = params.get('repeatSubject')?.trim() ?? '';
        const repeatVendor = params.get('repeatVendor')?.trim() ?? '';
        const dateStart = params.get('dateFrom') ?? '';
        const dateEnd = params.get('dateTo') ?? '';
        const validDateBounds = /^\d{4}-\d{2}-\d{2}$/.test(dateStart)
          && /^\d{4}-\d{2}-\d{2}$/.test(dateEnd) && dateStart <= dateEnd;
        setRepeatFilter(repeatSubject && repeatVendor && validDateBounds ? {
          subject: repeatSubject,
          label: params.get('repeatLabel')?.trim() || repeatSubject,
          vendor: repeatVendor,
          dateStart,
          dateEnd,
        } : null);
        setSearch(params.get('q') ?? '');
        setCategory(
          organisms.some((item) => item.category === requestedCategory) ? requestedCategory : '',
        );
        setOrganismKeys(parseOrganismSelection(params, allOrganismIds));
        const requestedSort = params.get('sort');
        setSortOrder(requestedSort === 'amount-desc' || requestedSort === 'amount-asc'
          ? requestedSort
          : '');
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
  const selectedOrganismIds = new Set(organismKeys);
  const filtered = contracts.filter((contract) => {
    const matchesSearch =
      !normalizedSearch ||
      `${contract.subject} ${contract.vendor_name} ${contract.organism_name}`
        .toLocaleLowerCase(language)
        .includes(normalizedSearch);
    const matchesRepeat = matchesRepeatPattern(contract, repeatFilter);
    return (
      matchesSearch &&
      matchesRepeat &&
      (!category || contract.category === category) &&
      selectedOrganismIds.has(String(contract.organism_id))
    );
  });
  const orderedContracts = sortContracts(filtered, sortOrder);
  const pageCount = Math.max(1, Math.ceil(orderedContracts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleContracts = orderedContracts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedOrganism = organismKeys.length === 1
    ? organisms.find((item) => String(item.organism_id) === organismKeys[0])
    : undefined;
  const resultPeriod = selectedMonth === 'all'
    ? String(selectedYear ?? '')
    : selectedMonth;
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
    writeOrganismSelection(params, organismKeys, allOrganismIds);
    setParam('sort', sortOrder, sortOrder.length > 0);
    setParam('repeatSubject', repeatFilter?.subject ?? '', repeatFilter !== null);
    setParam('repeatLabel', repeatFilter?.label ?? '', repeatFilter !== null);
    setParam('repeatVendor', repeatFilter?.vendor ?? '', repeatFilter !== null);
    setParam('dateFrom', repeatFilter?.dateStart ?? '', repeatFilter !== null);
    setParam('dateTo', repeatFilter?.dateEnd ?? '', repeatFilter !== null);
    setParam('page', String(currentPage), currentPage > 1);
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
    document.querySelectorAll<HTMLAnchorElement>('[data-analysis-route]').forEach((link) => {
      const destination = new URL(link.href);
      writeOrganismSelection(destination.searchParams, organismKeys, allOrganismIds);
      if (selectedYear !== null) destination.searchParams.set('year', String(selectedYear));
      link.href = destination.toString();
    });
  }, [category, currentPage, language, organismKeys, repeatFilter, search, selectedMonth, selectedYear, sortOrder, urlReady]);

  const downloadCsv = () => {
    if (loadState !== 'ready' || selectedYear === null || filtered.length === 0) return;
    const blob = new Blob([buildContractsCsv(orderedContracts, language)], {
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
            <div>
              <h2 id="explorer-title">{t.explorer}</h2>
              <p>
                {formatInteger(filtered.length)} {t.results} {t.resultsIn(resultPeriod)}
                {selectedOrganism && <> · {t.organismSeriesTotal(formatInteger(selectedOrganism.record_count))}</>}
              </p>
            </div>
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
            <div className="explorer-organism-filter">
              <span className="sr-only">{t.organismFilter}</span>
              <OrganismMultiSelect
                options={organisms.map((item) => ({ id: String(item.organism_id), name: item.name }))}
                selectedIds={organismKeys}
                onChange={(ids) => { setOrganismKeys(ids); setPage(1); }}
                label={t.organismFilter}
                allLabel={t.allOrganisms}
                noneLabel={t.noOrganisms}
                selectedLabel={t.selectedOrganisms}
                selectAllLabel={t.selectAllOrganisms}
                selectNoneLabel={t.selectNoOrganisms}
              />
            </div>
            <label>
              <span className="sr-only">{t.sort}</span>
              <select value={sortOrder} onChange={(event) => {
                setSortOrder(event.target.value as SortOrder);
                setPage(1);
              }}>
                <option value="">{t.sourceOrder}</option>
                <option value="amount-desc">{t.amountDescending}</option>
                <option value="amount-asc">{t.amountAscending}</option>
              </select>
            </label>
          </div>
          {repeatFilter && <aside className="explorer-alert-filter">
            <CircleAlert size={19} aria-hidden="true" />
            <div><strong>{t.repeatFilter}</strong><span>{repeatFilter.label}</span><small>{t.repeatFilterNote(repeatFilter.vendor, formatDate(repeatFilter.dateStart, language), formatDate(repeatFilter.dateEnd, language))}</small></div>
            <button type="button" onClick={() => { setRepeatFilter(null); setPage(1); }} title={t.clearRepeatFilter} aria-label={t.clearRepeatFilter}><X size={18} /></button>
          </aside>}

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
            <article>
              <Search size={20} aria-hidden="true" />
              <div><h3>{t.cumulativeSignals}</h3><p>{t.cumulativeSignalsDetail}</p></div>
            </article>
          </div>
          <aside className="classification-warning" aria-labelledby="classification-warning-title">
            <CircleAlert size={22} aria-hidden="true" />
            <div>
              <h3 id="classification-warning-title">{t.classificationTitle}</h3>
              <p>{t.classificationIntro}</p>
              <p>{t.classificationLaw}</p>
              <p>{t.classificationSergas}</p>
              <p>{t.classificationExplanation}</p>
              <p>{t.classificationDispute}</p>
              <p><strong>{t.classificationPrinciple}</strong> {t.classificationDetermination}</p>
              <div className="methodology-sources">
                <h4>{t.sources}</h4>
                <ul>
                  <li><a href="https://www.boe.es/buscar/act.php?id=BOE-A-2017-12902#a118" target="_blank" rel="noopener noreferrer">{t.lawSource}<ExternalLink size={14} aria-hidden="true" /></a></li>
                  <li><a href="https://www.contratosdegalicia.gal/consultaOrganismo.jsp?lang=gl&ID=800&N=11&OR=11&SORT=2&ORDER=2&S=CM#" target="_blank" rel="noopener noreferrer">{t.sergasSource}<ExternalLink size={14} aria-hidden="true" /></a></li>
                  <li><a href="https://www.publico.es/sociedad/sanidad/xunta-multiplica-cuatro-2022-contratos-dedo-grandes-grupos-sanidad-privada.html" target="_blank" rel="noopener noreferrer">{t.publicoSource}<ExternalLink size={14} aria-hidden="true" /></a></li>
                </ul>
              </div>
            </div>
          </aside>
        </section>}
    </div>
  );
}